import {randomBytes} from 'node:crypto';
import {chmod, mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

function parseArgs(argv) {
  const options = {output: 'staging-application-secret.generated.json', force: false};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--force') {
      options.force = true;
      continue;
    }
    if (value === '--output') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error('--output requires a file path.');
      options.output = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const outputPath = resolve(options.output);
const voucherCode = `STAGING-${randomBytes(6).toString('hex').toUpperCase()}`;
const applicationSecret = {
  otp_primary_name: 'mock-primary',
  otp_primary_endpoint: '',
  otp_primary_api_key: '',
  otp_secondary_name: 'mock-secondary',
  otp_secondary_endpoint: '',
  otp_secondary_api_key: '',
  jazzcash_webhook_secret: randomBytes(32).toString('base64url'),
  jazzcash_merchant_id: '',
  jazzcash_password: '',
  jazzcash_integrity_salt: '',
  jazzcash_action_url: '',
  topup_offers_json: JSON.stringify([
    {id: 'staging-small', label: 'Starter Coins', coins: 100, amountPkr: 99, status: 'live'},
    {id: 'staging-value', label: 'Value Coins', coins: 550, amountPkr: 499, status: 'live', recommended: true},
    {id: 'staging-max', label: 'Max Coins', coins: 1200, amountPkr: 999, status: 'live'}
  ]),
  voucher_codes_json: JSON.stringify({[voucherCode]: 500})
};

await mkdir(dirname(outputPath), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(applicationSecret, null, 2)}\n`, {
  encoding: 'utf8',
  flag: options.force ? 'w' : 'wx',
  mode: 0o600
});
await chmod(outputPath, 0o600);

console.log(`Created a staging-only application secret at ${outputPath}.`);
console.log('The generated file is ignored by Git. Validate it before storing it in AWS Secrets Manager.');
