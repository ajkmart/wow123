import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    include: ["src/tests/**/*.test.ts"],
    reporters: ["verbose"],
  },
});
