---
name: tailor-application-materials
description: 'Tailor Steve Bronstein''s resume and cover letter to a specific job description, following the J2026 Google Drive conventions. Pulls the JD (a LinkedIn job URL via agent-browser, pasted text, or a Heimdall job lead), creates a per-company subfolder, edits the latest base resume .docx in place so formatting is preserved (tailored headline + three summary lines, plus optional structural edits like merging roles or page breaks), and writes a casual, story-led cover letter in Steve''s voice. Scans for LLM tells before finalizing and surfaces the big changes for review.'
argument-hint: '[job-lead-id | linkedin-job-url | "Company Name" (then paste JD)]'
allowed-tools:
  - Read
  - Bash
  - Write
  - Edit
---

## Overview

Produce a tailored **resume** and **cover letter** for one job, saved into a per-company
subfolder of the J2026 Google Drive project, following the conventions in that folder's
own `CLAUDE.md`. Markdown is never the deliverable here — the outputs are `.docx` files
(plus the JD as `.txt`).

Two distinct crafts, with different rules:

- **Resume** — surgical. Edit the latest base resume's `word/document.xml` *in place* so all
  formatting survives. Tailor only the **headline line** and the **three summary lines**;
  keep every factual anchor. Optional structural edits (merge roles, page break, title
  change) on request.
- **Cover letter** — written from scratch in Steve's **casual, story-led voice**. Not a
  formal business letter. Then scrubbed of LLM tells.

**Read these first** (in order):

1. The project's own conventions: `~/Library/CloudStorage/GoogleDrive-steve@bronstein.org/My Drive/1 Projects/J2026 - GDrive/CLAUDE.md` — the source of truth for folder layout, file naming, "tailor but don't copy the JD," and the cover-letter / LLM-tell rule. It may evolve; read it live every run.
2. [`references/resume-tailoring.md`](references/resume-tailoring.md) — what to change, the in-place `.docx` editing technique, the gotchas, structural edits, and the build script.
3. [`references/cover-letter-style.md`](references/cover-letter-style.md) — Steve's voice, the 3-paragraph arc, the gold-standard examples, and the LLM-tell scrub.
4. [`references/steve-fact-bank.md`](references/steve-fact-bank.md) — the durable, reusable career facts (with correct tools and real numbers) to draw from. Do not invent facts that aren't here or in the base resume.

## Paths

- **Base folder:** `~/Library/CloudStorage/GoogleDrive-steve@bronstein.org/My Drive/1 Projects/J2026 - GDrive/`
- **Base resume:** the most recent `Stephen Bronstein - Updated <DMMMYYYY>.docx` in the base folder (e.g. `Stephen Bronstein - Updated 17Jun2026.docx`). Pick the newest by date token, not by mtime. Ignore Word lock files (`~$…`).
- **Output (per company `<Company>`):** a subfolder `<Company>/` containing
  - `<Company> - JD.txt` — the captured job description
  - `Steve Bronstein - <Company>.docx` — tailored resume
  - `Steve Bronstein - <Company> Cover Letter.docx` — cover letter

## Inputs

Resolve the JD from whatever the user gives:

- **LinkedIn job URL** — open it with `agent-browser` (the logged-in Chrome profile from the
  `scrape-linkedin-connections` skill) and extract the posting text. See
  `references/resume-tailoring.md` for the exact capture + trim recipe.
- **Heimdall job lead id / company** — `GET /api/job-leads/<id>` for the `linkedinJobUrl`, then
  fetch as above. (JD text is not stored on the lead; you must fetch it.)
- **Pasted JD text** — use directly.

## Workflow

1. **Capture the JD** and confirm the posting is still **open**. If it says "No longer
   accepting applications," flag it and ask before investing effort (we skipped HighLevel
   for exactly this reason). Save the trimmed JD to `<Company>/<Company> - JD.txt`.
2. **Tailor the resume** — build `Steve Bronstein - <Company>.docx` from the latest base by
   editing `word/document.xml` (headline + three summary lines; keep anchors; paraphrase the
   JD, never copy it). See `references/resume-tailoring.md`. Apply any requested structural
   edits the same way.
3. **Write the cover letter** in Steve's voice (`references/cover-letter-style.md`), then run
   the **LLM-tell scan** and fix anything it flags. Convert to
   `Steve Bronstein - <Company> Cover Letter.docx` via `textutil -convert docx`.
4. **Verify** — every `.docx` must round-trip cleanly (`textutil -convert txt -stdout`), the
   resume `document.xml` must be well-formed XML, and the tailored lines/structural edits must
   read correctly.
5. **Surface the big changes** for review: the new headline, the gist of each rewritten
   summary line, any structural edits, and the cover-letter angle. This is required by the
   project `CLAUDE.md` ("surface all of the big changes of note that you made for review").

## Guardrails

- **Preserve formatting.** Always edit the base `.docx` in place. Never regenerate a resume
  from plain text — that loses the layout.
- **Honesty.** Use only facts from `references/steve-fact-bank.md` or the base resume. Match
  tools to the actual role (e.g. Anaconda used **Omni**, not Looker). Real numbers only.
- **Don't copy the JD.** Paraphrase its priorities into Steve's language.
- **No LLM tells.** No em/en dashes, no "it's not X, it's Y," no "not just," etc. Plain hyphens.
- **Don't touch the master or archive** unless explicitly asked. Bumping the dated master and
  archiving the old one is a separate, explicit request.
- **Name is "Steve Bronstein"** on the output files and the cover-letter signoff (the base
  resume's internal name "Stephen Bronstein" stays as-is).
