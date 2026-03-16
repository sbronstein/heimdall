import { type BrowserContext, type Page } from 'playwright';
import { getContext } from './linkedin-browser';

export type ScrapedProspect = {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  profileSnippet: string | null;
  mutualConnectionNames: string[];
};

async function resolveCompanyId(
  page: Page,
  companyName: string
): Promise<string | null> {
  // Search for the company on LinkedIn
  const searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`;
  await page.goto(searchUrl);
  await page.waitForTimeout(2000);

  // Get the first company result's LinkedIn URL
  const firstResult = await page
    .locator('.entity-result__title-text a')
    .first()
    .getAttribute('href');

  if (!firstResult) return null;

  // Extract company ID from URL like /company/123456/
  const match = firstResult.match(/\/company\/([^/]+)/);
  return match ? match[1] : null;
}

async function scrapeResultsPage(page: Page): Promise<ScrapedProspect[]> {
  const results: ScrapedProspect[] = [];

  const cards = await page.locator('.entity-result__item').all();

  for (const card of cards) {
    try {
      const nameEl = card.locator('.entity-result__title-text a span[aria-hidden="true"]');
      const name = (await nameEl.textContent())?.trim() ?? '';
      if (!name || name === 'LinkedIn Member') continue;

      const titleEl = card.locator('.entity-result__primary-subtitle');
      const title = (await titleEl.textContent())?.trim() || null;

      const linkEl = card.locator('.entity-result__title-text a');
      const href = await linkEl.getAttribute('href');
      const linkedinUrl = href ? href.split('?')[0] : null;

      const snippetEl = card.locator('.entity-result__summary');
      const profileSnippet = (await snippetEl.textContent())?.trim() || null;

      // Mutual connections text
      const mutualEl = card.locator('.entity-result__simple-insight');
      const mutualText = (await mutualEl.textContent())?.trim() || '';
      const mutualConnectionNames = extractMutualNames(mutualText);

      results.push({
        name,
        title,
        linkedinUrl,
        profileSnippet,
        mutualConnectionNames
      });
    } catch {
      // Skip malformed cards
    }
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

export async function scrapeConnections(
  companyName: string,
  options: { maxPages?: number } = {}
): Promise<{ prospects: ScrapedProspect[]; context: BrowserContext }> {
  const maxPages = options.maxPages ?? 10;
  const context = await getContext();
  const page = await context.newPage();
  const allProspects: ScrapedProspect[] = [];

  try {
    const companyId = await resolveCompanyId(page, companyName);
    if (!companyId) {
      return { prospects: [], context };
    }

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = `https://www.linkedin.com/search/results/people/?currentCompany=%5B%22${companyId}%22%5D&network=%5B%22S%22%5D&page=${pageNum}`;
      await page.goto(url);
      await page.waitForTimeout(2000 + Math.random() * 1000);

      // Check if we hit end of results
      const noResults = await page.locator('.search-reusable-search-no-results').count();
      if (noResults > 0) break;

      const pageResults = await scrapeResultsPage(page);
      if (pageResults.length === 0) break;

      allProspects.push(...pageResults);

      // Random delay between pages
      if (pageNum < maxPages) {
        await page.waitForTimeout(2000 + Math.random() * 1000);
      }
    }
  } finally {
    await page.close();
  }

  return { prospects: allProspects, context };
}
