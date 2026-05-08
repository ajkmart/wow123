const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

/* Exclude transient / tool-managed directories that may disappear at runtime.
   Metro crashes with ENOENT if it tries to watch a directory that no longer exists. */
const escapeRegex = (str) => str.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
const blockPaths = [
  path.resolve(monorepoRoot, ".local"),
  path.resolve(monorepoRoot, ".git"),
];
const blockListRegex = new RegExp(
  blockPaths.map((p) => `^${escapeRegex(p)}(\\/|\\\\|$)`).join("|")
);

const existingBlockList = config.resolver.blockList;
if (existingBlockList instanceof RegExp) {
  config.resolver.blockList = new RegExp(
    `${existingBlockList.source}|${blockListRegex.source}`
  );
} else {
  config.resolver.blockList = blockListRegex;
}

/* ── Web shims ────────────────────────────────────────────────────────────────
   When building for web, redirect native-only modules to browser-safe shims.
   Metro resolves '.web.js' automatically but the shim map gives us full control.
   ──────────────────────────────────────────────────────────────────────────── */
const WEB_SHIMS = {
  "expo-secure-store":          path.resolve(projectRoot, "shims/expo-secure-store.web.js"),
  "expo-task-manager":          path.resolve(projectRoot, "shims/expo-task-manager.web.js"),
  "expo-local-authentication":  path.resolve(projectRoot, "shims/expo-local-authentication.web.js"),
  "expo-haptics":               path.resolve(projectRoot, "shims/expo-haptics.web.js"),
  "expo-file-system":           path.resolve(projectRoot, "shims/expo-file-system.web.js"),
  "expo-file-system/legacy":    path.resolve(projectRoot, "shims/expo-file-system.web.js"),
  "expo-sharing":               path.resolve(projectRoot, "shims/expo-sharing.web.js"),
  "expo-location":              path.resolve(projectRoot, "shims/expo-location.web.js"),
  "expo-battery":               path.resolve(projectRoot, "shims/expo-battery.web.js"),
  "expo-glass-effect":          path.resolve(projectRoot, "shims/expo-glass-effect.web.js"),
  "expo-symbols":               path.resolve(projectRoot, "shims/expo-symbols.web.js"),
};

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB_SHIMS[moduleName]) {
    return { filePath: WEB_SHIMS[moduleName], type: "sourceFile" };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
