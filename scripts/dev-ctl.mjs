#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const services = {
  api: {
    filter: "@workspace/api-server",
    script: "dev",
    env: { PORT: "8080", NODE_ENV: "development" },
    label: "API server",
  },
  admin: {
    filter: "@workspace/admin",
    script: "dev",
    env: { PORT: "5173", HOST: "0.0.0.0", BASE_PATH: "/admin/", VITE_API_PROXY_TARGET: "http://127.0.0.1:5000" },
    label: "Admin web",
  },
  vendor: {
    filter: "@workspace/vendor-app",
    script: "dev",
    env: { PORT: "5174", HOST: "0.0.0.0", BASE_PATH: "/vendor/", VITE_API_PROXY_TARGET: "http://127.0.0.1:5000" },
    label: "Vendor web",
  },
  rider: {
    filter: "@workspace/rider-app",
    script: "dev",
    env: { PORT: "5175", HOST: "0.0.0.0", BASE_PATH: "/rider/", VITE_API_PROXY_TARGET: "http://127.0.0.1:5000" },
    label: "Rider web",
  },
  ajkmart: {
    filter: "@workspace/ajkmart",
    script: "dev:web",
    env: {
      PORT: "19006",
      BASE_PATH: "/",
      EXPO_PUBLIC_DOMAIN: "127.0.0.1:8080",
      REPLIT_DEV_DOMAIN: "127.0.0.1:8080",
      REPLIT_EXPO_DEV_DOMAIN: "127.0.0.1:8080",
      REPL_ID: process.env.REPL_ID || "local",
    },
    label: "AJKMart Expo web",
  },
  sandbox: {
    filter: "@workspace/mockup-sandbox",
    script: "dev",
    env: { PORT: "8081", HOST: "0.0.0.0", BASE_PATH: "/__mockup" },
    label: "Mockup sandbox",
  },
};

const validActions = new Set(["start", "stop", "status", "help"]);
const args = process.argv.slice(2);
const action = args[0] || "help";
const target = args[1] || "all";

function usage() {
  console.log("Usage: pnpm run dev -- <start|stop|status> <all|api|admin|vendor|rider|ajkmart|sandbox>");
  console.log("Examples:");
  console.log("  pnpm run start:all");
  console.log("  pnpm run stop:api");
  console.log("  pnpm run start:admin");
  console.log("  pnpm run status all");
}

function getTargets(name) {
  if (name === "all") return Object.keys(services);
  if (services[name]) return [name];
  throw new Error(`Unknown target: ${name}`);
}

function spawnService(name) {
  const service = services[name];
  if (!service) throw new Error(`Unknown service ${name}`);
  const env = { ...process.env, ...service.env };
  const args = ["--filter", service.filter, service.script];
  console.log(`Starting ${service.label} with: pnpm ${args.join(" ")}`);
  const child = spawn("pnpm", args, {
    cwd: root,
    env,
    stdio: "inherit",
    detached: true,
    shell: false,
  });
  child.on("error", (err) => {
    console.error(`Failed to start ${service.label}:`, err.message);
  });
  child.unref();
}

function stopService(name) {
  const service = services[name];
  if (!service) throw new Error(`Unknown service ${name}`);
  const pattern = `${service.filter} .* ${service.script}`;
  console.log(`Stopping ${service.label} by process match: ${pattern}`);
  const result = spawnSync("pkill", ["-f", pattern], { stdio: "inherit" });
  if (result.status !== 0) {
    console.warn(`No matching running process found for ${service.label} or pkill returned ${result.status}`);
  }
}

function statusService(name) {
  const service = services[name];
  if (!service) throw new Error(`Unknown service ${name}`);
  const pattern = `${service.filter} .* ${service.script}`;
  const result = spawnSync("pgrep", ["-af", pattern], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) {
    console.log(`${service.label}: not running`);
    return;
  }
  console.log(`${service.label}:`);
  console.log(result.stdout.trim());
}

try {
  if (!validActions.has(action)) {
    throw new Error(`Unknown action: ${action}`);
  }
  if (action === "help") {
    usage();
    process.exit(0);
  }

  const targets = getTargets(target);
  if (action === "start") {
    for (const name of targets) spawnService(name);
    process.exit(0);
  }
  if (action === "stop") {
    for (const name of targets) stopService(name);
    process.exit(0);
  }
  if (action === "status") {
    for (const name of targets) statusService(name);
    process.exit(0);
  }
} catch (error) {
  console.error(error.message);
  usage();
  process.exit(1);
}
