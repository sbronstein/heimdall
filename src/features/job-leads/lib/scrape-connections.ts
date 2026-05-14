import { type BrowserContext, type Page } from 'playwright';
import { getContext } from './linkedin-browser';

export type ScrapedProspect = {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  profileSnippet: string | null;
  mutualConnectionNames: string[];
};

/**
 * Navigate from job posting → company page → employees list.
 * This follows the actual LinkedIn UI flow:
 * 1. Go to job posting
 * 2. Click company name link at top
 * 3. Click "X-X employees" link on company page
 * 4. Now we're on the people search filtered to this company
 */
async function navigateToEmployeeList(
  page: Page,
  jobUrl: string
): Promise<boolean> {
  // Step 1: Go to job posting
  console.log('Navigating to job posting...');
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for page content to render
  await page.waitForTimeout(5000);

  // Debug: find all links on the page to understand the DOM
  const pageLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    return Array.from(links)
      .filter(a => a.href && !a.href.includes('javascript:'))
      .slice(0, 30)
      .map(a => ({ text: (a.textContent?.trim() || '').slice(0, 60), href: a.href.slice(0, 120) }));
  });
  console.log('Links on job page:', JSON.stringify(pageLinks, null, 2));

  // Step 2: Click the company link — try multiple strategies
  // Strategy 1: direct href match
  let companyClicked = false;
  const companyLink = await page.locator('a[href*="/company/"]').first().getAttribute('href').catch(() => null);
  if (companyLink) {
    await page.locator('a[href*="/company/"]').first().click();
    companyClicked = true;
    console.log('Clicked company link (href match)');
  }

  // Strategy 2: if the company name is known, click the link with that text
  if (!companyClicked) {
    // The company name link is usually near the top of the job posting
    const companyNameLink = await page.evaluate((name) => {
      const links = document.querySelectorAll('a');
      for (const a of links) {
        if (a.textContent?.trim().toLowerCase().includes(name.toLowerCase())) {
          return a.href;
        }
      }
      return null;
    }, 'point');

    if (companyNameLink && companyNameLink.includes('/company/')) {
      await page.goto(companyNameLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
      companyClicked = true;
      console.log('Navigated to company via text match');
    }
  }

  if (!companyClicked) {
    console.log('Could not find company link on job page');
    return false;
  }

  // Wait for company page to render
  await page.waitForTimeout(5000);
  console.log('On company page:', page.url());

  // Step 3: Find and click the employees link (e.g. "51-200 employees")
  // Log what links are visible to help debug
  const allLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .filter(a => a.textContent?.match(/employ|people|staff/i) || a.href?.includes('/people'))
      .map(a => ({ text: a.textContent?.trim().slice(0, 80), href: a.href }))
      .slice(0, 10);
  });
  console.log('Employee-related links found:', JSON.stringify(allLinks, null, 2));

  // First try: find a link with currentCompany in the href (the people search link)
  const peopleSearchHref = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const a of links) {
      if (a.href?.includes('currentCompany')) return a.href;
    }
    return null;
  });

  if (peopleSearchHref) {
    // Extract just the currentCompany param and build a clean search URL
    const companyMatch = peopleSearchHref.match(/currentCompany=(\d+)/);
    const companyId = companyMatch ? companyMatch[1] : null;

    let targetUrl: string;
    if (companyId) {
      // Build a clean URL with only company + 2nd-degree filters
      targetUrl = `https://www.linkedin.com/search/results/people/?currentCompany=%5B%22${companyId}%22%5D&network=%5B%22S%22%5D`;
    } else {
      // Fall back to the original href, just add network filter
      targetUrl = peopleSearchHref;
      if (!targetUrl.includes('network=')) {
        targetUrl += `${targetUrl.includes('?') ? '&' : '?'}network=%5B%22S%22%5D`;
      }
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log(`Navigated to people search: ${targetUrl}`);
    return true;
  }

  // Fallback: try clicking various employee-related links
  const employeeLinkSelectors = [
    'a[href*="/people"]',
    'a:has-text("employees")',
    'a:has-text("employee")',
    '.org-top-card-summary-info-list__info-item a',
    '.face-pile-module a'
  ];

  for (const selector of employeeLinkSelectors) {
    try {
      const link = page.locator(selector).first();
      if (await link.isVisible({ timeout: 2000 })) {
        await link.click();
        await page.waitForTimeout(3000);
        console.log('Clicked employees link');

        // Add 2nd-degree filter
        const currentUrl = page.url();
        if (!currentUrl.includes('network=')) {
          const separator = currentUrl.includes('?') ? '&' : '?';
          await page.goto(`${currentUrl}${separator}network=%5B%22S%22%5D`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);
        }
        return true;
      }
    } catch {
      // Try next selector
    }
  }

  console.log('Could not find employees link on company page');
  return false;
}

