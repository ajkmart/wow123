import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/connection-url";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
