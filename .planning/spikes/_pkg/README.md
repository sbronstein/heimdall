# `_pkg` — Stagehand spike dependencies

This directory exists so the Stagehand spike series doesn't pollute the project's main `package.json`. If the spike is invalidated, deleting `_pkg/` removes the entire dependency footprint.

## Install

```bash
cd .planning/spikes/_pkg
npm install
npx playwright install chromium    # first time only — installs the headed Chromium
```

The `playwright install chromium` step downloads the Chromium binary Stagehand launches when running in headed mode. Skip it if `BROWSER_CDP_ENDPOINT` is set and you're attaching to an existing Chrome.

Installs:

- `@browserbasehq/stagehand@^3.4.0` — the library under spike
- `playwright-core`, `puppeteer-core`, `patchright-core`, `deepmerge` — Stagehand peer deps
- `zod@^4` — for `extract()` schemas (matches the project's zod version)
- `dotenv` — to read the project's `.env.local`
- `tsx` — runs `.ts` files directly without a build step

## Environment

The spikes read these env vars from the project's `.env.local`:

| Var                    | Required | Notes                                                                            |
|------------------------|----------|----------------------------------------------------------------------------------|
| `ANTHROPIC_API_KEY`    | **yes**  | Stagehand calls Claude (Sonnet 4.5) for `act()` / `observe()` / `extract()`. Get one at https://console.anthropic.com — spike total should cost a few dollars in tokens at most. |
| `BROWSER_CDP_ENDPOINT` | optional | If set, the spikes attach to that existing Chrome (matches the project's prod-style flow). If **not** set, the spikes launch a headed Chromium with a persistent profile at `~/.heimdall/linkedin-profile/` — same dir `src/features/job-leads/lib/linkedin-browser.ts` uses, so a LinkedIn login persists across both. |

## How it handles LinkedIn login

On every run, the spike navigates to `https://www.linkedin.com/feed` and checks where it lands.

- **If already signed in** (cookies in the persistent profile are valid): continues silently.
- **If not signed in**: prints a clear banner and waits up to **5 minutes** for the user to sign in in the visible Chrome window. As soon as the URL becomes `/feed`, the spike resumes.

So the first run requires an interactive login; subsequent runs are silent until LinkedIn invalidates the session (typically weeks).

## Run

```bash
npm run spike:001                                    # CDP/launch sanity + auth
npm run spike:002 -- https://www.linkedin.com/jobs/view/<id>
npm run spike:003 -- 'https://www.linkedin.com/search/results/people/?currentCompany=%5B%22<id>%22%5D&network=%5B%22S%22%5D' 5
```

## Files

- `lib/browser.ts` — `getStagehandConfig()` (headed by default, CDP if env var present) + `ensureLinkedInLogin()` (interactive login pause).
- `lib/cdp.ts` — `resolveWebSocketDebuggerUrl()` helper. Stagehand's `cdpUrl` option expects a `ws://` URL; Chrome exposes it via `/json/version`.
- `lib/env.ts` — sourced for its side effect (loads `.env.local`).
