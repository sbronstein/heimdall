#!/usr/bin/env python3
"""Tailor a resume by editing word/document.xml in place (formatting preserved).

Usage:
    python3 build_resume.py <replacements.json> "<output.docx>" ["<base.docx>"]

If <base.docx> is omitted, the newest "Stephen Bronstein - Updated <DMMMYYYY>.docx"
in the J2026 base folder is used.

replacements.json keys (all optional):
    headline, l1_bold, l1_body, l2_bold, l2_body, l3_bold, l3_body
        -> tailor the headline line and the three summary lines (top third of the resume)
    extra: [[old, new], ...]
        -> arbitrary exact run-text swaps (e.g. a title rename on the IODA line)
    structural: true
        -> run the EXAMPLE structural() transform below (merge the two Fuze roles +
           page break before ID.me). This is tuned to the *pristine* base and is already
           baked into the current master, so leave it off for normal tailoring. Kept as a
           worked recipe to adapt.

Every anchor must match exactly once, or the script exits non-zero. That is the signal to
re-derive the anchor by inspecting word/document.xml — runs split text mid-phrase, '<w:tabs>'
masquerades as '<w:t>', '&' is '&amp;', and date dashes are en-dashes. See
references/resume-tailoring.md.
"""
import sys, os, re, glob, shutil, zipfile, json, datetime

BASE_DIR = os.path.expanduser(
    "~/Library/CloudStorage/GoogleDrive-steve@bronstein.org/My Drive/1 Projects/J2026 - GDrive")

# Base run-text anchors (present in the dated master's top third).
HEADLINE_OLD = "   AI &amp; Data Executive | Enterprise AI Strategy &amp; Infrastructure"
L1_BOLD_OLD = "Enterprise AI &amp; data platform executive. "
L1_BODY_OLD = "Turn complex product, customer, and operational data into customer intelligence, predictive models, experimentation systems, and AI-enabled workflows."
L2_BOLD_OLD = "Cross-functional builder and operator. "
L2_BODY_OLD = "Scale data organizations from startup to enterprise, bridging technical architecture with GTM, Product, Engineering, Finance, and Operations priorities."
L3_BOLD_OLD = "Commercially accountable data leader. "
L3_BODY_OLD = "Led initiatives tied to $100M+ ARR growth, $150M fundraising, margin expansion, fraud productivity, product-led growth, and 3 successful exits."


def latest_base():
    best, bestd = None, None
    for p in glob.glob(os.path.join(BASE_DIR, "Stephen Bronstein - Updated *.docx")):
        name = os.path.basename(p)
        if name.startswith("~$"):
            continue
        m = re.search(r"Updated (\d{1,2})([A-Za-z]{3})(\d{4})\.docx$", name)
        if not m:
            continue
        try:
            d = datetime.datetime.strptime("".join(m.groups()), "%d%b%Y")
        except ValueError:
            continue
        if bestd is None or d > bestd:
            best, bestd = p, d
    if not best:
        raise SystemExit("no dated base resume found in " + BASE_DIR)
    return best


def _para_bounds(xml, anchor):
    i = xml.index(anchor)
    s = xml.rfind("<w:p ", 0, i)
    e = xml.index("</w:p>", i) + len("</w:p>")
    return s, e


def _replace_once(xml, old, new, code):
    if xml.count(old) != 1:
        print(f"!! match count {xml.count(old)} for: {old[:60]!r}", file=sys.stderr)
        sys.exit(code)
    return xml.replace(old, new)


# --- EXAMPLE structural transform (opt-in; tuned to the pristine base) ------------------
NEW_TITLE_RUNS = (
    '<w:r><w:rPr><w:b/><w:color w:val="3864B2"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>SVP, Analytics &amp; Data Science</w:t></w:r>'
    '<w:r><w:rPr><w:color w:val="000000"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve"> (2015–2019) </w:t></w:r>'
    '<w:r><w:rPr><w:color w:val="808080"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>|</w:t></w:r>'
    '<w:r><w:rPr><w:color w:val="000000"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r>'
    '<w:r><w:rPr><w:b/><w:color w:val="3864B2"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>SVP, Operations</w:t></w:r>'
    '<w:r><w:rPr><w:color w:val="000000"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve"> (2014–2015)</w:t></w:r>'
)


def structural(xml):
    # 1) page break before ID.me (pageBreakBefore must precede pBdr in pPr)
    s, _ = _para_bounds(xml, "ID.me ")
    ppr = xml.index("<w:pPr>", s) + len("<w:pPr>")
    xml = xml[:ppr] + "<w:pageBreakBefore/>" + xml[ppr:]
    # 2) condense the first Operations bullet
    xml = _replace_once(xml, "Oversaw global customer-facing ops and provisioning",
                         "As SVP, Operations (2014–2015): built and scaled global provisioning, customer support, and IT organizations", 3)
    xml = _replace_once(xml, " from booked sales to go-live and ongoing customer support. ",
                         ", growing provisioning from 20 to 60+ in 18 months to activate $10M+ in ARR. ", 3)
    # 3) delete the second title line and the surplus Operations bullets
    for anchor in ["Feb 2014 – Aug 2015", "Grew Provisioning", "Built new management",
                   "Worked with Sales to structure and approve SOWs"]:
        if xml.count(anchor) != 1:
            print(f"!! delete anchor count {xml.count(anchor)} for: {anchor!r}", file=sys.stderr)
            sys.exit(4)
        s, e = _para_bounds(xml, anchor)
        xml = xml[:s] + xml[e:]
    # 4) rebuild the first title line as the combined dual title
    s, e = _para_bounds(xml, "SVP, Analytics")
    head = xml[s:e]
    head = head[:head.index("</w:pPr>") + len("</w:pPr>")]
    return xml[:s] + head + NEW_TITLE_RUNS + "</w:p>" + xml[e:]
# ----------------------------------------------------------------------------------------


def build(out_path, repl, base_docx):
    tmp = "/tmp/_docx_build"
    if os.path.exists(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp)
    with zipfile.ZipFile(base_docx) as z:
        names = z.namelist()
        z.extractall(tmp)
    docp = os.path.join(tmp, "word/document.xml")
    xml = open(docp, encoding="utf-8").read()
    key_map = [("headline", HEADLINE_OLD), ("l1_bold", L1_BOLD_OLD), ("l1_body", L1_BODY_OLD),
               ("l2_bold", L2_BOLD_OLD), ("l2_body", L2_BODY_OLD),
               ("l3_bold", L3_BOLD_OLD), ("l3_body", L3_BODY_OLD)]
    pairs = [(old, repl[k]) for k, old in key_map if k in repl]
    for old, new in pairs + [tuple(p) for p in repl.get("extra", [])]:
        xml = _replace_once(xml, old, new, 2)
    if repl.get("structural"):
        xml = structural(xml)
    open(docp, "w", encoding="utf-8").write(xml)
    if os.path.exists(out_path):
        os.remove(out_path)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.write(os.path.join(tmp, n), n)
    print("wrote", out_path, "(base:", os.path.basename(base_docx) + ")")


if __name__ == "__main__":
    repl = json.load(open(sys.argv[1]))
    base = sys.argv[3] if len(sys.argv) > 3 else latest_base()
    build(sys.argv[2], repl, base)
