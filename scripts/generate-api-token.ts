import { config } from 'dotenv';
config({ path: '.env.local' });
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomBytes, createHash } from 'crypto';

// One-time token generation for the Claude Code skill (D-19, D-21).
//
// Produces:
//   1. A 32-byte random hex token at ~/.heimdall/api-token (chmod 600)
//   2. The SHA-256 hash of that token, printed to stdout for pasting into .env.local
//
// The plaintext token is written ONLY to the file (chmod 600, owner-read-only).
// stdout shows the hash and the file path — never the plaintext. The user pastes
// the hash into .env.local as API_TOKEN_HASH; the middleware (src/proxy.ts)
// then accepts `Authorization: Bearer <plaintext>` and validates by hashing.
//
// Per D-21 the bypass also requires SINGLE_USER_EMAIL=steve@bronstein.org so
// this script reminds the user to set that env var if it isn't already present.

async function main() {
  // 1. Generate 32-byte random hex token (64 hex chars)
  const token = randomBytes(32).toString('hex');

  // 2. SHA-256 hash (64 hex chars) — this is what goes in .env.local
  const hash = createHash('sha256').update(token).digest('hex');

  // 3. Write token to ~/.heimdall/api-token with restrictive permissions
  const dir = path.join(os.homedir(), '.heimdall');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const tokenPath = path.join(dir, 'api-token');
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });

  // 4. Print hash + instructions to stdout (NEVER the plaintext token)
  console.log(`Token written to ${tokenPath} (chmod 600).`);
  console.log('');
  console.log('Add the following to .env.local:');
  console.log('');
  console.log(`  API_TOKEN_HASH=${hash}`);
  const existingEmail = process.env.SINGLE_USER_EMAIL;
  if (existingEmail) {
    console.log(`  # SINGLE_USER_EMAIL=${existingEmail}  (already set)`);
  } else {
    console.log('  SINGLE_USER_EMAIL=steve@bronstein.org');
  }
  console.log('');
  console.log(
    'The middleware (src/proxy.ts) will accept `Authorization: Bearer <token>`'
  );
  console.log('where <token> matches the file contents at ' + tokenPath + '.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
