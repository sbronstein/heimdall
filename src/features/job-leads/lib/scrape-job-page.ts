import * as cheerio from 'cheerio';

export type ScrapedJobData = {
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  companyLinkedinUrl: string | null;
};

// Decode HTML entities in scraped text. The JSON-LD path (`JSON.parse($(el).html())`)
// preserves entities literally because JSON.parse does not decode them, and LinkedIn
// HTML-encodes ampersands inside its application/ld+json — so a value like
// "Walker &amp; Dunlop" would otherwise be stored and displayed with the literal code.
// Decode &amp; LAST (after numeric and the other named entities) so a double-encoded
// sequence like "&amp;lt;" is not collapsed into "<". Idempotent on already-decoded
// strings (the cheerio .attr()/.text() fallback paths), so it is safe to apply to every field.
export function decodeHtmlEntities(value: string | null): string | null {
  if (value == null) return value;
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#0*39);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

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
      $('meta[property="og:title"]')
        .attr('content')
        ?.split(' hiring ')?.[0]
        ?.trim() || null;
  }

  // Fallback: title tag
  if (!roleTitle || !companyName) {
    const titleText = $('title').text();

    // Format: "Company hiring Role in Location | LinkedIn"
    const hiringMatch = titleText.match(
      /^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+?))?\s*\|/i
    );
    if (hiringMatch) {
      if (!companyName) companyName = hiringMatch[1].trim();
      if (!roleTitle) roleTitle = hiringMatch[2].trim();
      if (!location && hiringMatch[3]) location = hiringMatch[3].trim();
    }

    // Format: "Role Title - Company Name | LinkedIn"
    if (!roleTitle || !companyName) {
      const dashMatch = titleText.match(/^(.+?)\s*[-–]\s*(.+?)\s*\|/);
      if (dashMatch) {
        if (!roleTitle) roleTitle = dashMatch[1].trim();
        if (!companyName) companyName = dashMatch[2].trim();
      }
    }
  }

  // Location from meta
  if (!location) {
    const desc = $('meta[name="description"]').attr('content') || '';
    const locMatch = desc.match(/(?:in|location:?\s*)([^.·]+)/i);
    if (locMatch) location = locMatch[1].trim();
  }

  return {
    companyName: decodeHtmlEntities(companyName),
    roleTitle: decodeHtmlEntities(roleTitle),
    location: decodeHtmlEntities(location),
    companyLinkedinUrl
  };
}
