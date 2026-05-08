import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { pgPoolConfig } from "./connection-url";

const { Pool } = pg;

export const pool = new Pool(pgPoolConfig);
export const db = drizzle(pool, { schema });

export * from "./schema";
