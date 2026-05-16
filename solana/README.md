# VoteChain — Solana devnet

Anchor program mirroring the EVM `Ballot.sol` model:

- **Wallet-derived identity** — sign `VoteChain:solana:v1:wallet-derived-voting-identity` (no passphrase).
- **Commitment + nullifier** — SHA-256 of signature bytes (see `scripts/identity.ts`).
- **`vote` has no voter signer** — any fee payer can submit; linkage to wallet is optional (use a relayer later).
- **Applications (Express)** store **CNIC + name + commitment** — **not** the voter wallet address.

## Privacy (honest limits)

This demo does **not** include full ZK (Semaphore/MACI). If admin stores **CNIC + commitment** from the apply queue, they can link a later on-chain vote to that person. Not storing the wallet helps, but **commitment in the application row is still a bridge**. True admin-blind voting needs ZK membership proofs or split-trust issuance.

## Prerequisites

- [Rust](https://rustup.rs/), [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools), [Anchor 0.30](https://www.anchor-lang.com/docs/installation)
- Phantom (or similar) on **Devnet**
- Devnet SOL: `solana airdrop 2`

## Build & test (local validator)

```bash
cd solana
yarn install
anchor build
anchor test
```

Copy IDL for the browser UI:

```bash
cp target/idl/solana_votechain.json ../public/solana_votechain.json
```

## Deploy to devnet

```bash
solana config set --url devnet
anchor build
anchor deploy --provider.cluster devnet
npx ts-node scripts/deploy-devnet.ts
cp target/deployed-devnet.json ../public/solana-deployed.json
cp target/idl/solana_votechain.json ../public/solana_votechain.json
```

## Demo CLI vote

```bash
npx ts-node scripts/demo-vote.ts
```

## Web UI

From repo root:

```bash
npm run start:api
```

Open [http://localhost:3001/solana.html](http://localhost:3001/solana.html)

1. Connect Phantom (devnet).
2. **Sign to derive keys**.
3. **Submit application** (CNIC stored off-chain; wallet not stored).
4. Admin: **add_eligible** with ballot admin wallet.
5. Voter: **Cast vote**.

## Program instructions

| Instruction        | Who signs      | Purpose                          |
|-------------------|----------------|----------------------------------|
| `init_ballot`     | ballot admin   | Create PDA `["ballot", admin]`   |
| `add_eligible`    | ballot admin   | Register commitment              |
| `start_voting_now`| ballot admin   | Open voting early                |
| `vote`            | fee payer only | Tally vote, burn nullifier       |

## Relayer (later)

Submit `vote` from a server-funded keypair so the voter’s wallet is not the fee payer. The relayer still sees `proposal_id`, `commitment`, and `nullifier` unless you add encryption or ZK.
