const path = require("path");
const fs = require("fs");
const NodeRSA = require("node-rsa");

const KEY_FILE = path.join(__dirname, "..", ".admin-rsa-key.json");

let memoryCache = null;

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function loadKeyFromFile() {
  try {
    if (fs.existsSync(KEY_FILE)) {
      return JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
    }
  } catch (e) {
    console.warn("[adminKeyStore] Could not read local key file:", e.message);
  }
  return null;
}

function saveKeyToFile(keyJson) {
  try {
    fs.writeFileSync(KEY_FILE, JSON.stringify(keyJson), "utf8");
  } catch (e) {
    console.warn("[adminKeyStore] Could not write local key file:", e.message);
  }
}

async function getAdminKey() {
  if (memoryCache) return memoryCache;

  let keyData = null;

  if (kvConfigured()) {
    try {
      const { kv } = require("@vercel/kv");
      keyData = await kv.get("admin-rsa-key");
    } catch (e) {
      console.warn("[adminKeyStore] KV read failed:", e.message);
    }
  }

  if (!keyData) {
    keyData = loadKeyFromFile();
  }

  let adminKey;
  if (keyData) {
    adminKey = new NodeRSA(keyData);
  } else {
    console.log("[adminKeyStore] Generating new RSA admin key...");
    adminKey = new NodeRSA({ b: 512 });
    keyData = adminKey.exportKey("components-public-private");
    saveKeyToFile(keyData);
    if (kvConfigured()) {
      try {
        const { kv } = require("@vercel/kv");
        await kv.set("admin-rsa-key", keyData);
      } catch (e) {
        console.warn("[adminKeyStore] KV write failed:", e.message);
      }
    }
  }

  const adminN = BigInt("0x" + adminKey.keyPair.n.toString(16));
  const adminE = BigInt("0x" + adminKey.keyPair.e.toString(16));
  const adminD = BigInt("0x" + adminKey.keyPair.d.toString(16));

  memoryCache = { adminKey, adminN, adminE, adminD };
  return memoryCache;
}

module.exports = { getAdminKey };
