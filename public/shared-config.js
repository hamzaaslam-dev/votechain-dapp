/** Solana deploy config + admin session (Phantom signMessage). */
async function loadDeployedAddresses() {
  try {
    const r = await fetch("/solana-deployed.json", { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function buildAdminSessionMessage(ballotAddress, walletAddress) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    message: `VoteChain admin session\nBallot:${ballotAddress}\nWallet:${walletAddress}\nExpires:${exp}`,
    expiresAt: exp
  };
}

function adminSessionExpiresAt(message) {
  const m = /Expires:(\d+)/.exec(String(message || ""));
  return m ? Number(m[1]) : 0;
}

function signatureToBase64(sig) {
  const bytes = sig instanceof Uint8Array ? sig : new Uint8Array(sig);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

const SOLANA_RPC = "https://api.devnet.solana.com";

const IX_DISC = {
  add_eligible: new Uint8Array([181, 45, 41, 132, 148, 165, 2, 11]),
  start_voting_now: new Uint8Array([175, 170, 11, 0, 34, 172, 44, 47]),
  vote: new Uint8Array([227, 110, 155, 23, 136, 126, 172, 25])
};

function buildIxData(discName, argsEncoder) {
  const disc = IX_DISC[discName];
  if (!disc) throw new Error("Unknown instruction: " + discName);
  const args = argsEncoder ? argsEncoder() : new Uint8Array(0);
  const data = new Uint8Array(disc.length + args.length);
  data.set(disc, 0);
  data.set(args, disc.length);
  return data;
}

function getPhantom() {
  const p = window.solana;
  if (!p?.isPhantom) {
    throw new Error("Install Phantom, switch to Devnet, then connect.");
  }
  return p;
}

function solanaConnection() {
  return new solanaWeb3.Connection(SOLANA_RPC, "confirmed");
}
