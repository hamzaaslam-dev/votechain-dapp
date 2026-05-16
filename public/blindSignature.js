// blindSignature.js - BigInt implementation for browser and Node.js
// Compatible with both Node.js require() and browser <script>

function modPow(base, exponent, modulus) {
    if (modulus === 1n) return 0n;
    let result = 1n;
    base = base % modulus;
    while (exponent > 0n) {
        if (exponent % 2n === 1n) result = (result * base) % modulus;
        exponent = exponent / 2n;
        base = (base * base) % modulus;
    }
    return result;
}

function modInverse(a, m) {
    const m0 = m;
    let y = 0n, x = 1n;
    if (m === 1n) return 0n;
    while (a > 1n) {
        let q = a / m;
        let t = m;
        m = a % m, a = t;
        t = y;
        y = x - q * y;
        x = t;
    }
    if (x < 0n) x += m0;
    return x;
}

// Convert string to hex
function utf8ToHex(str) {
    return Array.from(str).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

// Basic SHA-256 for strings (Browser WebCrypto or Node.js)
async function sha256Int(message) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return BigInt('0x' + hashHex);
    } else {
        const crypto = require('crypto');
        const hashHex = crypto.createHash('sha256').update(message).digest('hex');
        return BigInt('0x' + hashHex);
    }
}

function randomBigInt(maxN) {
    let rHex;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint8Array(32);
        window.crypto.getRandomValues(arr);
        rHex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        const crypto = require('crypto');
        rHex = crypto.randomBytes(32).toString('hex');
    }
    return BigInt('0x' + rHex) % maxN;
}

async function blind(message, N, E) {
    const msgHash = await sha256Int(message);
    const r = randomBigInt(N);
    const blinded = (msgHash * modPow(r, E, N)) % N;
    return { blinded, r };
}

function sign(blinded, D, N) {
    return modPow(blinded, D, N);
}

function unblind(signedBlinded, r, N) {
    return (signedBlinded * modInverse(r, N)) % N;
}

async function verify(signed, message, E, N) {
    const msgHash = await sha256Int(message);
    const result = modPow(signed, E, N);
    return result === msgHash;
}

const BlindSignature = {
    blind,
    sign,
    unblind,
    verify
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlindSignature;
} else if (typeof window !== 'undefined') {
    window.BlindSignature = BlindSignature;
}
