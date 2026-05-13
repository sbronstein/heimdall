import '../_pkg/lib/env.ts';
import { Stagehand } from '@browserbasehq/stagehand';
import { resolveWebSocketDebuggerUrl } from '../_pkg/lib/cdp.ts';

const jobUrl = process.argv[2];
if (!jobUrl) {
  console.error('Usage: npm run spike:002 -- <linkedin-job-url>');
  console.error('Example: npm run spike:002 -- https://www.linkedin.com/jobs/view/3955123456');
  process.exit(1);
}
if (!process.env.BROWSER_CDP_ENDPOINT) {
  console.error('BROWSER_CDP_ENDPOINT not set.');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set.');
  process.exit(1);
}

const startMs = Date.now();
const log = (tag: string, msg: string) => {
  const t = Date.now() - startMs;
  console.log(`[+${String(t).padStart(5, ' ')}ms] [${tag}] ${msg}`);
};

let stagehand: Stagehand | undefined;
let landedOnEmployeeSearch = false;
let finalUrl = '';

try {
  const wsUrl = await resolveWebSocketDebuggerUrl(process.env.BROWSER_CDP_ENDPOINT);
  log('init', `WS URL resolved.`);

  stagehand = new Stagehand({
    env: 'LOCAL',
    localBrowserLaunchOptions: { cdpUrl: wsUrl },
    model: 'anthropic/claude-sonnet-4-5',
    verbose: 1,
  });
  await stagehand.init();
  log('init', 'Stagehand attached.');

  const page = stagehand.context.pages()[0] ?? (await stagehand.context.newPage());

  // Step 1: Go to the job posting.
  log('nav', `Navigating to job posting: ${jobUrl}`);
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2_000);
  log('nav', `On: ${page.url()}`);

  // Step 2: Navigate to the company page. Use observe→act pattern (recommended for resilience).
  log('act', 'observe(): locating the company link on the job posting...');
  const companyCandidates = await stagehand.observe(
    'the link to the company\'s LinkedIn page (usually the company name near the top of the job posting)'
  );
  log('act', `observe() returned ${companyCandidates.length} candidate(s).`);
  if (companyCandidates.length === 0) {
    throw new Error('observe() found no company-link candidates on the job posting.');
  }
  log('act', `act(): clicking ${JSON.stringify(companyCandidates[0]).slice(0, 200)}`);
  const companyResult = await stagehand.act(companyCandidates[0]);
  log('act', `companyResult.success=${companyResult.success}, msg="${companyResult.message}"`);

  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  const afterCompanyClick = page.url();
  log('nav', `After company click: ${afterCompanyClick}`);

  if (!afterCompanyClick.includes('/company/')) {
    log(
      'warn',
      `Expected URL to include /company/. Got ${afterCompanyClick}. Continuing anyway — the page may still be the company page under a different URL pattern.`
    );
  }

  // Step 3: From the company page, get to the employees / people-search view.
  log('act', 'observe(): locating the employees link on the company page...');
  const employeesCandidates = await stagehand.observe(
    'the link that shows the list of employees — usually labeled with a count like "51-200 employees" or "See all NNN employees"'
  );
  log('act', `observe() returned ${employeesCandidates.length} candidate(s).`);
  if (employeesCandidates.length === 0) {
    throw new Error('observe() found no employees-link candidates on the company page.');
  }
  log('act', `act(): clicking ${JSON.stringify(employeesCandidates[0]).slice(0, 200)}`);
  const employeesResult = await stagehand.act(employeesCandidates[0]);
  log('act', `employeesResult.success=${employeesResult.success}, msg="${employeesResult.message}"`);

  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
  const afterEmployees = page.url();
  log('nav', `After employees click: ${afterEmployees}`);

  // Step 4: Apply 2nd-degree connections filter.
  // The current Playwright path appends ?network=%5B%22S%22%5D directly; we ask Stagehand
  // to do it natively so this spike tests the filter-application path too.
  log('act', 'observe(): locating the 2nd-degree connections filter...');
  const filterCandidates = await stagehand.observe(
    'the filter or chip that narrows results to 2nd-degree connections (sometimes labeled "Connections" with options for 1st / 2nd / 3rd+)'
  );
  log('act', `observe() returned ${filterCandidates.length} candidate(s).`);
  if (filterCandidates.length > 0) {
    log('act', `act(): clicking ${JSON.stringify(filterCandidates[0]).slice(0, 200)}`);
    const filterResult = await stagehand.act(filterCandidates[0]);
    log('act', `filterResult.success=${filterResult.success}, msg="${filterResult.message}"`);

    // Filters usually open a popover; ask Stagehand to pick "2nd".
    log('act', 'act(): selecting the 2nd-degree option...');
    const pickSecond = await stagehand.act('select the option for 2nd degree connections');
    log('act', `pickSecond.success=${pickSecond.success}, msg="${pickSecond.message}"`);

    // Confirm the filter (LinkedIn typically requires a "Show results" click).
    log('act', 'act(): applying the filter...');
    const apply = await stagehand.act('apply or show the filtered results');
    log('act', `apply.success=${apply.success}, msg="${apply.message}"`);
  } else {
    log(
      'warn',
      'No 2nd-degree filter candidates found via observe(). The URL may already be filtered, or LinkedIn re-arranged the filter UI.'
    );
  }

  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
  finalUrl = page.url();
  log('nav', `Final URL: ${finalUrl}`);

  // Success criteria: ended up on a people-search URL with currentCompany + a network filter applied.
  const isPeopleSearch =
    finalUrl.includes('/search/results/people') || finalUrl.includes('/people');
  const hasCompanyFilter = finalUrl.includes('currentCompany');
  const hasNetworkFilter = finalUrl.includes('network=') || finalUrl.includes('%22S%22');

  landedOnEmployeeSearch = isPeopleSearch && hasCompanyFilter;

  log(
    'check',
    `isPeopleSearch=${isPeopleSearch}, hasCompanyFilter=${hasCompanyFilter}, hasNetworkFilter=${hasNetworkFilter}`
  );

  if (landedOnEmployeeSearch && hasNetworkFilter) {
    log('verdict', 'PASS — Reached 2nd-degree employee search filtered to the company.');
  } else if (landedOnEmployeeSearch) {
    log(
      'verdict',
      'PARTIAL — Reached the company-filtered people search, but the 2nd-degree network filter is not visible in the URL. May still be applied client-side; inspect manually.'
    );
  } else {
    log(
      'verdict',
      `FAIL — Did not reach a company-filtered people search. Final URL: ${finalUrl}`
    );
  }
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

process.exit(landedOnEmployeeSearch ? 0 : 1);
