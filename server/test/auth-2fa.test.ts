import http from 'http';
import assert from 'node:assert';
import { handleAuthRoute } from '../src/auth/routes.js';
import { generateTOTP } from '../src/auth/totp.js';

const TEST_PORT = 5055;

async function makeRequest(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let responseText = '';
        res.on('data', (chunk) => (responseText += chunk));
        res.on('end', () => {
          let data = {};
          try {
            data = JSON.parse(responseText);
          } catch {
            data = { text: responseText };
          }
          resolve({ status: res.statusCode || 500, data });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runAuth2FATests() {
  console.log('--- Starting Two-Step Authentication (Google Authenticator) Tests ---');

  // Create test HTTP server
  const server = http.createServer(async (req, res) => {
    const url = req.url || '';
    const host = req.headers.host || 'localhost';
    const parsedUrl = new URL(url, `http://${host}`);
    const handled = await handleAuthRoute(req, res, parsedUrl.pathname);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, '127.0.0.1', () => resolve());
  });
  console.log(`[Auth Test Server] Listening on 127.0.0.1:${TEST_PORT}`);

  try {
    const testUsername = `user_${Date.now()}`;
    const testPassword = 'securePassword123';

    // ----------------------------------------------------
    // Test 1: Register with enable2FA: true returns QR code & setup session
    // ----------------------------------------------------
    console.log('Test 1: Register with enable2FA: true returns QR code & tempToken');
    const regRes = await makeRequest('POST', '/api/auth/register', {
      username: testUsername,
      password: testPassword,
      displayName: 'Test User',
      enable2FA: true,
    });
    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.data.require2FASetup, true);
    assert.ok(regRes.data.tempToken, 'tempToken should be present');
    assert.ok(regRes.data.secret, 'Base32 secret should be present');
    assert.strictEqual(regRes.data.secret.length, 32, 'Secret should be standard 32-character RFC 6238 Base32');
    assert.ok(regRes.data.qrCode.startsWith('data:image/png;base64,'), 'QR Code data URL should be present');
    assert.ok(regRes.data.otpauthUrl.includes('otpauth://totp/'), 'otpauth URL should be present');
    console.log('✔ Passed Test 1');

    const tempToken = regRes.data.tempToken;
    const secret = regRes.data.secret;

    // ----------------------------------------------------
    // Test 2: Reject invalid 6-digit TOTP code during 2FA setup
    // ----------------------------------------------------
    console.log('Test 2: Reject invalid 6-digit code on login-setup-verify');
    const invalidVerifyRes = await makeRequest('POST', '/api/auth/2fa/login-setup-verify', {
      tempToken,
      code: '000000',
    });
    assert.strictEqual(invalidVerifyRes.status, 400);
    assert.ok(invalidVerifyRes.data.error.includes('Invalid 6-digit code'));
    console.log('✔ Passed Test 2');

    // ----------------------------------------------------
    // Test 3: Dev current-code endpoint returns valid TOTP code
    // ----------------------------------------------------
    console.log('Test 3: POST /api/auth/2fa/current-code generates current TOTP');
    const codeRes = await makeRequest('POST', '/api/auth/2fa/current-code', {
      tempToken,
    });
    assert.strictEqual(codeRes.status, 200);
    assert.strictEqual(typeof codeRes.data.code, 'string');
    assert.strictEqual(codeRes.data.code.length, 6);
    console.log('✔ Passed Test 3');

    // ----------------------------------------------------
    // Test 4: Confirm 2FA setup with valid Google Authenticator TOTP code
    // ----------------------------------------------------
    console.log('Test 4: Confirm 2FA setup with valid Google Authenticator TOTP code');
    const validTOTP = generateTOTP(secret);
    const setupVerifyRes = await makeRequest('POST', '/api/auth/2fa/login-setup-verify', {
      tempToken,
      code: validTOTP,
    });
    assert.strictEqual(setupVerifyRes.status, 200);
    assert.ok(setupVerifyRes.data.token, 'Session JWT token should be returned');
    assert.strictEqual(setupVerifyRes.data.user.twoFactorEnabled, true);
    console.log('✔ Passed Test 4');

    // ----------------------------------------------------
    // Test 5: Next login for this user requires 2FA code
    // ----------------------------------------------------
    console.log('Test 5: Subsequent login automatically requires Two-Step Google Authenticator code');
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      username: testUsername,
      password: testPassword,
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.data.require2FA, true);
    assert.ok(loginRes.data.tempToken, 'tempToken for 2FA should be returned');
    console.log('✔ Passed Test 5');

    const loginTempToken = loginRes.data.tempToken;

    // ----------------------------------------------------
    // Test 6: Verify 2FA code during login with invalid code is rejected
    // ----------------------------------------------------
    console.log('Test 6: Reject invalid code during 2FA login');
    const loginInvalidVerify = await makeRequest('POST', '/api/auth/2fa/login-verify', {
      tempToken: loginTempToken,
      code: '999999',
    });
    assert.strictEqual(loginInvalidVerify.status, 400);
    console.log('✔ Passed Test 6');

    // ----------------------------------------------------
    // Test 7: Verify 2FA code during login with valid Google Authenticator code succeeds
    // ----------------------------------------------------
    console.log('Test 7: Complete 2FA login with valid Google Authenticator code');
    const currentLoginCode = generateTOTP(secret);
    const loginValidVerify = await makeRequest('POST', '/api/auth/2fa/login-verify', {
      tempToken: loginTempToken,
      code: currentLoginCode,
    });
    assert.strictEqual(loginValidVerify.status, 200);
    assert.ok(loginValidVerify.data.token, 'Session JWT token returned after 2FA');
    assert.strictEqual(loginValidVerify.data.user.twoFactorEnabled, true);
    console.log('✔ Passed Test 7');

    // ----------------------------------------------------
    // Test 8: Login with enable2FA: true on existing user without 2FA triggers setup
    // ----------------------------------------------------
    console.log('Test 8: Login with enable2FA: true on user without 2FA triggers QR code setup');
    const user2 = `user2_${Date.now()}`;
    await makeRequest('POST', '/api/auth/register', {
      username: user2,
      password: testPassword,
      displayName: 'User Two',
      enable2FA: false,
    });

    const loginWith2FASetup = await makeRequest('POST', '/api/auth/login', {
      username: user2,
      password: testPassword,
      enable2FA: true,
    });
    assert.strictEqual(loginWith2FASetup.status, 200);
    assert.strictEqual(loginWith2FASetup.data.require2FASetup, true);
    assert.ok(loginWith2FASetup.data.qrCode, 'QR code should be provided during login');
    assert.ok(loginWith2FASetup.data.secret, 'Secret should be provided during login');
    console.log('✔ Passed Test 8');

    // ----------------------------------------------------
    // Test 9: Every time user logs in, Google Authenticator QR code must be returned to re-verify
    // ----------------------------------------------------
    console.log('Test 9: Every login returns Google Authenticator QR code for re-verification');
    const reverifyLogin = await makeRequest('POST', '/api/auth/login', {
      username: testUsername,
      password: testPassword,
    });
    assert.strictEqual(reverifyLogin.status, 200);
    assert.strictEqual(reverifyLogin.data.require2FA, true);
    assert.ok(reverifyLogin.data.qrCode.startsWith('data:image/png;base64,'), 'QR Code data URL must be returned on every login');
    assert.strictEqual(reverifyLogin.data.secret, secret, 'Persistent TOTP secret must be returned');
    assert.ok(reverifyLogin.data.otpauthUrl.includes(`otpauth://totp/TelegramWeb:${testUsername}`), 'otpauth URL must be valid');
    
    // Complete re-verification with current code
    const reverifyCode = generateTOTP(secret);
    const reverifySuccess = await makeRequest('POST', '/api/auth/2fa/login-verify', {
      tempToken: reverifyLogin.data.tempToken,
      code: reverifyCode,
    });
    assert.strictEqual(reverifySuccess.status, 200);
    assert.ok(reverifySuccess.data.token, 'Token returned after re-verification');
    console.log('✔ Passed Test 9');

    console.log('\n--- All 9 Two-Step Authentication Tests Passed Successfully! ---');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runAuth2FATests().catch((err) => {
  console.error('2FA Test failed:', err);
  process.exit(1);
});
