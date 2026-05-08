/**
 * Migration wrapper — runs drizzle-kit migrate via the @workspace/db package.
 * Handles the case where the schema was already applied (idempotent — exits 0).
 *
 * Usage (from workspace root):
 *   pnpm db:migrate
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("[db:migrate] Running Drizzle migrations…");

try {
  const result = execSync(
    "pnpm --filter @workspace/db migrate",
    { cwd: path.resolve(__dirname, ".."), stdio: "pipe", encoding: "utf8" }
  );
  console.log("[db:migrate] ✅ Migrations applied successfully:");
  console.log(result);
} catch (err) {
  const msg = String(err.stderr || err.stdout || err.message || err);

  const alreadyApplied =
    msg.includes("already exists") ||
    msg.includes("No migrations to run") ||
    msg.includes("nothing to migrate");

  if (alreadyApplied) {
    console.log("[db:migrate] ✅ Schema already up-to-date — no migrations needed.");
    process.exit(0);
  }

  console.error("[db:migrate] ❌ Migration failed:\n" + msg);
  process.exit(1);
}
