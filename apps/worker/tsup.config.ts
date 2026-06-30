import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/worker.ts"],
  format: ["esm"],
  clean: true,
  noExternal: ["@lead-gen/jobs", "@lead-gen/shared"],
  target: "node22",
});
