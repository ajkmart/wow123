import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: "dist/index.mjs",
  format: "esm",
  sourcemap: true,
  external: ["pg", "pg-native", "drizzle-orm", "bcrypt", "sharp", "canvas"],
  logLevel: "info",
});
