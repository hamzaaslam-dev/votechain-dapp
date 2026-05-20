const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const CONNECTION_URL = 'https://api.devnet.solana.com';
const DEPLOYED_PATH = path.join(__dirname, '..', 'public', 'solana-deployed.json');
const RELAYER_KEY_PATH = path.join(__dirname, '..', '.admin-solana-keypair.json');

let connection = null;
let relayerKeypair = null;

function getRelayerKeypair() {
    if (relayerKeypair) return relayerKeypair;
    if (fs.existsSync(RELAYER_KEY_PATH)) {
        const secret = JSON.parse(fs.readFileSync(RELAYER_KEY_PATH, 'utf8'));
        relayerKeypair = Keypair.fromSecretKey(new Uint8Array(secret));
    } else {
        relayerKeypair = Keypair.generate();
        fs.writeFileSync(RELAYER_KEY_PATH, JSON.stringify(Array.from(relayerKeypair.secretKey)));
        console.log(`[Relayer] Created new Solana keypair: ${relayerKeypair.publicKey.toBase58()}`);
        console.log(`[Relayer] IMPORTANT: Please fund this keypair on devnet using: solana airdrop 1 ${relayerKeypair.publicKey.toBase58()} --url devnet`);
    }
    return relayerKeypair;
}

async function relayVote(votingTokenHex, proposalId) {
    if (!connection) connection = new Connection(CONNECTION_URL, 'confirmed');
    const relayer = getRelayerKeypair();

    if (!fs.existsSync(DEPLOYED_PATH)) {
        throw new Error("Smart contract not deployed yet (solana-deployed.json missing)");
    }
    const deployed = JSON.parse(fs.readFileSync(DEPLOYED_PATH, 'utf8'));
    if (!deployed.ballot || !deployed.programId) {
        throw new Error("Invalid deployment data");
    }

    const programId = new PublicKey(deployed.programId);
    const ballotPk = new PublicKey(deployed.ballot);
    
    const voteDisc = Buffer.from([227, 110, 155, 23, 136, 126, 172, 25]);
    const tokenBuffer = Buffer.from(votingTokenHex, 'hex');
    if (tokenBuffer.length !== 32) {
        throw new Error("Voting token must be 64 hex characters (32 bytes)");
    }

    const data = Buffer.alloc(8 + 1 + 32);
    voteDisc.copy(data, 0);
    data.writeUInt8(proposalId, 8);
    tokenBuffer.copy(data, 9);

    const ix = new TransactionInstruction({
        keys: [
            { pubkey: relayer.publicKey, isSigner: true, isWritable: true },
            { pubkey: ballotPk, isSigner: false, isWritable: true }
        ],
        programId,
        data
    });

    const tx = new Transaction().add(ix);
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = relayer.publicKey;

    tx.sign(relayer);

    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    return signature;
}

module.exports = {
    relayVote,
    getRelayerKeypair
};
