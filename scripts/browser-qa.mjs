import { createHash, randomBytes } from "node:crypto";

import pg from "../apps/api/node_modules/pg/lib/index.js";
import { chromium } from "playwright";

const baseUrl = process.env.QA_URL ?? "http://192.168.1.207:30156";
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://leadgen:leadgen@localhost:55432/leadgen";
const pool = new pg.Pool({ connectionString: databaseUrl });
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token.trim().toLowerCase()).digest("hex");
const user = (await pool.query("select id from users order by created_at limit 1")).rows[0];

if (!user) throw new Error("Browser QA requires an existing owner account");

await pool.query(
  "insert into user_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '15 minutes')",
  [user.id, tokenHash],
);

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium-browser",
  headless: true,
});

async function captureAuthenticated(viewport, path, output) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{
    name: "lead_gen_session",
    value: token,
    url: baseUrl,
    httpOnly: true,
    sameSite: "Strict",
  }]);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: output, fullPage: true });
  const result = {
    title: await page.title(),
    heading: await page.locator("h1").first().textContent(),
    errors,
  };
  await context.close();
  return result;
}

async function capturePublic(viewport, path, output) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: output, fullPage: true });
  const result = { heading: await page.locator("h1").first().textContent() };
  await page.close();
  return result;
}

try {
  const [desktop, mobile, login, rights] = await Promise.all([
    captureAuthenticated({ width: 1440, height: 1000 }, "/", "tmp/qa-dashboard-desktop.png"),
    captureAuthenticated({ width: 390, height: 844 }, "/campaigns", "tmp/qa-campaigns-mobile.png"),
    capturePublic({ width: 1440, height: 1000 }, "/", "tmp/qa-login-desktop.png"),
    capturePublic({ width: 390, height: 844 }, "/rights", "tmp/qa-rights-mobile.png"),
  ]);
  console.log(JSON.stringify({ desktop, mobile, login, rights }, null, 2));
} finally {
  await browser.close();
  await pool.query("delete from user_sessions where token_hash = $1", [tokenHash]);
  await pool.end();
}
