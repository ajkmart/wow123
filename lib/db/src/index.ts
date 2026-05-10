import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { pgPoolConfig } from "./connection-url";

const { Pool } = pg;

export const pool = new Pool({
  ...pgPoolConfig,
  max: parseInt(process.env.DB_POOL_MAX ?? "10"),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
