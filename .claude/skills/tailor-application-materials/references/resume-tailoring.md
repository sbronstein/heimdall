# Resume tailoring

The resume is tailored **surgically**: edit the base resume's `word/document.xml` in place so
every bit of formatting (fonts, colors, borders, spacing, the two-column competencies, page
layout) is preserved byte-for-byte except the text you intend to change. Never rebuild from
scratch.

## What to tailor (the default, light-touch edit)

Only two regions change for a standard tailor:

1. **The headline line** under the contact block — the role-positioning tagline.
   - Base: `AI & Data Executive | Enterprise AI Strategy & Infrastructure`
   - Reframe it toward the role's center of gravity.
2. **The three summary lines.** Each is a **bold lead phrase** + a normal-weight body.
   Rewrite both the lead and the body to match the JD's priorities, but **keep the factual
   anchors** ($100M+ ARR, $150M raise, 3 exits, 25%→37% margin, 5x fraud productivity, 80% PLG
   lift, "Teams of 10+ direct, 100 indirect reports," etc.).

Leave Experience bullets, Core Competencies, and Education **unchanged** unless asked. The
reverse-chronological body is the constant; the top third is what flexes.

### Worked examples (headline + three summary lead-ins)

**Lyra Health — VP of Data and AI** (healthtech, reports to CPTO, build DE/DS/analytics/ML platform):
- Headline: `AI & Data Executive | Data & AI Strategy, ML Platforms & Applied Analytics`
- Leads: *Data and AI strategy leader.* / *Cross-functional builder and operator.* (leaned on
  ID.me as evidence of "regulated, high-trust environments" — honest, no fake clinical claim) /
  *Commercially accountable data leader.*

**Updater — VP, Data** (B2B2C marketplace, revenue/risk, Snowflake/Looker/dbt/Python):
- Headline: `Data Executive | Revenue & Risk Intelligence for Complex Marketplaces`
- Leads: *Decision-enabling data leader.* / *Revenue and risk intelligence.* (named the stack
  match) / *Commercially accountable and ML-fluent.*

**Veho — VP, AI & Platforms** (logistics, hands-on builder, agentic tooling):
- Headline: `AI & Platforms Executive | Agentic Tooling, ML Platforms & Data Science`
- Leads: *Hands-on platform builder.* / *Data science and experimentation leader.* /
  *Commercially accountable and fast-moving.*

Paraphrase the JD; don't lift its phrasing. Examples of softening: "first-class citizen" →
"core infrastructure"; "canonical data engine" → "trusted data backbone"; "time-to-insight cut
in half" → "compressing the path from question to insight."

## The in-place `.docx` editing technique

A `.docx` is a zip. Edit `word/document.xml`, then **re-zip preserving the original member
order**. The provided `scripts/build_resume.py` does exactly this from a JSON of replacements.

```
python3 scripts/build_resume.py <replacements.json> "<output.docx>" ["<base.docx>"]
```

`build_resume.py` starts from the base, applies the keyed headline/summary replacements + any
`extra` text pairs, applies the always-on structural transform (see below), and writes the
output. It **fails loudly** (non-zero exit) if any anchor string doesn't appear exactly once —
that's the signal to re-derive the anchor.

### Inspecting runs to find anchors

Text in Word is split across `<w:r>` runs, and a single sentence is often split mid-phrase
across several `<w:t>` elements (for spell-check, bookmarks, rPr changes). So an anchor like
`SVP, Analytics & Data Science | Aug 2015` may **not** exist as one contiguous string. Always
inspect first.

Gotchas learned the hard way:
- **`<w:tabs>` false match.** `re.findall(r'<w:t[^>]*>...')` also matches `<w:tabs>` and
  `<w:tab>`. Use `r'<w:t(?:\s[^>]*)?>(.*?)</w:t>'` so headings (which have tab stops) extract
  cleanly.
- **Entities.** Ampersand is `&amp;`, `>` is `&gt;` in the XML. Match the entity form.
- **Dashes.** Date ranges use an **en-dash** `–` (U+2013), not a hyphen. The IODA/role lines
  use an **em-dash** `—`. Copy the exact character into anchors.
- **`xml:space="preserve"`** runs hold leading/trailing spaces; there is often a separate
  whitespace-only run between a body run and the next (e.g. the space before "Teams of 10+…").
  Don't add a duplicate space when replacing.
- **Bold lead pattern.** Summary lines and many bullets are `[bold lead run] + [normal body
  run]`. The title lines are blue-bold runs (`<w:color w:val="3864B2"/>`), separators gray
  (`808080`), dates black (`000000`), all `sz=20`.

A quick inspector:

```python
import re
xml = open('word/document.xml', encoding='utf-8').read()
T = re.compile(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>', re.S)
def runs(anchor):
    i = xml.index(anchor); s = xml.rfind('<w:p ',0,i); e = xml.index('</w:p>',i)+6
    return [('B' if '<w:b/>' in r else ' ', ''.join(T.findall(r)))
            for r in re.findall(r'<w:r\b.*?</w:r>', xml[s:e], re.S) if ''.join(T.findall(r))]
print(runs('SVP, Analytics'))
```

### Replacements JSON shape

```json
{
  "headline": "   AI &amp; Data Executive | <tailored tagline>",
  "l1_bold": "<lead phrase>. ",
  "l1_body": "<body sentence>.",
  "l2_bold": "...", "l2_body": "...",
  "l3_bold": "...", "l3_body": "...",
  "extra": [ ["<exact old run text>", "<new text>"] ]
}
```

- `headline` keeps its 3 leading spaces and uses `&amp;`.
- The `l2_body` should **end without** the team sentence — the existing
  "Teams of 10+ direct, 100 indirect reports" run is preserved and flows in after it. Do **not**
  add a trailing space (a whitespace run already supplies it).
- All keys are optional. A title-only or structural-only build can pass just `extra` (or `{}`).

## Structural edits (on request)

These rewrite paragraph structure, not just run text. The script's `structural()` function
holds the current set; treat them as a recipe to adapt, and re-verify anchors against the
current base each time.

- **Title rename** (e.g. `COO` → `Founding COO`): a plain `extra` text-pair on the IODA line.
  When dropping a now-redundant clause (e.g. "Employee #3"), restructure the whole run text in
  one replacement.
- **Merge two roles into one block** (the Fuze example): rebuild the first title paragraph as a
  single dual-title line using blue-bold (`3864B2`) runs for both titles, a gray (`808080`)
  `|`, and black date runs — keep the original `<w:pPr>`, replace only the runs. Then **delete**
  the second title paragraph and the surplus bullets (find each by a unique contiguous anchor,
  take `<w:p …>`→`</w:p>` bounds, splice out), and **condense** the remaining bullets by
  editing their run text.
- **Page break before a section** (e.g. force ID.me to start page 2): insert
  `<w:pageBreakBefore/>` as the **first child of that heading's `<w:pPr>`** (it must precede
  `<w:pBdr>` per the schema). Combine with space-saving edits above so the page break lands
  cleanly. Note: pagination can't be visually verified here (no LibreOffice); the property
  guarantees the section starts a new page when opened in Word.

## Validate every build

```bash
# well-formed XML
python3 -c "import zipfile,xml.dom.minidom as m; m.parseString(zipfile.ZipFile('OUT.docx').read('word/document.xml'))"
# text round-trip + spot-check tailored lines
textutil -convert txt -stdout "OUT.docx" | sed -n '5,8p'
```

No LibreOffice/`soffice` is installed, so a tailored **PDF** can't be rendered with fidelity —
the user exports to PDF from Word when needed. Don't ship a stale generic PDF.
