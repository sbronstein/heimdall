import '../_pkg/lib/env.ts';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { resolveWebSocketDebuggerUrl } from '../_pkg/lib/cdp.ts';

const searchUrl = process.argv[2];
const runsArg = Number(process.argv[3] ?? '1');
if (!searchUrl) {
  console.error(
    'Usage: npm run spike:003 -- <linkedin-people-search-url> [runs]'
  );
  console.error(
    'Example: npm run spike:003 -- \'https://www.linkedin.com/search/results/people/?currentCompany=%5B%22123456%22%5D&network=%5B%22S%22%5D\' 5'
  );
  process.exit(1);
}
if (!process.env.BROWSER_CDP_ENDPOINT || !process.env.ANTHROPIC_API_KEY) {
  console.error('BROWSER_CDP_ENDPOINT and ANTHROPIC_API_KEY must both be set.');
  process.exit(1);
}

const startMs = Date.now();
const log = (tag: string, msg: string) => {
  const t = Date.now() - startMs;
  console.log(`[+${String(t).padStart(5, ' ')}ms] [${tag}] ${msg}`);
};

// Matches the ScrapedProspect shape in src/features/job-leads/lib/scrape-connections.ts.
const prospectSchema = z.object({
  prospects: z
    .array(
      z.object({
        name: z.string(),
        title: z.string().nullable(),
        linkedinUrl: z.string().nullable(),
        mutualConnectionNames: z.array(z.string()),
      })
    )
    .describe('All visible people on this LinkedIn search results page'),
});

type RunResult = {
  run: number;
  count: number;
  sample: Array<{ name: string; title: string | null; linkedinUrl: string | null; mutualConnectionNames: string[] }>;
  metricsAtEnd: unknown;
  errored: boolean;
  errMsg?: string;
  elapsedMs: number;
};

let stagehand: Stagehand | undefined;
const results: RunResult[] = [];

try {
  const wsUrl = await resolveWebSocketDebuggerUrl(process.env.BROWSER_CDP_ENDPOINT);
  stagehand = new Stagehand({
    env: 'LOCAL',
    localBrowserLaunchOptions: { cdpUrl: wsUrl },
    model: 'anthropic/claude-sonnet-4-5',
    verbose: 1,
  });
  await stagehand.init();
  log('init', 'Stagehand attached.');

  const page = stagehand.context.pages()[0] ?? (await stagehand.context.newPage());

  const runs = Math.max(1, runsArg);
  log('plan', `Running extract() ${runs} time(s) against ${searchUrl}`);

  for (let i = 1; i <= runs; i += 1) {
    const runStart = Date.now();
    log('run', `Starting run ${i}/${runs}...`);

    try {
      // Reload to dodge any client-side caching that would skew per-run cost.
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(2_500);

      const extracted = await stagehand.extract(
        'Extract every visible person on this LinkedIn people-search results page. For each, capture: name, current job title (or null if not shown), the URL to their LinkedIn profile (or null), and the list of mutual connection names shown below their card (empty array if none).',
        prospectSchema
      );

      log('run', `Run ${i}: got ${extracted.prospects.length} prospect(s).`);

      const metrics = await stagehand.metrics;
      results.push({
        run: i,
        count: extracted.prospects.length,
        sample: extracted.prospects.slice(0, 3),
        metricsAtEnd: metrics,
        errored: false,
        elapsedMs: Date.now() - runStart,
      });
    } catch (err) {
      log('run', `Run ${i} errored: ${(err as Error).message}`);
      results.push({
        run: i,
        count: 0,
        sample: [],
        metricsAtEnd: null,
        errored: true,
        errMsg: (err as Error).message,
        elapsedMs: Date.now() - runStart,
      });
    }
  }

  // Verdict
  const successCount = results.filter((r) => !r.errored && r.count > 0).length;
  const total = results.length;
  const ratio = successCount / total;

  log('summary', `${successCount}/${total} runs returned at least one prospect.`);
  log('summary', `First-run sample (up to 3): ${JSON.stringify(results[0]?.sample ?? [], null, 2)}`);

  if (ratio >= 0.8 && successCount >= 1) {
    log('verdict', `PASS — extract() returned the ScrapedProspect shape on ${successCount}/${total} runs.`);
  } else if (successCount >= 1) {
    log(
      'verdict',
      `PARTIAL — extract() worked on ${successCount}/${total} runs. Reliability below 80% needs investigation before committing.`
    );
  } else {
    log('verdict', 'FAIL — extract() returned zero prospects on every run.');
  }
} catch (err) {
  log('error', (err as Error).stack ?? String(err));
} finally {
  if (stagehand) {
    try {
      const metrics = await stagehand.metrics;
      log('metrics-final', JSON.stringify(metrics, null, 2));
    } catch (err) {
      log('metrics-final', `Could not read final metrics: ${(err as Error).message}`);
    }
    await stagehand.close().catch((err: unknown) => {
      log('close', `Error closing: ${(err as Error).message}`);
    });
  }
  log(
    'cost-table',
    'Per-run snapshots (count, elapsedMs):\n' +
      results
        .map(
          (r) =>
            `  run ${r.run}: count=${r.count}, elapsedMs=${r.elapsedMs}${r.errored ? ` ERROR: ${r.errMsg}` : ''}`
        )
        .join('\n')
  );
  log('done', `Total elapsed: ${Date.now() - startMs}ms`);
}

const ok = results.some((r) => !r.errored && r.count > 0);
process.exit(ok ? 0 : 1);
