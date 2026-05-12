# Anonymous Voting dApp (Testnet Starter)

This project is a student-friendly blockchain voting app with:

- CNIC verification in backend (demo allowlist)
- On-chain eligibility via voter commitments
- One-person-one-vote using a nullifier
- Public result visibility on testnet

## Architecture

- `contracts/`
  - `VoterRegistry.sol`: stores eligible voter commitments
  - `Ballot.sol`: election contract with nullifier-based double-vote prevention
- `backend/server.js`
  - verifies CNIC format and mock eligibility
  - admin endpoint to register commitment on-chain
  - serves frontend
- `frontend/`
  - browser UI for generating commitment/nullifier locally
  - wallet connection + voting with MetaMask

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Copy env file

```bash
cp .env.example .env
```

3. Compile contracts

```bash
npm run compile
```

4. Local chain (optional)

```bash
npm run node
```

In another terminal:

```bash
npm run deploy:local
```

5. Testnet deploy (Sepolia)

- Fill `.env` with:
  - `SEPOLIA_RPC_URL`
  - `DEPLOYER_PRIVATE_KEY`

```bash
npm run deploy:sepolia
```

6. Configure backend for admin commitment writes

In `.env`, set:

- `ADMIN_PRIVATE_KEY`
- `VOTER_REGISTRY_ADDRESS`
- `SEPOLIA_RPC_URL`

7. Run app

```bash
npm run start:api
```

Open `http://localhost:3001`.

## How anonymity works here

- CNIC is checked off-chain.
- Frontend makes `commitment = hash(cnic + secret)` locally.
- Contract only sees commitment + nullifier, not CNIC or name.
- Nullifier can be used once, preventing double vote.

## Project limitation

This starter is privacy-preserving pseudonymity, not full zero-knowledge anonymity.
For stronger anonymity, upgrade to Semaphore/MACI in future versions.
