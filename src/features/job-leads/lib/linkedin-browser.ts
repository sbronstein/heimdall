import { chromium, type BrowserContext } from 'playwright';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

const PROFILE_DIR = join(homedir(), '.heimdall', 'linkedin-profile');

function ensureProfileDir() {
  mkdirSync(PROFILE_DIR, { recursive: true });
}

/**
 * Connect to a remote browser via BROWSER_CDP_ENDPOINT or BROWSER_WS_ENDPOINT,
 * or launch locally.
 *
 * For Docker with a headed Chrome on the host:
 *   1. On host: google-chrome --remote-debugging-port=3005 --user-data-dir=~/.heimdall/linkedin-profile about:blank
 *   2. Set BROWSER_CDP_ENDPOINT=http://host.docker.internal:3005
 *
 * For Docker with Playwright run-server on the host (headless):
 *   Set BROWSER_WS_ENDPOINT=ws://host.docker.internal:3005
 *
 * For local dev: leave both unset to launch Chromium directly.
 */
function getCdpEndpoint(): string | undefined {
  return process.env.BROWSER_CDP_ENDPOINT;
}

function getWsEndpoint(): string | undefined {
  return process.env.BROWSER_WS_ENDPOINT;
}

async function connectRemote(): Promise<{ browser: ReturnType<typeof chromium.connectOverCDP> extends Promise<infer T> ? T : never; mode: 'cdp' | 'ws' }> {
  const cdp = getCdpEndpoint();
  if (cdp) {
    const browser = await chromium.connectOverCDP(cdp);
    return { browser, mode: 'cdp' };
  }
  const ws = getWsEndpoint();
  if (ws) {
    const browser = await chromium.connect(ws);
    return { browser, mode: 'ws' };
  }
  throw new Error('No remote browser endpoint configured');
}

function isRemote(): boolean {
  return !!(getCdpEndpoint() || getWsEndpoint());
}

export async function launchSetup(): Promise<void> {
  ensureProfileDir();
  if (isRemote()) {
    const { browser, mode } = await connectRemote();

    if (mode === 'cdp') {
      // CDP mode: use the browser's default context (the visible window)
      const contexts = browser.contexts();
      const context = contexts[0] || await browser.newContext();
      const page = context.pages()[0] || await context.newPage();
      await page.goto('https://www.linkedin.com/login');

      console.log(
        'Navigated to LinkedIn login in your host browser. Complete login there.'
      );
      await page.waitForURL('**/feed**', { timeout: 300_000 });

      // Save storage state for headless reuse
      await context.storageState({
        path: join(PROFILE_DIR, 'storage-state.json')
      });
      console.log('LinkedIn session saved.');
    } else {
      // WS mode: Playwright server (headless) — create a new context
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();
      await page.goto('https://www.linkedin.com/login');

      console.log(
        'Waiting for LinkedIn login on host browser... Complete login in the browser window.'
      );
      await page.waitForURL('**/feed**', { timeout: 300_000 });

      await context.storageState({
        path: join(PROFILE_DIR, 'storage-state.json')
      });
      console.log('LinkedIn session saved.');
      await context.close();
    }
  } else {
    // Local mode: headed browser with persistent profile
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 }
    });

    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://www.linkedin.com/login');

    await new Promise<void>((resolve) => {
      context.on('close', () => resolve());
    });
  }
}

export async function getContext(): Promise<BrowserContext> {
  ensureProfileDir();
  if (isRemote()) {
    const { browser, mode } = await connectRemote();

    if (mode === 'cdp') {
      // CDP mode: reuse the browser's default context (already logged in)
      const contexts = browser.contexts();
      return contexts[0] || await browser.newContext();
    }

    // WS mode: create new context with saved storage state
    const storagePath = join(PROFILE_DIR, 'storage-state.json');
    return browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: storagePath
    });
  }

  // Local mode: persistent profile directory
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 }
  });
}
