# `_pkg` — Stagehand spike dependencies

This directory exists so the Stagehand spike series doesn't pollute the project's main `package.json`. If the spike is invalidated, deleting this folder removes the whole dependency footprint.

## Install

```bash
cd .planning/spikes/_pkg
npm install
```

Installs:

- `@browserbasehq/stagehand@^3.4.0` — the library under spike
- `playwright-core`, `puppeteer-core`, `patchright-core`, `deepmerge` — Stagehand peer deps
- `zod@^4` — for `extract()` schemas (matches the project's zod version)
- `dotenv` — to read the project's `.env.local`
- `tsx` — runs `.ts` files directly without a build step

## Environment

The spikes read two env vars:

| Var                    | Required | Notes                                                                            |
|------------------------|----------|----------------------------------------------------------------------------------|
| `BROWSER_CDP_ENDPOINT` | yes      | HTTP URL to a Chrome with `--remote-debugging-port`, e.g. `http://localhost:3005` — same flow your existing scraper uses |
| `ANTHROPIC_API_KEY`    | yes      | Stagehand calls Claude for `act()` / `observe()` / `extract()`                  |

Both are loaded from the project's `.env.local` automatically by `lib/env.ts`. If they aren't set, the spike script will exit early with a clear error.

## Run

```bash
npm run spike:001                                 # CDP auth — no args
npm run spike:002 -- https://www.linkedin.com/jobs/view/<id>
npm run spike:003 -- https://www.linkedin.com/search/results/people/?currentCompany=%5B%22<id>%22%5D&network=%5B%22S%22%5D
```

## Files

- `lib/cdp.ts` — `resolveWebSocketDebuggerUrl()` helper. Stagehand's `cdpUrl` option expects a `ws://` URL; Chrome exposes it via `/json/version`.
- `lib/env.ts` — sourced for its side effect (loads `.env.local`).