async function scrapeResultsPage(page: Page): Promise<ScrapedProspect[]> {
  const results: ScrapedProspect[] = [];

  // Wait a moment for results to render
  await page.waitForTimeout(1000);

  // Wait for search results to render — LinkedIn uses obfuscated class names,
  // so wait for profile links to appear instead
  try {
    await page.waitForSelector('a[href*="/in/"]', { timeout: 15000 });
  } catch {
    console.log('Timed out waiting for results to render');
    return results;
  }
  await page.waitForTimeout(2000);

  // Extract results directly via page.evaluate — more resilient than locators
  // since LinkedIn's DOM uses obfuscated class names
  const extracted = await page.evaluate(() => {
    const people: Array<{
      name: string;
      title: string | null;
      linkedinUrl: string | null;
      mutualText: string | null;
    }> = [];

    // Find all profile links (href contains "/in/")
    const profileLinks = document.querySelectorAll('a[href*="/in/"]');
    const seen = new Set<string>();

    for (const link of profileLinks) {
      const href = link.getAttribute('href');
      if (!href || seen.has(href)) continue;

      // Get the name from the link's visible text
      const nameEl = link.querySelector('span[aria-hidden="true"]') || link;
      const name = nameEl.textContent?.trim() || '';
      if (!name || name === 'LinkedIn Member' || name.length < 2) continue;

      // Deduplicate by URL
      const cleanUrl = href.split('?')[0];
      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);

      // Walk up to find the containing card/list item
      let container = link.closest('li') || link.parentElement?.parentElement?.parentElement;

      let title: string | null = null;
      let mutualText: string | null = null;

      if (container) {
        // Get all text blocks in the container
        const textBlocks = container.querySelectorAll('span, div, p');
        const texts: string[] = [];
        for (const el of textBlocks) {
          const t = el.textContent?.trim();
          if (t && t !== name && t.length > 3 && t.length < 200) {
            texts.push(t);
          }
        }

        // The title/role is usually the first non-name text block
        for (const t of texts) {
          if (!t.includes('mutual') && !t.includes('Connect') && !t.includes('Message') && !t.includes('Follow')) {
            title = t;
            break;
          }
        }

        // Mutual connections text
        for (const t of texts) {
          if (t.includes('mutual') || t.includes('connection')) {
            mutualText = t;
            break;
          }
        }
      }

      people.push({
        name,
        title,
        linkedinUrl: cleanUrl,
        mutualText
      });
    }

    return people;
  });

  console.log(`Extracted ${extracted.length} people from page`);

  for (const person of extracted) {
    const mutualConnectionNames = extractMutualNames(person.mutualText || '');
    results.push({
      name: person.name,
      title: person.title,
      linkedinUrl: person.linkedinUrl,
      profileSnippet: null,
      mutualConnectionNames
    });
  }

  return results;
}

function extractMutualNames(text: string): string[] {
  if (!text) return [];
  // Pattern: "John Smith and 3 other mutual connections"
  // or "John Smith, Jane Doe, and 2 other mutual connections"
  const names: string[] = [];
  const parts = text.split(/,\s*and\s+\d+\s+other|,\s*|\s+and\s+/);
  for (const part of parts) {
    const clean = part.replace(/\d+\s*(other\s+)?mutual\s+connections?/i, '').trim();
    if (clean && !clean.match(/^\d+$/) && clean !== 'mutual connection') {
      names.push(clean);
    }
  }
  return names;
}

function hasNextPage(page: Page): Promise<boolean> {
  return page
    .locator('button[aria-label="Next"]')
    .isEnabled({ timeout: 2000 })
    .catch(() => false);
}

async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextBtn = page.locator('button[aria-label="Next"]');
    if (await nextBtn.isEnabled({ timeout: 2000 })) {
      await nextBtn.click();
      await page.waitForTimeout(2000 + Math.random() * 1000);
      return true;
    }
  } catch {
    // No next button
  }
  return false;
}

export async function scrapeConnections(
  companyName: string,
  options: { maxPages?: number; jobUrl?: string } = {}
): Promise<{ prospects: ScrapedProspect[]; context: BrowserContext }> {
  const maxPages = options.maxPages ?? 10;
  const context = await getContext();
  const page = await context.newPage();
  const allProspects: ScrapedProspect[] = [];

  try {
    // Navigate via the job posting UI flow
    let onEmployeePage = false;
    if (options.jobUrl) {
      onEmployeePage = await navigateToEmployeeList(page, options.jobUrl);
    }

    if (!onEmployeePage) {
      console.log('Failed to navigate to employee list');
      return { prospects: [], context };
    }

    // Scrape results pages
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      console.log(`Scraping page ${pageNum}...`);

      const pageResults = await scrapeResultsPage(page);
      if (pageResults.length === 0) {
        console.log('No results on page, stopping');
        break;
      }

      allProspects.push(...pageResults);
      console.log(`Total prospects so far: ${allProspects.length}`);

      // Navigate to next page
      if (pageNum < maxPages) {
        const hasNext = await goToNextPage(page);
        if (!hasNext) break;
      }
    }

    console.log(`Scraping complete. Found ${allProspects.length} prospects at ${companyName}`);
  } catch (err) {
    console.error('Scrape error:', err);
    // Don't close the page — leave it open for inspection
  }

  // Don't close page or context — leave browser open for debugging
  return { prospects: allProspects, context };
}
