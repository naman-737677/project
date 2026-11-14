"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAuthRoute = handleAuthRoute;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_js_1 = require("../config/index.js");
const store_js_1 = require("./store.js");
const totp_js_1 = require("./totp.js");
function verifyAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return null;
    const token = authHeader.slice(7);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, index_js_1.config.jwtSecret);
        if (decoded && decoded.userId && decoded.username) {
            return { userId: decoded.userId, username: decoded.username };
        }
    }
    catch {
        return null;
    }
    return null;
}
function jsonResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
async function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            }
            catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}
async function handleAuthRoute(req, res, pathname) {
    // ----------------------------------------------------
    // 1. POST /api/auth/register
    // ----------------------------------------------------
    if (pathname === '/api/auth/register' && req.method === 'POST') {
        try {
            const { username, password, displayName, enable2FA } = await parseBody(req);
            if (!username || typeof username !== 'string' || username.trim().length < 3) {
                jsonResponse(res, 400, { error: 'Username must be at least 3 characters long' });
                return true;
            }
            if (!password || typeof password !== 'string' || password.length < 6) {
                jsonResponse(res, 400, { error: 'Password must be at least 6 characters long' });
                return true;
            }
            const existing = await (0, store_js_1.findUserByUsername)(username);
            if (existing) {
                jsonResponse(res, 409, { error: 'Username is already taken' });
                return true;
            }
            const user = await (0, store_js_1.createUser)(username, password, displayName);
            // If user enabled 2FA during registration:
            if (enable2FA) {
                const secret = (0, totp_js_1.generateBase32Secret)(32);
                const { otpauthUrl, qrCodeDataUrl } = await (0, totp_js_1.generateTOTPQrCode)(user.username, secret);
                await (0, store_js_1.updateUser2FA)(user.id, {
                    twoFactorEnabled: false,
                    pendingTwoFactorSecret: secret,
                });
                const tempToken = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, stage: '2fa_setup_required' }, index_js_1.config.jwtSecret, { expiresIn: '10m' });
                jsonResponse(res, 201, {
                    require2FASetup: true,
                    tempToken,
                    secret,
                    qrCode: qrCodeDataUrl,
                    otpauthUrl,
                    user: {
                        id: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        avatarUrl: user.avatarUrl || null,
                        twoFactorEnabled: false,
                    },
                });
                return true;
            }
            const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, deviceId: 'browser-' + Math.random().toString(36).substring(2, 7) }, index_js_1.config.jwtSecret, { expiresIn: index_js_1.config.jwtExpiresIn });
            jsonResponse(res, 201, {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl || null,
                    twoFactorEnabled: false,
                },
            });
        }
        catch (err) {
            jsonResponse(res, 400, { error: err.message });
        }
        return true;
    }
    // ----------------------------------------------------
    // 2. POST /api/auth/login
    // ----------------------------------------------------
    if (pathname === '/api/auth/login' && req.method === 'POST') {
        try {
            const { username, password } = await parseBody(req);
            if (!username || !password) {
                jsonResponse(res, 400, { error: 'Username and password are required' });
                return true;
            }
            const user = await (0, store_js_1.findUserByUsername)(username);
            if (!user) {
                jsonResponse(res, 401, { error: 'Invalid username or password' });
                return true;
            }
            const isValidPassword = (0, totp_js_1.verifyPassword)(password, user.passwordHash);
            if (!isValidPassword) {
                jsonResponse(res, 401, { error: 'Invalid username or password' });
                return true;
            }
            // Every time a user logs in, Google Authenticator QR must be shown to the user to re-verify and get logged in.
            let secret = user.twoFactorSecret || user.pendingTwoFactorSecret;
            if (!secret) {
                secret = (0, totp_js_1.generateBase32Secret)(32);
                await (0, store_js_1.updateUser2FA)(user.id, {
                    twoFactorEnabled: false,
                    pendingTwoFactorSecret: secret,
                });
            }
            const { otpauthUrl, qrCodeDataUrl } = await (0, totp_js_1.generateTOTPQrCode)(user.username, secret);
            // Issue temporary 15-minute token requiring 2FA step, embedding verified secret
            const tempToken = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, stage: '2fa_required', secret }, index_js_1.config.jwtSecret, { expiresIn: '15m' });
            jsonResponse(res, 200, {
                require2FA: true,
                require2FASetup: !user.twoFactorEnabled,
                tempToken,
                secret,
                qrCode: qrCodeDataUrl,
                otpauthUrl,
                username: user.username,
                displayName: user.displayName,
            });
            return true;
        }
        catch (err) {
            jsonResponse(res, 400, { error: err.message });
        }
        return true;
    }
    // ----------------------------------------------------
    // 3. POST /api/auth/2fa/login-setup-verify
    // (Verify & Enable Google Authenticator 2FA during Login)
    // ----------------------------------------------------
    if (pathname === '/api/auth/2fa/login-setup-verify' && req.method === 'POST') {
        try {
            const { tempToken, code } = await parseBody(req);
            if (!tempToken || !code) {
                jsonResponse(res, 400, { error: 'Temporary token and 6-digit code are required' });
                return true;
            }
            let decoded;
            try {
                decoded = jsonwebtoken_1.default.verify(tempToken, index_js_1.config.jwtSecret);
            }
            catch {
                jsonResponse(res, 401, { error: '2FA session expired. Please log in again.' });
                return true;
            }
            if ((decoded.stage !== '2fa_setup_required' && decoded.stage !== '2fa_required') || !decoded.userId) {
                jsonResponse(res, 401, { error: 'Invalid 2FA setup session' });
                return true;
            }
            const user = await (0, store_js_1.findUserById)(decoded.userId);
            const secret = decoded.secret || user?.pendingTwoFactorSecret || user?.twoFactorSecret;
            if (!user || !secret) {
                jsonResponse(res, 400, { error: 'No pending 2FA setup found. Please log in again to generate a new QR code.' });
                return true;
            }
            const isValidCode = (0, totp_js_1.verifyTOTP)(code, secret);
            if (!isValidCode) {
                jsonResponse(res, 400, { error: 'Invalid 6-digit code. Please check Google Authenticator and try again.' });
                return true;
            }
            // Activate 2FA permanently
            await (0, store_js_1.updateUser2FA)(user.id, {
                twoFactorEnabled: true,
                twoFactorSecret: secret,
                pendingTwoFactorSecret: null,
            });
            // Issue full session token
            const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, deviceId: 'browser-' + Math.random().toString(36).substring(2, 7) }, index_js_1.config.jwtSecret, { expiresIn: index_js_1.config.jwtExpiresIn });
            jsonResponse(res, 200, {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl || null,
                    twoFactorEnabled: true,
                },
                message: 'Two-Step Authentication with Google Authenticator enabled and verified successfully!',
            });
        }
        catch (err) {
            jsonResponse(res, 400, { error: err.message });
        }
        return true;
    }
    // ----------------------------------------------------
    // 4. POST /api/auth/2fa/current-code (Dev/Testing Helper)
    // ----------------------------------------------------
    if (pathname === '/api/auth/2fa/current-code' && req.method === 'POST') {
        try {
            const body = await parseBody(req).catch(() => ({}));
            let user = null;
            let secret = null;
            if (body?.tempToken) {
                let decoded;
                try {
                    decoded = jsonwebtoken_1.default.verify(body.tempToken, index_js_1.config.jwtSecret);
                }
                catch {
                    jsonResponse(res, 401, { error: 'Session expired' });
                    return true;
                }
                user = await (0, store_js_1.findUserById)(decoded.userId);
                if (user) {
                    secret = user.twoFactorSecret || user.pendingTwoFactorSecret;
                }
            }
            else {
                const auth = verifyAuthToken(req);
                if (auth) {
                    user = await (0, store_js_1.findUserById)(auth.userId);
                    if (user) {
                        secret = user.twoFactorSecret || user.pendingTwoFactorSecret;
                    }
                }
            }
            if (!user || !secret) {
                jsonResponse(res, 400, { error: 'No TOTP secret found for this session' });
                return true;
            }
            const baseTime = Date.now() - ((0, totp_js_1.getNetworkClockOffsetSec)() * 1000);
            const code = (0, totp_js_1.generateTOTP)(secret);
            const remainingSeconds = 30 - (Math.floor(baseTime / 1000) % 30);
            jsonResponse(res, 200, { code, remainingSeconds, serverTime: baseTime });
        }
        catch (err) {
            jsonResponse(res, 400, { error: err.message });
        }
        return true;
    }
    // ----------------------------------------------------
    // 5. POST /api/auth/2fa/login-verify (Verify existing 2FA)
    // ----------------------------------------------------
    if (pathname === '/api/auth/2fa/login-verify' && req.method === 'POST') {
        try {
            const { tempToken, code } = await parseBody(req);
            if (!tempToken || !code) {
                jsonResponse(res, 400, { error: 'Temporary token and 6-digit code are required' });
                return true;
            }
            let decoded;
            try {
                decoded = jsonwebtoken_1.default.verify(tempToken, index_js_1.config.jwtSecret);
            }
            catch {
                jsonResponse(res, 401, { error: '2FA session expired. Please log in again.' });
                return true;
            }
            if ((decoded.stage !== '2fa_required' && decoded.stage !== '2fa_setup_required') || !decoded.userId) {
                jsonResponse(res, 401, { error: 'Invalid 2FA session' });
                return true;
            }
            const user = await (0, store_js_1.findUserById)(decoded.userId);
            const secret = decoded.secret || user?.twoFactorSecret || user?.pendingTwoFactorSecret;
            if (!user || !secret) {
                jsonResponse(res, 400, { error: '2FA is not configured for this account' });
                return true;
            }
            const isValidCode = (0, totp_js_1.verifyTOTP)(code, secret);
            if (!isValidCode) {
                jsonResponse(res, 400, { error: 'Invalid 6-digit code. Check Google Authenticator and try again.' });
                return true;
            }
            // If pending or not marked active, activate permanently
            if (!user.twoFactorEnabled || !user.twoFactorSecret) {
                await (0, store_js_1.updateUser2FA)(user.id, {
                    twoFactorEnabled: true,
                    twoFactorSecret: secret,
                    pendingTwoFactorSecret: null,
                });
            }
            // Successful 2FA: issue full session token
            const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, deviceId: 'browser-' + Math.random().toString(36).substring(2, 7) }, index_js_1.config.jwtSecret, { expiresIn: index_js_1.config.jwtExpiresIn });
            jsonResponse(res, 200, {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl || null,
                    twoFactorEnabled: true,
                },
            });
        }
        catch (err) {
            jsonResponse(res, 400, { error: err.message });
        }
        return true;
    }
    // ----------------------------------------------------
    // 4. POST /api/auth/2fa/setup (Generate QR code)
    // ----------------------------------------------------
    if (pathname === '/api/auth/2fa/setup' && req.method === 'POST') {
        const auth = verifyAuthToken(req);
        if (!auth) {
            jsonResponse(res, 401, { error: 'Unauthorized' });
            return true;
        }
        try {
            const user = await (0, store_js_1.findUserById)(auth.userId);
            if (!user) {
                jsonResponse(res, 404, { error: 'User not found' });
                return true;
            }
            const secret = (0, totp_js_1.generateBase32Secret)(32);
            const { otpauthUrl, qrCodeDataUrl } = await (0, totp_js_1.generateTOTPQrCode)(user.username, secret);
            // Save as pending secret until verified with a test code
            await (0, store_js_1.updateUser2FA)(user.id, {
                twoFactorEnabled: user.twoFactorEnabled,
                pendingTwoFactorSecret: secret,
            });
            jsonResponse(res, 200, {
                secret,
                otpauthUrl,
                qrCode: qrCodeDataUrl,
                message: 'Scan the QR code in Google Authenticator or enter the secret manually',
            });
        }
        catch (err) {
            jsonResponse(res, 500, { error: err.message });
        }
        return true;
    }
    // ----------------------------------------------------
    // 5. POST /api/auth/2fa/enable (Confirm with code)
    // ----------------------------------------------------
    if (pathname === '/api/auth/2fa/enable' && req.method === 'POST') {
        const auth = verifyAuthToken(req);
        if (!auth) {
            jsonResponse(res, 401, { error: 'Unauthorized' });
            return true;
        }
        try {
            const { code } = await parseBody(req);
            const user = await (0, store_js_1.findUserById)(auth.userId);
            if (!user || !user.pendingTwoFactorSecret) {
                jsonResponse(res, 400, { error: 'No pending 2FA setup found. Please generate a new QR code first.' });
                return true;
            }
            const isValid = (0, totp_js_1.verifyTOTP)(code, user.pendingTwoFactorSecret);
            if (!isValid) {
                jsonResponse(res, 400, { error: 'Invalid 6-digit verification code. Please check Google Authenticator.' });
                return true;
            }
            // Activate 2FA
            await (0, store_js_1.updateUser2FA)(user.id, {
                twoFactorEnabled: true,
                twoFactorSecret: user.pendingTwoFactorSecret,
                pendingTwoFactorSecret: null,
            });
            jsonResponse(res, 200, {
                success: true,
                message: 'Two-Step Authentication with Google Authenticator enabled successfully!',
            });
        }
        catch (err) {
            jsonResponse(res, 400, { error: err.message });
        }
        return true;
    }
    // ----------------------------------------------------
    // 6. POST /api/auth/2fa/disable
    // ----------------------------------------------------
    if (pathname === '/api/auth/2fa/disable' && req.method === 'POST') {
        const auth = verifyAuthToken(req);
        if (!auth) {
            jsonResponse(res, 401, { error: 'Unauthorized' });
            return true;
        }
        try {
            const { password, code } = await parseBody(req);
            const user = await (0, store_js_1.findUserById)(auth.userId);
            if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
                jsonResponse(res, 400, { error: '2FA is not currently enabled' });
                return true;
            }
            const isPasswordValid = (0, totp_js_1.verifyPassword)(password || '', user.passwordHash);
            if (!isPasswordValid) {
                jsonResponse(res, 401, { error: 'Incorrect password' });
                return true;
            }
            const isCodeValid = (0, totp_js_1.verifyTOTP)(code || '', user.twoFactorSecret);
            if (!isCodeValid) {
                jsonResponse(res, 400, { error: 'Invalid 6-digit authenticator code' });
                return true;
            }
            await (0, store_js_1.updateUser2FA)(user.id, {
                twoFactorEnabled: false,
                twoFactorSecret: null,
                pendingTwoFactorSecret: null,
            });
            jsonResponse(res, 200, {
                success: true,
                message: 'Two-Step Authentication disabled',
            });
        }
        catch (err) {
            jsonResponse(res, 400, { error: err.message });
        }
        return true;
    }
    // ----------------------------------------------------
    // 7. GET /api/auth/me
    // ----------------------------------------------------
    if (pathname === '/api/auth/me' && req.method === 'GET') {
        const auth = verifyAuthToken(req);
        if (!auth) {
            jsonResponse(res, 401, { error: 'Unauthorized' });
            return true;
        }
        const user = await (0, store_js_1.findUserById)(auth.userId);
        if (!user) {
            jsonResponse(res, 404, { error: 'User not found' });
            return true;
        }
        jsonResponse(res, 200, {
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || null,
                twoFactorEnabled: user.twoFactorEnabled,
            },
        });
        return true;
    }
    // ----------------------------------------------------
    // 8. POST /api/auth/profile/avatar (Update/Remove Avatar)
    // ----------------------------------------------------
    if (pathname === '/api/auth/profile/avatar' && req.method === 'POST') {
        const auth = verifyAuthToken(req);
        if (!auth) {
            jsonResponse(res, 401, { error: 'Unauthorized' });
            return true;
        }
        try {
            const { avatarUrl } = await parseBody(req);
            const updated = await (0, store_js_1.updateUserAvatar)(auth.userId, avatarUrl || null);
            if (!updated) {
                jsonResponse(res, 404, { error: 'User not found' });
                return true;
            }
            jsonResponse(res, 200, {
                success: true,
                avatarUrl: updated.avatarUrl || null,
                user: {
                    id: updated.id,
                    username: updated.username,
                    displayName: updated.displayName,
                    avatarUrl: updated.avatarUrl || null,
                    twoFactorEnabled: updated.twoFactorEnabled,
                },
            });
        }
        catch (err) {
            jsonResponse(res, 400, { error: err.message });
        }
        return true;
    }
    return false;
}
