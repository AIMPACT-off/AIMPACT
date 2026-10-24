const fs = require("node:fs");
const path = require("node:path");

const publicConfigSource = fs.readFileSync(path.resolve(__dirname, "../config.js"), "utf8");
const configuredUrl = publicConfigSource.match(/supabaseUrl\s*:\s*"([^"]+)"/)?.[1] || "";
const configuredKey = publicConfigSource.match(/supabaseKey\s*:\s*"([^"]+)"/)?.[1] || "";

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || configuredUrl,
    supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || configuredKey,
  },
});