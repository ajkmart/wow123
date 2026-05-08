module.exports = {
  apps: [
    {
      name: "ajkmart-api",
      cwd: "./artifacts/api-server",
      script: "pnpm",
      args: "start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: process.env.API_PORT || "8080",
      },
    },
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
  ],
};