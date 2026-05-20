const path = require("path");
const fs = require("fs");
const NodeRSA = require("node-rsa");

const KEY_FILE = path.join(__dirname, "..", ".admin-rsa-key.json");

let memoryCache = null;

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function loadKeyFromEnv() {
  const raw = process.env.ADMIN_RSA_KEY_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[adminKeyStore] Invalid ADMIN_RSA_KEY_JSON:", e.message);
    return null;
  }
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
    return true;
  } catch (e) {
    console.warn("[adminKeyStore] Could not write local key file:", e.message);
    return false;
  }
}

async function persistKey(keyJson) {
  let saved = false;
  if (kvConfigured()) {
    try {
      const { kv } = require("@vercel/kv");
      await kv.set("admin-rsa-key", keyJson);
      saved = true;
    } catch (e) {
      console.warn("[adminKeyStore] KV write failed:", e.message);
    }
  }
  if (saveKeyToFile(keyJson)) saved = true;
  return saved;
}

async function loadKeyData() {
  let keyData = loadKeyFromEnv();
  if (keyData) return keyData;

  if (kvConfigured()) {
    try {
      const { kv } = require("@vercel/kv");
      keyData = await kv.get("admin-rsa-key");
      if (keyData) return keyData;
    } catch (e) {
      console.warn("[adminKeyStore] KV read failed:", e.message);
    }
  }

  return loadKeyFromFile();
}

async function getAdminKey() {
  if (memoryCache) return memoryCache;

  let keyData = await loadKeyData();
  let adminKey;

  if (keyData) {
    adminKey = new NodeRSA(keyData);
  } else {
    const onVercel = Boolean(process.env.VERCEL);
    if (onVercel && !kvConfigured() && !process.env.ADMIN_RSA_KEY_JSON) {
      throw new Error(
        "Admin RSA key not configured. Set KV_REST_API_URL + KV_REST_API_TOKEN (Upstash) or ADMIN_RSA_KEY_JSON in Vercel env."
      );
    }

    console.log("[adminKeyStore] Generating new RSA admin key...");
    adminKey = new NodeRSA({ b: 512 });
    keyData = adminKey.exportKey("components-public-private");

    const saved = await persistKey(keyData);
    if (!saved && onVercel) {
      throw new Error(
        "Could not persist admin RSA key. Configure Upstash/KV or set ADMIN_RSA_KEY_JSON in Vercel."
      );
    }
  }

  const adminN = BigInt("0x" + adminKey.keyPair.n.toString(16));
  const adminE = BigInt("0x" + adminKey.keyPair.e.toString(16));
  const adminD = BigInt("0x" + adminKey.keyPair.d.toString(16));

  memoryCache = { adminKey, adminN, adminE, adminD };
  return memoryCache;
}

module.exports = { getAdminKey };
