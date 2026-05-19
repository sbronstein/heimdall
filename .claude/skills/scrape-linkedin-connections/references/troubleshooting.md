# Troubleshooting

Known failure modes the skill will encounter, each mapped to one of the five
error categories from Phase 5 D-09. The skill writes the categorized failure
back to Heimdall via PATCH `/status` to `'failed'` with
`lastError: "<Category>: <detail>"` (first ~200 chars of detail) — the Plan
05-05 UI then renders the category in bold and the detail beneath it on the
lead-detail page.

The same five categories are surfaced verbatim in
[`heimdall-api.md`](heimdall-api.md) and the SKILL.md prompt body. Keep this
table in sync if a new failure mode warrants a new category — but the bar for
adding a sixth category is high; prefer mapping new observations into the
existing five.

---

## `Timeout`

Page load > 30s, click on a stale ref, network stall during navigation, or an
agent-browser `snapshot` call that hangs.

**Common triggers:**

- LinkedIn job page slow to render on first paint (especially for postings
  with embedded video).
- Mid-pagination the result page hangs on a "Loading more results" spinner.
- The Chrome process backing `~/.heimdall/linkedin-profile/` is paged out by
  the OS (laptop just woke from sleep).

**Skill behavior:**

- Set a per-action budget around 30s for navigation, 5min for the whole lead.
- On overrun, retry the action ONCE before declaring `Timeout`. The deleted
  Playwright scraper used 30s nav budget + 5s settle waits — too tight on busy
  LinkedIn pages; a single retry catches most transient stalls.
- Write `Timeout: <operation> exceeded <budget>ms on <url-or-action>` and move
  on.

---

## `LinkedIn navigation failed`

The expected button/link is missing, the page redirected away from where the
skill needed to be, or LinkedIn pushed an interactive challenge.

**Common triggers and remediation:**

- **Sign-in redirect.** LinkedIn dropped the session in
  `~/.heimdall/linkedin-profile/`. Remediation: user re-signs in manually in
  the visible Chrome window, then re-invokes the skill. The skill itself
  cannot recover this — write the failure and exit the lead.
- **Captcha challenge.** LinkedIn detected automation. Remediation: user
  solves the captcha manually in the visible Chrome window, then re-invokes
  the skill. The skill must NOT attempt to solve the captcha (per JL2-03,
  v2-deferred). Fail gracefully — write the categorized error and abort the
  lead.
- **Company-name link missing.** The job posting is for a stealth/unlisted
  company. There is no useful next step; write the categorized error and move
  on. The lead will sit in `'failed'` until the user triages it manually.
- **Employees link missing.** The company has < 11 employees and LinkedIn
  does not render a public count link. Same outcome as above.
- **DOM change.** LinkedIn renamed/restructured the company panel or filter
  bar. Try the fallback selectors in [`linkedin-navigation.md`](linkedin-navigation.md);
  if all of them miss, write the error. The fix is a doc update to
  `linkedin-navigation.md`, not a skill change.

- **Company-name-extraction failure (Phase 8 D-05/D-06).** When the skill navigates to
  `/company/<slug>/people/`, it extracts the company name from the page H1 / heading-role
  element. If that extraction returns null/empty (DOM shift, sign-in wall, captcha during
  load), this is NOT a hard failure: the skill falls back to using the slug as the
  `companyName` for the POST `/api/job-leads` call, logs the warning `Could not extract company name from <url>; using slug "<slug>" as fallback. Rename in the companies UI if needed.`, and proceeds. Remediation is post-hoc curation in the companies UI; no skill
  retry needed.

- **Zero matches on bare-name LinkedIn search (Phase 8 D-09).** When the user passes a bare
  company name and `https://www.linkedin.com/search/results/companies/?keywords=<name>`
  returns no result cards, the skill writes `No companies found for "<name>". Try a more
  specific name or pass a LinkedIn company URL.` and exits cleanly. This is BEFORE any
  Heimdall row is created — no `job_leads` row exists to mark as `failed`; the failure is
  a user-facing message only. Distinguishable from `No prospects found` (which is
  post-navigation, after the lead is created and claimed).

- **Mid-drain disambiguation (Phase 8 D-14).** When draining a company-scope lead whose
  `companyLinkedinUrl IS NULL`, the skill pauses and runs the bare-name disambiguation flow
  inline using `lead.companyName`. The user picks; the skill PUTs
  `/api/companies/<lead.companyId>` to backfill the URL (verb is PUT, not PATCH — per
  `heimdall-api.md` § 6), then resumes navigation. If the user cancels (no pick / Ctrl-C),
  the skill writes `failed` with `lastError: "LinkedIn navigation failed: user cancelled
  disambiguation for <companyName>"` and continues to the next lead.

