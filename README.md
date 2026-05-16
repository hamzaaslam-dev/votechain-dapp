# VoteChain — Solana voting (Phantom)

Solana devnet voting with **Phantom** only. No MetaMask, no Ethereum.

- **Voter** (`/`): connect Phantom → sign for commitment/nullifier → apply (CNIC stored, wallet not stored) → vote after admin adds commitment
- **Admin** (`/admin.html`): ballot admin signs session → approve with `add_eligible` on-chain
- **Program**: `solana/programs/solana-votechain` (Anchor)

## Quick start

```bash
npm install
npm run start:api
# → http://localhost:3001
```

### Solana deploy (devnet)

```bash
cd solana
yarn install
./scripts/pin-deps.sh
anchor build --no-idl
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet
npx ts-node scripts/deploy-devnet.ts
cp target/deployed-devnet.json ../public/solana-deployed.json
cp idl/solana_votechain.json ../public/solana_votechain.json
```

Refresh the site. Use **Phantom on Devnet**.

### Demo CNICs

`1111111111111`, `2222222222222`, `3333333333333`

## Privacy

Applications store **CNIC + commitment**. Admin who has both can link votes unless you add ZK (Semaphore/MACI). Wallet address is **not** stored in applications.

## Legacy

`contracts/` and Hardhat files remain for reference but are not used by the web app.
