import { environmentSchema } from "@lead-gen/shared";

import { buildApp } from "./app.js";
import { createPool } from "./db.js";

const environment = environmentSchema.parse(process.env);
const pool = createPool(environment.DATABASE_URL);
const app = buildApp({ environment, pool });

await app.listen({
  host: environment.API_HOST,
  port: environment.API_PORT,
});

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
