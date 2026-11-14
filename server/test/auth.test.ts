import assert from 'node:assert';
import {
  generateBase32Secret,
  generateTOTP,
  verifyTOTP,
  hashPassword,
  verifyPassword,
} from '../src/auth/totp.js';

async function testTOTP() {
  console.log('--- Testing Google Authenticator TOTP & Security Logic ---');

  // Test 1: Password hashing & verification
  console.log('Test 1: Password hashing & timing-safe verification');
  const pass = 'superSecretPassword!2026';
  const hashed = hashPassword(pass);
  assert(hashed.includes(':'));
  assert(verifyPassword(pass, hashed) === true);
  assert(verifyPassword('wrongPassword', hashed) === false);
  console.log('✔ Password hashing verified');

  // Test 2: Base32 secret generation
  console.log('Test 2: Base32 secret generation for Google Authenticator');
  const secret = generateBase32Secret(20);
  assert.strictEqual(secret.length, 20);
  assert(/^[A-Z2-7]+$/.test(secret));
  console.log('✔ Base32 secret format verified:', secret);

  // Test 3: TOTP 6-digit generation (RFC 6238)
  console.log('Test 3: TOTP code generation');
  const code = generateTOTP(secret);
  assert.strictEqual(code.length, 6);
  assert(/^\d{6}$/.test(code));
  console.log('✔ Generated 6-digit TOTP code:', code);

  // Test 4: TOTP code verification
  console.log('Test 4: TOTP code verification with window tolerance');
  assert(verifyTOTP(code, secret) === true);
  assert(verifyTOTP('000000', secret) === false);
  assert(verifyTOTP('12345', secret) === false);
  console.log('✔ TOTP verification logic verified');

  console.log('--- All Auth & 2FA Tests Passed! ---');
}

testTOTP().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
