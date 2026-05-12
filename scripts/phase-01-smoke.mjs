#!/usr/bin/env node
// Phase 1 smoke verification (BUG-01 + BUG-02). One-shot, throwaway script.
// Launches a visible Chromium window, pauses for the human to sign in via Clerk,
// then drives /dashboard/overview + /dashboard/networking + every sidebar link
// and the avatar dropdown while capturing console messages.

import { chromium } from 'playwright';

const BASE = 'http://localhost:4000';
const HYDRATION_PATTERNS = [
  /hydration/i,
  /did not match/i,
  /text content does not match server-rendered html/i,
  /expected server html to contain/i,
  /minified react error #(418|419|421|422|425)/i,
];

const consoleEvents = []; // { type, text, location, page }
let currentPageLabel = 'startup';

function recordConsole(msg) {
  const text = msg.text();
  consoleEvents.push({
    type: msg.type(),
    text,
    location: msg.location(),
    page: currentPageLabel,
  });
}

function recordPageError(err) {
  consoleEvents.push({
    type: 'pageerror',
    text: err.message + (err.stack ? '\n' + err.stack : ''),
    location: {},
    page: currentPageLabel,
  });
}

function hydrationHits() {
  return consoleEvents.filter((e) =>
    HYDRATION_PATTERNS.some((p) => p.test(e.text)),
  );
}

async function waitForSidebar(page) {
  // The sidebar is rendered by AppSidebar; wait for at least one link to "Dashboard / Overview" area.
  await page.waitForLoadState('domcontentloaded');
  // Best-effort: wait for any link or sidebar nav structure to appear.
  await page
    .waitForSelector('aside, [data-sidebar="sidebar"], nav', { timeout: 15000 })
    .catch(() => {});
}

async function gotoAndCapture(page, url, label) {
  currentPageLabel = label;
  console.log(`\n[goto] ${label} -> ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForSidebar(page);
  // Settle a beat so any post-mount hydration warnings have a chance to fire.
  await page.waitForTimeout(1500);
}

async function collectSidebarLinks(page) {
  // Match <Link href='/dashboard/...'> in the sidebar. Use a robust selector.
  const links = await page.$$eval(
    'a[href^="/dashboard"]',
    (els) =>
      Array.from(
        new Set(
          els
            .map((a) => a.getAttribute('href'))
            .filter((h) => !!h && h.startsWith('/dashboard')),
        ),
      ),
  );
  return links;
}

async function clickAvatarDropdown(page) {
  currentPageLabel = 'avatar-dropdown';
  console.log('\n[click] sidebar-footer user avatar dropdown');
  // The trigger is a SidebarMenuButton with size='lg' that wraps UserAvatarProfile in SidebarFooter.
  // Strategy: find a button containing the UserAvatarProfile span + chevron icon. Fall back to last menu button.
  const buttons = await page.$$('button');
  let clicked = false;
  for (const btn of buttons.reverse()) {
    const html = await btn.evaluate((el) => el.outerHTML).catch(() => '');
    if (html.includes('IconChevronsDown') || /chevrons[- ]?down/i.test(html)) {
      await btn.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    // Heuristic fallback: click the last visible button inside <aside>
    const candidate = await page.$('aside button:last-of-type, [data-sidebar="footer"] button');
    if (candidate) {
      await candidate.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
    }
  }
  await page.waitForTimeout(800);
  // Look for the dropdown content (radix menu).
  const menuVisible = await page
    .$('[role="menu"], [data-radix-menu-content]')
    .then((el) => !!el)
    .catch(() => false);
  return { clicked, menuVisible };
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1400,900'],
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  page.on('console', recordConsole);
  page.on('pageerror', recordPageError);

  console.log('=== Phase 1 smoke verification ===');
  console.log('Step 1: opening sign-in page; please complete Clerk login as steve@bronstein.org');

  currentPageLabel = 'auth/sign-in';
  await page.goto(`${BASE}/auth/sign-in`, { waitUntil: 'domcontentloaded' });

  // Wait for the URL to reach /dashboard/* (signed-in). Generous timeout: 5 minutes.
  console.log('Waiting for sign-in (up to 5 min)...');
  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), {
    timeout: 5 * 60 * 1000,
  });
  console.log('Sign-in detected. Current URL:', page.url());

  // Clear console events accumulated during the sign-in flow — those are Clerk's,
  // not the dashboard's. Phase 1 cares about hydration on dashboard routes.
  consoleEvents.length = 0;

  // Step 2: /dashboard/overview
  await gotoAndCapture(page, `${BASE}/dashboard/overview`, '/dashboard/overview');

  // Step 3: enumerate every sidebar link and click each.
  const links = await collectSidebarLinks(page);
  console.log(`\n[sidebar] discovered ${links.length} links:`);
  for (const l of links) console.log(`  - ${l}`);

  for (const href of links) {
    if (href === '/dashboard/overview') continue; // already there
    await gotoAndCapture(page, `${BASE}${href}`, href);
  }

  // Step 4: /dashboard/networking explicitly (mentioned in plan)
  if (!links.includes('/dashboard/networking')) {
    await gotoAndCapture(page, `${BASE}/dashboard/networking`, '/dashboard/networking');
  }

  // Step 5: avatar dropdown.
  // Re-navigate to overview to ensure consistent sidebar state.
  await gotoAndCapture(page, `${BASE}/dashboard/overview`, '/dashboard/overview-for-dropdown');
  const dropdown = await clickAvatarDropdown(page);
  console.log(`\n[dropdown] clicked=${dropdown.clicked} menuVisible=${dropdown.menuVisible}`);

  // Take a screenshot for the record.
  const shotPath = '/tmp/heimdall-phase-01-dropdown.png';
  await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
  console.log(`[screenshot] ${shotPath}`);

  // Report.
  const hits = hydrationHits();
  console.log('\n=== Console summary ===');
  console.log(`Total console events on dashboard routes: ${consoleEvents.length}`);
  console.log(`Hydration-pattern matches: ${hits.length}`);

  if (hits.length > 0) {
    console.log('\n--- Hydration events ---');
    for (const h of hits) {
      console.log(`[${h.page}] (${h.type}) ${h.text}`);
    }
  }

  // Also surface page errors (any) and console.errors that weren't hydration.
  const errors = consoleEvents.filter(
    (e) =>
      (e.type === 'error' || e.type === 'pageerror') &&
      !HYDRATION_PATTERNS.some((p) => p.test(e.text)),
  );
  console.log(`\nOther console.error / pageerror events: ${errors.length}`);
  for (const e of errors.slice(0, 20)) {
    console.log(`[${e.page}] (${e.type}) ${e.text.slice(0, 400)}`);
  }

  console.log('\n=== Smoke verdict ===');
  if (hits.length === 0 && dropdown.menuVisible) {
    console.log('PASS — zero hydration warnings, dropdown opens, every sidebar route loaded.');
  } else if (hits.length === 0 && !dropdown.menuVisible) {
    console.log('PARTIAL — no hydration warnings, but dropdown did not open. Investigate.');
  } else {
    console.log('FAIL — hydration warnings detected. See above.');
  }

  await browser.close();
  process.exit(hits.length === 0 && dropdown.menuVisible ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke script crashed:', err);
  process.exit(2);
});
