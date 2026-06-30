import { existsSync } from "node:fs";
import { resolve } from "node:path";

import cookie from "@fastify/cookie";
import staticPlugin from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";

import { defaultLaunchFlags, policyVersion } from "@lead-gen/policy";
import { JobTransitionError } from "@lead-gen/jobs";
import type { Environment } from "@lead-gen/shared";

import type { DatabasePool } from "./db.js";
import { registerApiRoutes } from "./routes.js";
import { getRuntimeSettings } from "./runtime-settings.js";

type BuildAppOptions = {
  environment?: Environment;
  pool?: DatabasePool;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const webRoot = resolve(process.cwd(), "apps/web/dist");

  app.register(cookie);

  if (options.environment && options.pool) {
    registerApiRoutes(app, options.pool, options.environment);
  }

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/readiness", async () => {
    const settings = options.pool && options.environment
      ? await getRuntimeSettings(options.pool, options.environment)
      : null;
    return {
      status: options.pool ? "usable_mvp" : "foundation_only",
      policyVersion,
      launchFlags: settings
        ? {
            liveCollectionEnabled: settings.liveCollectionEnabled,
            productionExportsEnabled: settings.productionExportsEnabled,
          }
        : defaultLaunchFlags,
      companiesHouseConfigured: settings?.companiesHouseConfigured ?? false,
    };
  });

  if (existsSync(webRoot)) {
    app.register(staticPlugin, {
      root: webRoot,
      prefix: "/",
      wildcard: false,
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (
        request.method === "GET" &&
        !request.url.startsWith("/api/") &&
        !request.url.startsWith("/health") &&
        !request.url.startsWith("/readiness")
      ) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({
        message: `Route ${request.method}:${request.url} not found`,
        error: "Not Found",
        statusCode: 404,
      });
    });
  } else {
    app.get("/", async () => ({
      message: "Lead Gen V2 web build not found. Run corepack pnpm build.",
      health: "/health",
      readiness: "/readiness",
    }));
  }

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        message: "Invalid request",
        issues: error.issues,
      });
    }
    if (error instanceof JobTransitionError) {
      return reply.code(409).send({ message: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({ message: "Unexpected server error" });
  });

  return app;
}
