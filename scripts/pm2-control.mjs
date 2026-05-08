import { spawnSync } from "node:child_process";

const action = process.argv[2] || "start";
const baseArgs = ["dlx", "pm2"];
const args = action === "stop"
  ? [...baseArgs, "delete", "ecosystem.config.cjs"]
  : [...baseArgs, "start", "ecosystem.config.cjs"];

const result = spawnSync("pnpm", args, { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
