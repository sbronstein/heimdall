import { decodeHtmlEntities } from '@/features/job-leads/lib/scrape-job-page';

describe('decodeHtmlEntities', () => {
  it('decodes the &amp; that LinkedIn JSON-LD double-encodes (Walker & Dunlop)', () => {
    expect(decodeHtmlEntities('Walker &amp; Dunlop')).toBe('Walker & Dunlop');
  });

  it('decodes numeric and named entities', () => {
    expect(decodeHtmlEntities('Tom &#39;TJ&#39; Jones')).toBe("Tom 'TJ' Jones");
    expect(decodeHtmlEntities('R&amp;D &lt;Lead&gt; &quot;x&quot;')).toBe(
      'R&D <Lead> "x"'
    );
    expect(decodeHtmlEntities('caf&#xe9;')).toBe('café');
  });

  it('decodes &amp; LAST so double-encoded sequences are not collapsed', () => {
    // "&amp;lt;" should become the literal "&lt;", NOT "<"
    expect(decodeHtmlEntities('a &amp;lt; b')).toBe('a &lt; b');
  });

  it('is idempotent on already-clean strings (cheerio fallback paths)', () => {
    expect(decodeHtmlEntities('Walker & Dunlop')).toBe('Walker & Dunlop');
    expect(decodeHtmlEntities('Plain Title')).toBe('Plain Title');
  });

  it('passes null through unchanged', () => {
    expect(decodeHtmlEntities(null)).toBeNull();
  });
});
