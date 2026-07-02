import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import type { FastifyReply, FastifyRequest } from "fastify";

import type { DatabasePool } from "./db.js";

const scrypt = promisify(scryptCallback);
export const sessionCookieName = "lead_gen_session";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function decodeAccessJwtEmail(token: string): string | null {
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (!payloadPart) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { email?: unknown };
    return typeof payload.email === "string" && payload.email.trim() ? payload.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function headerValue(request: FastifyRequest, name: string): string | null {
  const sources = [request.headers, request.raw.headers];
  const entry = sources.flatMap((source) => Object.entries(source)).find(([key]) => key.toLowerCase() === name);
  const value = Array.isArray(entry?.[1]) ? entry?.[1][0] : entry?.[1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getAccessEmail(request: FastifyRequest): string | null {
  const headerToken = headerValue(request, "cf-access-jwt-assertion");
  if (headerToken) {
    const email = decodeAccessJwtEmail(headerToken);
    if (email) return email;
  }

  const cookies = request.cookies as Record<string, unknown>;
  const cookieToken = cookies.CF_Authorization ?? cookies.cf_authorization;
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    const email = decodeAccessJwtEmail(cookieToken.trim());
    if (email) return email;
  }

  const fallbackEmail = headerValue(request, "cf-access-authenticated-user-email");
  return fallbackEmail ? fallbackEmail.toLowerCase() : null;
}

export async function createSession(
  pool: DatabasePool,
  userId: string,
  reply: FastifyReply,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashIdentifier(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    `insert into user_sessions (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
  reply.setCookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    expires: expiresAt,
  });
}

export type AuthContext = {
  userId: string;
  email: string;
  organisationId: string;
  organisationName: string;
  role: string;
  organisationApproved: boolean;
};

export async function getAuthContext(
  pool: DatabasePool,
  request: FastifyRequest,
): Promise<AuthContext | null> {
  const token = request.cookies[sessionCookieName];
  if (token) {
    const result = await pool.query<AuthContext>(
      `select
         u.id as "userId",
         u.email,
         o.id as "organisationId",
         o.name as "organisationName",
         m.role,
         o.approved as "organisationApproved"
       from user_sessions s
       join users u on u.id = s.user_id
       join organisation_memberships m on m.user_id = u.id
       join organisations o on o.id = m.organisation_id
       where s.token_hash = $1 and s.expires_at > now() and o.suspended_at is null
       limit 1`,
      [hashIdentifier(token)],
    );
    if (result.rows[0]) return result.rows[0];
  }

  const accessEmail = getAccessEmail(request);
  if (!accessEmail) return null;
  const accessResult = await pool.query<AuthContext>(
    `select
       u.id as "userId",
       u.email,
       o.id as "organisationId",
       o.name as "organisationName",
       m.role,
       o.approved as "organisationApproved"
     from users u
     join organisation_memberships m on m.user_id = u.id
     join organisations o on o.id = m.organisation_id
     where lower(u.email) = $1 and o.suspended_at is null
     limit 1`,
    [accessEmail],
  );
  return accessResult.rows[0] ?? null;
}

export async function destroySession(
  pool: DatabasePool,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[sessionCookieName];
  if (token) {
    await pool.query("delete from user_sessions where token_hash = $1", [
      hashIdentifier(token),
    ]);
  }
  reply.clearCookie(sessionCookieName, { path: "/" });
}
