module.exports = {
  apps: [
    /* ── API server — compiled ESM bundle ─────────────────────────────────────
       Serves the API at /api/* and also statically serves the three Vite web
       app builds (admin, vendor, rider) from their dist/public directories via
       the static-serving middleware already in app.ts. */
    {
      name: "ajkmart-api",
      cwd: "./artifacts/api-server",
      script: "node",
      args: "dist/index.mjs",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: process.env.API_PORT || "8080",
      },
    },
    /* ── Customer mobile/web app (Expo) ────────────────────────────────────── */
    {
      name: "ajkmart-mobile-web",
      cwd: "./artifacts/ajkmart",
      script: "pnpm",
      args: "serve",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: process.env.MOBILE_WEB_PORT || "19006",
        BASE_PATH: "/",
      },
    },
    /* ── Vendor web app — Vite preview server ──────────────────────────────── */
    {
      name: "ajkmart-vendor",
      cwd: "./artifacts/vendor-app",
      script: "pnpm",
      args: "exec vite preview --host 0.0.0.0 --port 3002",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
    },
    /* ── Rider web app — Vite preview server ───────────────────────────────── */
    {
      name: "ajkmart-rider",
      cwd: "./artifacts/rider-app",
      script: "pnpm",
      args: "exec vite preview --host 0.0.0.0 --port 3003",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
    },
    /* ── Admin panel — Vite preview server ─────────────────────────────────
       Note: in production the API server also proxies /admin/* to this process.
       If the API server's static-serving middleware is configured to serve
       admin/dist/public directly, this process is optional. */
    {
      name: "ajkmart-admin",
      cwd: "./artifacts/admin",
      script: "pnpm",
      args: "exec vite preview --host 0.0.0.0 --port 23744",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
