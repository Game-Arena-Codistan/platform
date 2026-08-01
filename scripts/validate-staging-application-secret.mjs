import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error('Usage: node scripts/validate-staging-application-secret.mjs <secret.json>');
  process.exit(2);
}

const requiredKeys = [
  'otp_primary_name',
  'otp_primary_endpoint',
  'otp_primary_api_key',
  'otp_secondary_name',
  'otp_secondary_endpoint',
  'otp_secondary_api_key',
  'jazzcash_webhook_secret',
  'jazzcash_merchant_id',
  'jazzcash_password',
  'jazzcash_integrity_salt',
  'jazzcash_action_url',
  'topup_offers_json',
  'voucher_codes_json'
];
const forbiddenKeys = ['ADMIN_API_KEYS', 'admin_api_keys', 'database_url', 'DATABASE_URL'];
const failures = [];
let secret;

try {
  secret = JSON.parse(await readFile(resolve(path), 'utf8'));
} catch (error) {
  console.error(`Unable to read a JSON object from ${path}: ${error.message}`);
  process.exit(1);
}

if (!secret || Array.isArray(secret) || typeof secret !== 'object') failures.push('Secret must be a JSON object.');
for (const key of requiredKeys) {
  if (!(key in secret)) failures.push(`Missing required key: ${key}`);
  else if (typeof secret[key] !== 'string') failures.push(`${key} must be a string.`);
}
for (const key of forbiddenKeys) {
  if (key in secret) failures.push(`Forbidden key present: ${key}`);
}
for (const key of ['otp_primary_endpoint', 'otp_primary_api_key', 'otp_secondary_endpoint', 'otp_secondary_api_key', 'jazzcash_merchant_id', 'jazzcash_password', 'jazzcash_integrity_salt', 'jazzcash_action_url']) {
  if (secret?.[key]) failures.push(`${key} must remain empty for the initial mock-only staging deployment.`);
}
if ((secret?.jazzcash_webhook_secret ?? '').length < 32) failures.push('jazzcash_webhook_secret must contain at least 32 characters of generated entropy.');

try {
  const offers = JSON.parse(secret?.topup_offers_json ?? 'null');
  if (!Array.isArray(offers) || offers.length === 0) throw new Error('must be a non-empty array');
  const ids = new Set();
  for (const offer of offers) {
    if (!offer || typeof offer !== 'object' || Array.isArray(offer)) throw new Error('each offer must be an object');
    if (!/^[a-z0-9-]+$/.test(String(offer.id ?? ''))) throw new Error('offer IDs must be lowercase slugs');
    if (ids.has(offer.id)) throw new Error(`duplicate offer ID: ${offer.id}`);
    ids.add(offer.id);
    if (!String(offer.label ?? '').trim()) throw new Error(`offer ${offer.id} needs a label`);
    if (!Number.isInteger(offer.coins) || offer.coins < 1) throw new Error(`offer ${offer.id} has invalid coins`);
    if (!Number.isFinite(offer.amountPkr) || offer.amountPkr < 1) throw new Error(`offer ${offer.id} has invalid amountPkr`);
  }
} catch (error) {
  failures.push(`topup_offers_json is invalid: ${error.message}`);
}

try {
  const vouchers = JSON.parse(secret?.voucher_codes_json ?? 'null');
  if (!vouchers || Array.isArray(vouchers) || typeof vouchers !== 'object') throw new Error('must be an object');
  if (Object.keys(vouchers).length === 0) throw new Error('must contain at least one staging voucher');
  for (const [code, coins] of Object.entries(vouchers)) {
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) throw new Error(`invalid voucher code: ${code}`);
    if (!Number.isInteger(coins) || coins < 1) throw new Error(`voucher ${code} has invalid coin value`);
  }
} catch (error) {
  failures.push(`voucher_codes_json is invalid: ${error.message}`);
}

if (failures.length) {
  console.error(`Staging application secret validation failed with ${failures.length} finding(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Staging application secret is valid for mock OTP and mock JazzCash deployment.');