---

## `No prospects found`

The people-search returned zero rows after pagination terminated (either
because `Next` was disabled or the page-10 cap was reached with all pages
empty).

**Common triggers:**

- The target company has very few 2nd-degree connections for this user.
- The 2nd-degree filter chip is genuinely empty — the user just doesn't have
  warm intros at this company.

**Skill behavior:**

- This is NOT silent — write `No prospects found: pagination exhausted at
  page <n>` so the UI can surface "you have no 2nd-degree warm intros here"
  rather than leaving the lead silently in `'searching'`.
- This is not really a bug — leads that legitimately have zero warm intros
  should be marked `'failed'` so the user sees the dead-end and can decide
  whether to apply cold or skip the role.

---

## `Browser unavailable`

agent-browser cannot start, attach, or drive Chrome.

**Common triggers and remediation:**

- **agent-browser binary not on PATH.** Remediation: user installs
  agent-browser (consult the agent-browser README for the current install
  method).
- **`~/.heimdall/linkedin-profile/` is locked.** Another Chrome process is
  using the profile. Remediation: close the other Chrome window (or kill the
  stuck Chrome process), then re-invoke.
- **The user-data-dir is missing.** First-time use, or the user deleted it.
  Remediation: user opens Chrome with `--user-data-dir=~/.heimdall/linkedin-profile/`
  once, signs into LinkedIn, then re-invokes the skill.
- **Chrome itself isn't installed** on this machine. Remediation: install
  Chrome (or use whatever Chromium variant agent-browser supports).

**Skill behavior:** Write `Browser unavailable: <what failed>` and exit. This
is the one category where retrying within the skill is pointless — the user
must fix something outside the skill before re-invoking.

---

## `Unknown error`

Anything not covered above. Examples: agent-browser crashes, JSON parse error
on a Heimdall response, an unexpected `5xx` from the API, an exception
bubbling out of the LLM's tool use.

**Skill behavior:**

- Include the first 200 chars of the error message verbatim in `lastError`.
- If the same `Unknown error` string fires twice in one drain run, pause and
  ask the user before continuing. Two of the same surprise-error in a row
  suggests an environmental problem the user needs to diagnose rather than
  something the skill should plow through.

---

## Manual recovery (when the skill repeatedly fails)

If three or more consecutive leads fail with the same category, stop the
batch and have the user run this manual check:

1. Open the visible Chrome window at `~/.heimdall/linkedin-profile/` and
   confirm LinkedIn is signed in. If LinkedIn redirects to a login screen,
   sign in manually and re-invoke the skill.
2. Manually navigate to one of the failing leads' `linkedinJobUrl` in that
   same Chrome window. Confirm the company-name link is clickable and lands
   on the company page. If LinkedIn shows a captcha or a "we noticed unusual
   activity" page, solve it manually and wait a few minutes before re-invoking.
3. Confirm the Heimdall dev server is up: `curl -sf
   http://localhost:4000/api/job-leads?status=queued -H "Authorization:
   Bearer $(cat ~/.heimdall/api-token)" | head -c 200`. A success envelope
   confirms the server, the token, and the env hash are all in sync.
4. If all of the above are good and the skill still fails, the failure is
   probably a LinkedIn DOM change — update the selector hints in
   [`linkedin-navigation.md`](linkedin-navigation.md) (or escalate to the
   Heimdall maintainer) before retrying.

---

## What the skill does NOT handle (yet)

These failures are out of scope for v1 (per CONTEXT.md `<deferred>` and the
JL2-* carry-forward list):

- **Rate-limit backoff / retry** (JL2-03 v2-deferred). If LinkedIn rate-limits
  the user-data-dir, the skill emits `LinkedIn navigation failed` and the
  user waits manually.
- **Pagination beyond page 10** (JL2-04 v2-deferred). Captcha risk rises
  sharply past page 10; the hard cap is intentional.
- **Captcha auto-solve.** Out of scope indefinitely; LinkedIn detects
  third-party solvers and accelerates account suspension.
- **Multi-instance drain.** Two skill instances racing for the same lead is
  handled by the state-machine PATCH (the second instance gets a 400 and
  skips), but coordinated multi-instance scraping at scale is not a goal.

- **Auto-pick disambiguation single matches** (Phase 8 D-08 declined). Even when LinkedIn
  returns exactly one result for a bare-name search, the skill confirms with the user
  before proceeding. The cost is one keystroke; the benefit is never silently scraping the
  wrong company on a fuzzy match.

- **Retry-with-broader-query on zero matches** (Phase 8 D-09 declined). The skill does NOT
  auto-strip suffixes like "Inc"/"LLC" or fall back to looser searches. Fail-loudly is the
  v1 policy.
