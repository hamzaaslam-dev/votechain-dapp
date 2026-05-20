/**
 * Print ADMIN_RSA_KEY_JSON for Vercel (one-time setup).
 * Usage: node scripts/export-admin-rsa-env.js
 */
const fs = require("fs");
const path = require("path");

const KEY_FILE = path.join(__dirname, "..", ".admin-rsa-key.json");

if (!fs.existsSync(KEY_FILE)) {
  console.error("Missing .admin-rsa-key.json — run the app locally once or deploy with KV first.");
  process.exit(1);
}

const keyJson = fs.readFileSync(KEY_FILE, "utf8");
console.log("Add this to Vercel → Settings → Environment Variables:\n");
console.log("Name: ADMIN_RSA_KEY_JSON");
console.log("Value (single line):");
console.log(JSON.stringify(JSON.parse(keyJson)));
