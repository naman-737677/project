"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNetworkClockOffsetSec = getNetworkClockOffsetSec;
exports.syncNetworkTime = syncNetworkTime;
exports.generateBase32Secret = generateBase32Secret;
exports.base32ToBuffer = base32ToBuffer;
exports.generateTOTPWithTimestamp = generateTOTPWithTimestamp;
exports.generateTOTP = generateTOTP;
exports.verifyTOTP = verifyTOTP;
exports.generateTOTPQrCode = generateTOTPQrCode;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const crypto_1 = __importDefault(require("crypto"));
const https_1 = __importDefault(require("https"));
const qrcode_1 = __importDefault(require("qrcode"));
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// Track clock drift against network time (e.g. Google HTTP time)
let networkClockOffsetSec = null;
function getNetworkClockOffsetSec() {
    return networkClockOffsetSec || 0;
}
function syncNetworkTime() {
    try {
        const req = https_1.default.get('https://www.google.com', { timeout: 3500 }, (res) => {
            const serverDate = res.headers.date;
            if (serverDate) {
                const networkMs = new Date(serverDate).getTime();
                const localMs = Date.now();
                networkClockOffsetSec = Math.round((localMs - networkMs) / 1000);
            }
        });
        req.on('error', () => { });
        req.on('timeout', () => req.destroy());
    }
    catch {
        // Ignore in offline environments
    }
}
// Initial sync and periodic refresh (unref so tests/scripts can exit cleanly)
syncNetworkTime();
const networkSyncTimer = setInterval(syncNetworkTime, 60000);
if (networkSyncTimer && typeof networkSyncTimer.unref === 'function') {
    networkSyncTimer.unref();
}
/**
 * Generate a random Base32 secret string compatible with Google Authenticator
 * Default length is 32 characters (160 bits = 20 bytes), which complies with RFC 4226 / RFC 6238 standard HMAC-SHA1 key length.
 */
function generateBase32Secret(length = 32) {
    const bytes = crypto_1.default.randomBytes(length);
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
        result += BASE32_CHARS[bytes[i] % 32];
    }
    return result;
}
/**
 * Decode a Base32 string into a Buffer
 */
function base32ToBuffer(base32) {
    const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/[\s-]+/g, '');
    let bits = '';
    for (let i = 0; i < cleaned.length; i++) {
        const val = BASE32_CHARS.indexOf(cleaned[i]);
        if (val === -1)
            continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}
/**
 * Generate a 6-digit TOTP code for a specific timestamp (RFC 6238)
 */
function generateTOTPWithTimestamp(secret, timestampMs, timeStepWindow = 0, stepSeconds = 30) {
    const counter = Math.floor(timestampMs / 1000 / stepSeconds) + timeStepWindow;
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));
    const key = base32ToBuffer(secret);
    const hmac = crypto_1.default.createHmac('sha1', key);
    hmac.update(counterBuffer);
    const digest = hmac.digest();
    // Dynamic truncation (RFC 4226)
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
}
/**
 * Generate a 6-digit TOTP code using calibrated network time (fallback to local system time)
 */
function generateTOTP(secret, timeStepWindow = 0, stepSeconds = 30) {
    const baseTime = networkClockOffsetSec !== null ? Date.now() - networkClockOffsetSec * 1000 : Date.now();
    return generateTOTPWithTimestamp(secret, baseTime, timeStepWindow, stepSeconds);
}
/**
 * Verify a 6-digit TOTP code with generous window tolerance for clock drift (+/- 40 steps = +/- 20 minutes)
 * Checks both calibrated network time (matching phone) and local system time.
 */
function verifyTOTP(token, secret, window = 40) {
    if (!token || !secret)
        return false;
    const trimmed = token.toString().trim().replace(/\s+/g, '');
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed))
        return false;
    // 1. Check with calibrated network time (matches Google Authenticator on mobile phones)
    if (networkClockOffsetSec !== null) {
        const calibratedTime = Date.now() - networkClockOffsetSec * 1000;
        for (let i = -window; i <= window; i++) {
            if (generateTOTPWithTimestamp(secret, calibratedTime, i) === trimmed) {
                return true;
            }
        }
    }
    // 2. Also check with local system time to support offline or local tests
    const localTime = Date.now();
    for (let i = -window; i <= window; i++) {
        if (generateTOTPWithTimestamp(secret, localTime, i) === trimmed) {
            return true;
        }
    }
    return false;
}
/**
 * Generate an otpauth:// URI and QR code data URL (PNG)
 */
async function generateTOTPQrCode(username, secret, issuer = 'TelegramWeb') {
    const cleanUsername = username.replace(/^@+/, '').trim();
    const cleanIssuer = issuer.trim();
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(cleanIssuer)}:${encodeURIComponent(cleanUsername)}?secret=${secret}&issuer=${encodeURIComponent(cleanIssuer)}&algorithm=SHA1&digits=6&period=30`;
    const qrCodeDataUrl = await qrcode_1.default.toDataURL(otpauthUrl, {
        margin: 2,
        width: 260,
        errorCorrectionLevel: 'M',
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
    });
    return { otpauthUrl, qrCodeDataUrl };
}
/**
 * Password hashing using Node.js built-in scrypt
 */
function hashPassword(password) {
    const salt = crypto_1.default.randomBytes(16).toString('hex');
    const hash = crypto_1.default.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}
function verifyPassword(password, combinedHash) {
    const [salt, key] = combinedHash.split(':');
    if (!salt || !key)
        return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto_1.default.scryptSync(password, salt, 64);
    return crypto_1.default.timingSafeEqual(keyBuffer, derivedKey);
}
