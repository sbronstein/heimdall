import * as cheerio from 'cheerio';

export type ScrapedJobData = {
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  companyLinkedinUrl: string | null;
};

export async function scrapeJobPage(url: string): Promise<ScrapedJobData> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch job page: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  let companyName: string | null = null;
  let roleTitle: string | null = null;
  let location: string | null = null;
  let companyLinkedinUrl: string | null = null;

  // Try JSON-LD first
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      if (data['@type'] === 'JobPosting') {
        roleTitle = data.title || null;
        location =
          data.jobLocation?.address?.addressLocality ||
          data.jobLocation?.name ||
          null;
        if (data.hiringOrganization) {
          companyName = data.hiringOrganization.name || null;
          companyLinkedinUrl = data.hiringOrganization.sameAs || null;
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  // Fallback: meta tags
  if (!companyName) {
    companyName =
      $('meta[property="og:title"]').attr('content')?.split(' hiring ')?.[0]?.trim() ||
      null;
  }

  // Fallback: title tag (usually "Role Title - Company Name | LinkedIn")
  if (!roleTitle || !companyName) {
    const titleText = $('title').text();
    const match = titleText.match(/^(.+?)\s*[-–]\s*(.+?)\s*\|/);
    if (match) {
      if (!roleTitle) roleTitle = match[1].trim();
      if (!companyName) companyName = match[2].trim();
    }
  }

  // Location from meta
  if (!location) {
    const desc = $('meta[name="description"]').attr('content') || '';
    const locMatch = desc.match(/(?:in|location:?\s*)([^.·]+)/i);
    if (locMatch) location = locMatch[1].trim();
  }

  return { companyName, roleTitle, location, companyLinkedinUrl };
}
