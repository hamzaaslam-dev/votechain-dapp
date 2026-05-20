/** Stateless Phantom helpers — nothing stored in localStorage. */

function buildWhitelistMessage(cnic, wallet) {
  return `VoteChain:whitelist\nCNIC:${cnic}\nWallet:${wallet}`;
}

function buildVoteMessage(wallet, proposalId) {
  return `VoteChain:vote\nWallet:${wallet}\nProposal:${proposalId}`;
}

function signatureToBase64(sig) {
  const bytes = sig instanceof Uint8Array ? sig : new Uint8Array(sig);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function connectPhantom() {
  const p = window.solana;
  if (!p?.isPhantom) throw new Error("Install Phantom and set network to Devnet");
  const resp = await p.connect();
  return new solanaWeb3.PublicKey(resp.publicKey.toString());
}

async function signText(phantom, text) {
  const encoded = new TextEncoder().encode(text);
  const { signature } = await phantom.signMessage(encoded);
  return signatureToBase64(signature);
}
