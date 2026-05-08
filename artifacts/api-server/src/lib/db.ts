import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@workspace/db/schema";
import { buildPgPoolConfig } from "@workspace/db/connection-url";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}
console.log("✅ DB URL loaded (length:", databaseUrl.length, ")");

const pool = new Pool(buildPgPoolConfig(databaseUrl));
export const db = drizzle(pool, { schema });
export { pool };
