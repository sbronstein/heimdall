# Spike Manifest

## Status: SUPERSEDED (2026-05-13)

The Stagehand-in-the-app path is no longer the chosen approach. Architectural pivot captured below; all three spikes below are kept on disk as historical record but are not the active path.

### What changed

Original framing: replace the in-app Playwright scraper (`src/features/job-leads/lib/scrape-connections.ts`) with Stagehand to fix selector brittleness while keeping scraping in an API route.

New framing: **scraping leaves the app entirely.** It becomes a **Claude Code skill** built on `vercel-labs/agent-browser`. Flow:

1. URL enters Heimdall via web UI paste **or** Claude Code CLI submission → row in DB (no scrape yet)
2. User runs a Claude Code skill (with a URL arg, or no arg to drain the unprocessed queue)
3. Skill drives agent-browser to do the LinkedIn navigation + extraction; Claude (already authed in Claude Code) is the LLM driver
4. Results written back to DB through the existing API

### Why this is better than the Stagehand-in-app path

- **agent-browser's CLI shape becomes a feature.** Earlier rejection was about `execSync`-ing a Rust binary from a Next.js API route — Claude Code is already a CLI, so the DX mismatch evaporates
- **No separate `ANTHROPIC_API_KEY` needed.** Claude Code is already authed against your Claude sub; the skill drives Claude through the navigation. The "Stagehand reads `ANTHROPIC_API_KEY`" auth gap (and the Claude-sub-auth question that surfaced during the rewrite) both disappear
- **App decouples from Chrome.** The web UI and CLI both just capture URLs. The fire-and-forget Playwright IIFE in `src/app/api/job-leads/[id]/search/route.ts` goes away
- **Failure is visible.** Scrape errors surface in the Claude Code session where the user can intervene, instead of being swallowed by the server's async path

### What transfers from these spikes

- LinkedIn nav decomposition (job → company → employees → 2nd-degree → extract) — same target steps for agent-browser
- `~/.heimdall/linkedin-profile/` persistent profile pattern — agent-browser can attach to a Chrome running that profile
- `ScrapedProspect` schema as the structured output target
- The agent-browser evaluation note (`.planning/notes/linkedin-scraper-agent-browser-evaluation.md`) — now reads as the trail leading to this pivot

### Next step

`/gsd-plan-phase` for the LinkedIn-scraping-skill — a new phase that delivers:
- Claude Code skill at `.claude/skills/scrape-linkedin-connections/` (or similar)
- `<url-arg>` mode + `no-arg → drain queue` mode
- DB read/write through the existing API
- Removal of the in-app fire-and-forget scrape path

---

## Idea (original, kept for context)

Replace the fragile Playwright-based LinkedIn scraper with **Stagehand** — an LLM-driven browser automation library built on Playwright that reasons over rendered DOM via an accessibility-tree-with-stable-refs abstraction instead of brittle CSS selectors.

The current scraper has cascaded into ~5 fallback selector strategies plus `page.evaluate` brute-force DOM scans because LinkedIn uses obfuscated/randomized class names. Stagehand's `act()` / `observe()` / `extract()` primitives target the exact failure surface.

**Out of scope:** production-hosted scraping. Captured as a future seed in `.planning/seeds/prod-hosted-scraping.md`.

Full pre-pivot context in `.planning/notes/linkedin-scraper-agent-browser-evaluation.md`.

## Requirements (frozen — superseded by skill-phase requirements)

- Reuse `~/.heimdall/linkedin-profile/` user-data dir
- Interactive login on first run in a visible Chrome window
- Extract prospects in `ScrapedProspect` shape: `{ name, title, linkedinUrl, mutualConnectionNames[] }`
- `env: "LOCAL"` (no Browserbase)
- Measure LLM token cost per scrape
- Default to a Claude Anthropic model

## Spikes

| #   | Name                          | Type     | Validates                                                                                                              | Verdict     | Tags                          |
|-----|-------------------------------|----------|------------------------------------------------------------------------------------------------------------------------|-------------|-------------------------------|
| 001 | stagehand-cdp-auth            | standard | Stagehand launches headed Chromium, persists/reuses the LinkedIn profile, interactively pauses for login if needed, and reaches `/feed`. | **SUPERSEDED** | stagehand, auth, headed       |
| 002 | stagehand-linkedin-navigate   | standard | `observe()`/`act()` walk job → company → employees → 2nd-degree filter.                                                | **SUPERSEDED** | stagehand, navigation, linkedin |
| 003 | stagehand-extract-prospects   | standard | `extract()` returns the `ScrapedProspect` shape with measured per-run token cost across 5+ runs.                       | **SUPERSEDED** | stagehand, extract, cost       |

These spikes were never run end-to-end. The scaffolding (`_pkg/`, `001/`, `002/`, `003/`) is left in place but should be considered archived. If you want to remove it entirely: `rm -rf .planning/spikes/_pkg .planning/spikes/00[123]-*` (and update this manifest).
