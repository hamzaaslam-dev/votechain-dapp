# Anonymous Voting dApp (Testnet Starter)

This project is a student-friendly blockchain voting app with:

- CNIC verification in backend (demo allowlist)
- On-chain eligibility via voter commitments
- One-person-one-vote using a nullifier
- **Admin wallet**: add eligible voters, **create elections** via `ElectionFactory`, **open voting early** with `startVotingNow` on each `Ballot`

## Architecture

- `contracts/`
  - `VoterRegistry.sol`: admin adds eligible voter commitments (`addEligibleVoters`)
  - `Ballot.sol`: election (candidates, schedule, votes); **ballot admin** is the wallet that created that ballot via the factory
  - `ElectionFactory.sol`: factory admin deploys new `Ballot` instances; creator becomes each ballot’s admin
- `backend/server.js`: CNIC check + optional server-side `add-commitment` (uses `ADMIN_PRIVATE_KEY`); serves static UI from `public/`
- `public/`: browser UI (MetaMask for voters and for admin actions)
- `api/`: Vercel serverless routes (same JSON API as local if you deploy there)

## Roles (who is “admin”)

| Contract | Admin | What they do |
|----------|--------|----------------|
| `VoterRegistry` | deployer of registry | Add eligibility via `addEligibleVoters` (only admin) |
| `ElectionFactory` | deployer of factory | Call `createElection` → new `Ballot`; **caller** becomes that ballot’s `admin` |
| `Ballot` | address passed in constructor | `startVotingNow()` if voting was scheduled for later |

**Default deploy** (`scripts/deploy.js`): one wallet deploys Registry + Factory and creates one sample Ballot. That wallet is **registry admin**, **factory admin**, and **admin of the sample Ballot** (because it called `createElection`).

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

Copy **VoterRegistry**, **ElectionFactory**, and **Ballot** addresses into the web UI (Registry + Factory in Admin; Ballot in Config).

5. Testnet deploy (Sepolia)

Fill `.env` with `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY`, then:

```bash
npm run deploy:sepolia
```

6. Run app locally

```bash
npm run start:api
```

Open `http://localhost:3001`.

### Admin flow in the UI (wallet)

1. Connect MetaMask with the **deployer** account (or whichever account is factory + registry admin).
2. Paste **VoterRegistry** and **ElectionFactory** addresses → **Check roles**.
3. **Add voter**: paste a commitment `bytes32` (or generate from CNIC+secret in the voter section) → **Add voter on-chain (Registry)** — confirm in MetaMask.
4. **Create election**: comma-separated names, start/end datetime → **Create election** — confirm in MetaMask; new **Ballot** address is filled into Config.
5. **Start voting now** (optional): if the ballot’s start time is still in the future, click **Start voting now** — Ballot admin only (the wallet that created that ballot).

Voters can **Register with my wallet** if their wallet is the registry admin, or use **Register (server key)** if you configured `ADMIN_PRIVATE_KEY` on the server.

## How anonymity works here

- CNIC is checked off-chain.
- Frontend makes `commitment = hash(cnic + secret)` locally.
- Contract only sees commitment + nullifier, not CNIC or name.
- Nullifier can be used once, preventing double vote.

## Project limitation

This starter is privacy-preserving pseudonymity, not full zero-knowledge anonymity.
For stronger anonymity, upgrade to Semaphore/MACI in future versions.
