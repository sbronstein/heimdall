import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import type { ConstructorParams } from '@browserbasehq/stagehand';
import type { Page } from 'playwright-core';
import { resolveWebSocketDebuggerUrl } from './cdp.ts';

/**
 * Persistent userDataDir for the LinkedIn-logged-in Chromium profile. Matches
 * the directory used by `src/features/job-leads/lib/linkedin-browser.ts`, so a
 * login persisted there is reused across both the production scraper and the
 * Stagehand spikes.
 */
const PROFILE_DIR = join(homedir(), '.heimdall', 'linkedin-profile');

const MODEL = 'anthropic/claude-sonnet-4-5';

/**
 * Returns a Stagehand constructor config.
 *
 * - If `BROWSER_CDP_ENDPOINT` is set, attaches to that existing Chrome
 *   (matches the project's prod-style scraping flow).
 * - Otherwise, launches a **headed** Chromium with a persistent profile at
 *   `~/.heimdall/linkedin-profile/`. First-time use will require an
 *   interactive LinkedIn login in the visible window; subsequent runs reuse
 *   the saved cookies.
 */
export async function getStagehandConfig(): Promise<ConstructorParams> {
  const cdpHttp = process.env.BROWSER_CDP_ENDPOINT;
  if (cdpHttp) {
    const wsUrl = await resolveWebSocketDebuggerUrl(cdpHttp);
    return {
      env: 'LOCAL',
      localBrowserLaunchOptions: { cdpUrl: wsUrl },
      model: MODEL,
      verbose: 1,
    } satisfies ConstructorParams;
  }

  mkdirSync(PROFILE_DIR, { recursive: true });
  return {
    env: 'LOCAL',
    localBrowserLaunchOptions: {
      headless: false,
      userDataDir: PROFILE_DIR,
    },
    model: MODEL,
    verbose: 1,
  } satisfies ConstructorParams;
}

/**
 * Navigates to LinkedIn's feed and pauses for an interactive login if the
 * persisted session is missing or expired. Resolves once the browser is on
 * `/feed` (i.e. the user is signed in). Times out after 5 minutes.
 */
export async function ensureLinkedInLogin(
  page: Page,
  log: (tag: string, msg: string) => void
): Promise<void> {
  log('auth', 'Navigating to https://www.linkedin.com/feed to check login state...');
  await page.goto('https://www.linkedin.com/feed', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(1_500);

  const current = page.url();
  if (
    current.includes('/feed') &&
    !current.includes('/login') &&
    !current.includes('/checkpoint')
  ) {
    log('auth', `Already signed in (${current}). Continuing.`);
    return;
  }

  log('auth', `Not signed in (currently ${current}).`);
  log('auth', '');
  log('auth', '  ┌────────────────────────────────────────────────────────────────┐');
  log('auth', '  │  ➤ Sign in to LinkedIn in the open Chrome window.              │');
  log('auth', '  │  ➤ The spike will resume automatically when you reach /feed.  │');
  log('auth', '  │  ➤ Timeout: 5 minutes.                                        │');
  log('auth', '  └────────────────────────────────────────────────────────────────┘');
  log('auth', '');

  await page.waitForURL('**/feed**', { timeout: 5 * 60_000 });
  log('auth', `Login detected (${page.url()}). Continuing.`);
}
