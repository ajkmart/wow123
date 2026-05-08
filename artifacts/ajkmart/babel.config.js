module.exports = function (api) {
  const isProduction = api.env("production");
  if (isProduction) {
    api.cache(false);
  } else {
    api.cache.never();
  }
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: isProduction ? [["transform-remove-console", { exclude: ["error"] }]] : [],
  };
};
