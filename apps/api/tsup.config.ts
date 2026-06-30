import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  clean: true,
  noExternal: ["@lead-gen/eligibility", "@lead-gen/jobs", "@lead-gen/policy", "@lead-gen/shared"],
  target: "node22",
});
