if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = require.extensions[".js"];
}

module.exports = require("./index.ts");
