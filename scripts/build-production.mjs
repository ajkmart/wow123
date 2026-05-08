import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function run(label, command, args, env = {}) {
  console.log(`\n${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

loadEnvFile();

if (!process.env.NEON_DATABASE_URL && !process.env.APP_DATABASE_URL && !process.env.DATABASE_URL) {
  console.error("Set NEON_DATABASE_URL, APP_DATABASE_URL, or DATABASE_URL before building.");
  process.exit(1);
}

run("Building API server", "pnpm", ["--filter", "@workspace/api-server", "build"], {
  NODE_ENV: "production",
});
run("Building admin panel", "pnpm", ["--filter", "@workspace/admin", "build"], {
  NODE_ENV: "production",
  PORT: process.env.ADMIN_PORT || "5173",
  BASE_PATH: "/admin/",
});
run("Building vendor app", "pnpm", ["--filter", "@workspace/vendor-app", "build"], {
  NODE_ENV: "production",
  PORT: process.env.VENDOR_PORT || "5174",
  BASE_PATH: "/vendor/",
});
run("Building rider app", "pnpm", ["--filter", "@workspace/rider-app", "build"], {
  NODE_ENV: "production",
  PORT: process.env.RIDER_PORT || "5175",
  BASE_PATH: "/rider/",
});

if (process.env.SKIP_MOBILE_BUILD !== "1") {
  run("Building customer mobile web", "pnpm", ["--filter", "@workspace/ajkmart", "build"], {
    NODE_ENV: "production",
    BASE_PATH: "/",
    EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN || process.env.AJKMART_DOMAIN || "localhost",
  });
}

console.log("\nProduction build complete.");