import '../_pkg/lib/env.ts';
import { Stagehand } from '@browserbasehq/stagehand';
import { resolveWebSocketDebuggerUrl } from '../_pkg/lib/cdp.ts';

const cdpHttp = process.env.BROWSER_CDP_ENDPOINT;
if (!cdpHttp) {
  console.error(
    'BROWSER_CDP_ENDPOINT not set. Set it to your Chrome --remote-debugging endpoint (e.g. http://localhost:3005).'
  );
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set. Stagehand needs an Anthropic key for LLM calls.');
  process.exit(1);
}

const startMs = Date.now();
const log = (tag: string, msg: string) => {
  const t = Date.now() - startMs;
  console.log(`[+${String(t).padStart(5, ' ')}ms] [${tag}] ${msg}`);
};

let stagehand: Stagehand | undefined;
let isAuthenticated = false;

try {
  log('init', `Resolving WS URL from ${cdpHttp}...`);
  const wsUrl = await resolveWebSocketDebuggerUrl(cdpHttp);
  log('init', `Resolved: ${wsUrl}`);

  stagehand = new Stagehand({
    env: 'LOCAL',
    localBrowserLaunchOptions: { cdpUrl: wsUrl },
    model: 'anthropic/claude-sonnet-4-5',
    verbose: 1,
  });

  log('init', 'Calling stagehand.init()...');
  await stagehand.init();
  log('init', 'Stagehand attached. Inspecting context...');

  const pages = stagehand.context.pages();
  log('init', `Found ${pages.length} existing page(s) in attached context.`);

  const page = pages[0] ?? (await stagehand.context.newPage());
  log('nav', 'Navigating to https://www.linkedin.com/feed (requires auth)...');
  await page.goto('https://www.linkedin.com/feed', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  // Brief settle to let any client-side redirects (login/checkpoint) resolve.
  await page.waitForTimeout(2_000);
  const landed = page.url();
  log('check', `Landed on: ${landed}`);

  isAuthenticated =
    landed.includes('/feed') && !landed.includes('/login') && !landed.includes('/checkpoint');

  if (isAuthenticated) {
    log(
      'verdict',
      'PASS — Stagehand attached to existing logged-in Chrome and reached /feed without re-auth.'
    );
  } else {
    log(
      'verdict',
      `FAIL — Landed on ${landed}, expected /feed. Likely the session is not shared into Stagehand's attached context.`
    );
  }

  // Tiny sanity probe of stagehand primitives without burning much budget.
  // We just observe one element — does NOT actually click anything.
  log('observe', 'Asking stagehand.observe() to enumerate one nav element on the page...');
  const actions = await stagehand.observe('the search input at the top of the page');
  log('observe', `Got ${actions.length} candidate action(s). First: ${JSON.stringify(actions[0] ?? null)}`);
} catch (err) {
  log('error', (err as Error).stack ?? String(err));
} finally {
  if (stagehand) {
    try {
      const metrics = await stagehand.metrics;
      log('metrics', JSON.stringify(metrics, null, 2));
    } catch (err) {
      log('metrics', `Could not read metrics: ${(err as Error).message}`);
    }
    await stagehand.close().catch((err: unknown) => {
      log('close', `Error closing: ${(err as Error).message}`);
    });
  }
  log('done', `Total elapsed: ${Date.now() - startMs}ms`);
}

process.exit(isAuthenticated ? 0 : 1);
