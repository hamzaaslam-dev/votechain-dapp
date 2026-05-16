import { createHash } from "crypto";

export const VOTE_SIGN_MESSAGE = Buffer.from(
  "VoteChain:solana:v1:wallet-derived-voting-identity",
  "utf8"
);

/** After wallet.signMessage(VOTE_SIGN_MESSAGE) → signature bytes */
export function commitmentFromSignature(signature: Uint8Array): Buffer {
  return createHash("sha256").update(signature).digest();
}

export function nullifierFromSignature(signature: Uint8Array): Buffer {
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from(signature), Buffer.from(":nullifier:sol:v1", "utf8")]))
    .digest();
}

export function toBytes32Array(buf: Buffer): number[] {
  if (buf.length !== 32) throw new Error("expected 32 bytes");
  return Array.from(buf);
}

export function hexBytes32(buf: Buffer): string {
  return "0x" + buf.toString("hex");
}
