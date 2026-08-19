import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/google.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
});
