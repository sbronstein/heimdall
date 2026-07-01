"""Parse agent-browser page extracts into ScrapedProspect rows.

Reads page_*_str.json (each a JSON-quoted string of extract.js output) from the
current directory, dedupes by profile URL, and writes prospects.json.

Run from the scratchpad dir that holds the page_*_str.json files:
    python3 parse_prospects.py
"""
import json, re, glob

DEGREE = re.compile(r'(1st|2nd|3rd)')
CTA = {'connect', 'follow', 'message', 'pending', 'follow up'}

# Post-nominal credential tokens LinkedIn appends to display names (e.g.
# "Jenny Dearborn, MBA"). When a name is split on commas to parse the mutual-
# connections subline, these bare fragments must be dropped so they don't become
# fake mutual-connection names. Compared case-insensitively with punctuation and
# spaces removed, so "Ph.D.", "PhD", and "ph d" all normalize to "PHD".
CREDENTIALS = {
    'MBA', 'EMBA', 'PHD', 'PMP', 'CPA', 'CFA', 'MD', 'JD', 'MS', 'MSC', 'BS', 'BA',
    'BSC', 'MPH', 'MPA', 'PE', 'RN', 'DVM', 'DDS', 'ESQ', 'CISSP', 'CISA', 'CISM',
    'CSM', 'CSPO', 'SHRMSCP', 'SHRMCP', 'SPHR', 'PHR', 'MSW', 'LCSW', 'DPT', 'PSYD',
    'EDD', 'MFA', 'LLM', 'LLB', 'CIPP', 'CIPPUS', 'ACCA', 'CMA', 'FRM', 'CCNA',
    'CCNP', 'ITIL', 'CFE', 'CGA', 'CA', 'FCA', 'PMPCSM', 'GAICD', 'FACHE',
}


def is_credential(fragment):
    key = re.sub(r'[^A-Za-z]', '', fragment).upper()
    return key in CREDENTIALS


def parse_mutuals(line):
    if not line or 'mutual connection' not in line.lower():
        return []
    s = line
    # strip trailing connectors / counts
    s = re.sub(r'\s*(is|are)\s+(a\s+)?mutual connections?$', '', s, flags=re.I)
    s = re.sub(r'&\s*\d[\d,]*\s+other mutual connections?$', '', s, flags=re.I)
    s = re.sub(r'\s*mutual connections?$', '', s, flags=re.I)
    # split on commas, ampersands, and the " and " that joins the final name in a
    # two-name subline ("Jenny Dearborn, MBA and Ryan Dawley"). Space-delimited so
    # surnames like "Anderson" are never split.
    parts = re.split(r'\s+&\s+|\s+and\s+|,', s)
    names = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if re.search(r'\d+\s+other', p, flags=re.I):
            continue
        if 'other mutual' in p.lower():
            continue
        if is_credential(p):  # drop bare post-nominal tokens (MBA, PhD, CPA, ...)
            continue
        if len(p) < 1 or len(p) > 200:
            continue
        names.append(p)
    return names[:50]


def main():
    rows = {}
    order = []
    for f in sorted(glob.glob('page_*_str.json'),
                    key=lambda x: int(re.search(r'page_(\d+)_', x).group(1))):
        s = json.load(open(f))
        cards = json.loads(s)
        for c in cards:
            name = (c.get('name') or '').strip()
            url = c.get('url')
            # Strip a degree badge that LinkedIn sometimes renders on the same line
            # as the name (e.g. "Jason Baird, MBA • 2nd" -> "Jason Baird, MBA").
            name = re.sub(r'\s*[•·]\s*(1st|2nd|3rd)\b.*$', '', name).strip()
            if not name or name.lower() == 'linkedin member':
                continue
            if not url or '/in/' not in url:
                continue
            lines = c.get('lines') or []
            # Title = first body line that is not a standalone degree badge, a CTA,
            # or the mutual-connections subline. Works whether the degree is its own
            # line or was rendered inline on the name line.
            title = None
            for l in lines[1:]:
                ls = l.strip()
                low = ls.lower()
                if not ls:
                    continue
                if DEGREE.search(ls) and len(ls) < 12:   # standalone "• 2nd"
                    continue
                if low in CTA:
                    continue
                if 'mutual connection' in low:
                    continue
                title = ls[:300]
                break
            mutual_line = next((l for l in lines if 'mutual connection' in l.lower()), None)
            mutuals = parse_mutuals(mutual_line)
            row = {
                'name': name[:200],
                'title': title,
                'linkedinUrl': url,
                'profileSnippet': None,
                'mutualConnectionNames': mutuals,
            }
            if url not in rows:
                rows[url] = row
                order.append(url)

    prospects = [rows[u] for u in order]
    json.dump(prospects, open('prospects.json', 'w'))
    raw = sum(len(json.loads(json.load(open(f)))) for f in glob.glob('page_*_str.json'))
    print(f'{len(prospects)} unique prospects (from {raw} raw rows)')
    with_title = sum(1 for p in prospects if p['title'])
    with_mut = sum(1 for p in prospects if p['mutualConnectionNames'])
    print(f'  with title: {with_title} | with mutuals: {with_mut}')
    print('--- sample ---')
    for p in prospects[:4]:
        print(json.dumps(p, ensure_ascii=False))


if __name__ == '__main__':
    main()
