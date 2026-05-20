const { kv } = require('@vercel/kv');
const NodeRSA = require("node-rsa");
const fs = require("fs");

let memoryCache = null;

async function getAdminKey() {
  if (memoryCache) return memoryCache;

  let keyData = null;
  try {
    keyData = await kv.get('admin-rsa-key');
  } catch (e) {
    console.warn("[adminKeyStore] Could not read from KV. Make sure KV_REST_API_URL and KV_REST_API_TOKEN are set.", e.message);
  }

  let adminKey;
  
  if (keyData) {
    adminKey = new NodeRSA(keyData);
  } else {
    console.log("[adminKeyStore] Generating new RSA admin key...");
    adminKey = new NodeRSA({ b: 512 });
    const keyJson = adminKey.exportKey('components-public-private');
    try {
      await kv.set('admin-rsa-key', keyJson);
    } catch (e) {
      console.warn("[adminKeyStore] Could not write to KV:", e.message);
    }
  }
  
  const adminN = BigInt('0x' + adminKey.keyPair.n.toString(16));
  const adminE = BigInt('0x' + adminKey.keyPair.e.toString(16));
  const adminD = BigInt('0x' + adminKey.keyPair.d.toString(16));

  memoryCache = { adminKey, adminN, adminE, adminD };
  return memoryCache;
}

module.exports = { getAdminKey };
