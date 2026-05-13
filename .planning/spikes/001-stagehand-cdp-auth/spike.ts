import '../_pkg/lib/env.ts';
import { Stagehand } from '@browserbasehq/stagehand';
import { ensureLinkedInLogin, getStagehandConfig } from '../_pkg/lib/browser.ts';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set. Stagehand needs an Anthropic key for LLM calls.');
  console.error('Get one at https://console.anthropic.com and add it to .env.local.');
  process.exit(1);
}

const startMs = Date.now();
const log = (tag: string, msg: string) => {
  const t = Date.now() - startMs;
  console.log(`[+${String(t).padStart(5, ' ')}ms] [${tag}] ${msg}`);
};

let stagehand: Stagehand | undefined;
let success = false;

try {
  log('init', 'Building Stagehand config (headed Chromium by default; CDP if BROWSER_CDP_ENDPOINT set)...');
  const config = await getStagehandConfig();
  log(
    'init',
    `Using ${process.env.BROWSER_CDP_ENDPOINT ? `CDP endpoint ${process.env.BROWSER_CDP_ENDPOINT}` : 'headed Chromium with persistent profile ~/.heimdall/linkedin-profile'}.`
  );

  stagehand = new Stagehand(config);
  log('init', 'Calling stagehand.init()...');
  await stagehand.init();
  log('init', 'Stagehand attached.');

  const pages = stagehand.context.pages();
  log('init', `Found ${pages.length} page(s) in the context.`);
  const page = pages[0] ?? (await stagehand.context.newPage());

  await ensureLinkedInLogin(page, log);

  // Tiny sanity probe of stagehand's LLM primitives — does NOT actually click.
  log('observe', 'Asking stagehand.observe() to enumerate one nav element on the page...');
  const actions = await stagehand.observe('the global search input near the top of the LinkedIn page');
  log(
    'observe',
    `Got ${actions.length} candidate action(s). First: ${JSON.stringify(actions[0] ?? null)}`
  );

  success = true;
  log('verdict', 'PASS — Stagehand launched, attached, reached an authenticated LinkedIn /feed, and observe() returned candidates.');
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

process.exit(success ? 0 : 1);
