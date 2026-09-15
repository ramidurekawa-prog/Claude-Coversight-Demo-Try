import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  // Bundle workspace packages (they ship TS source); npm deps stay external.
  noExternal: [/^@streamline\//],
});
