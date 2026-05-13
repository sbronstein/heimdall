/**
 * Loads the project's .env.local so spike scripts pick up BROWSER_CDP_ENDPOINT
 * and ANTHROPIC_API_KEY without needing them in the shell. Import this file
 * for its side effect at the top of every spike script:
 *
 *   import './_pkg/lib/env.ts';
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
// .planning/spikes/_pkg/lib/env.ts → project root is 4 levels up
const projectRoot = resolve(here, '../../../../');
const envPath = resolve(projectRoot, '.env.local');

if (existsSync(envPath)) {
  config({ path: envPath });
} else {
  console.warn(`[spike-env] No .env.local found at ${envPath}. Falling back to process.env.`);
}
