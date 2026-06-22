# Phase 16: Email Generation Skill - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 16-Email Generation Skill
**Areas discussed:** Generation engine + status, Email voice & anatomy, Tone & low-context, Guardrails & run behavior

---

## Generation engine + status

### How each email gets written
| Option | Description | Selected |
|--------|-------------|----------|
| Inline, Claude authors | Agent writes every email in-context; best voice, no API key; risk at large campaign sizes | |
| Per-email API sub-calls | Loop calling Claude API per email; scales but needs API key + model pin, loses agent judgment | |
| Inline, but chunked | Inline authoring in bounded batches; keeps voice, manages scale | ✓ |

### Landing emails in 'generated' state (the /generation route doesn't set status today)
| Option | Description | Selected |
|--------|-------------|----------|
| Skill calls both routes | PATCH .../generation then PATCH .../status; no API change, two round-trips | |
| Fix /generation to set status | Route sets status='generated' (gated) in same UPDATE; one call, cleaner | ✓ |
| You decide | Planner picks | |

### Handling a large pending queue
| Option | Description | Selected |
|--------|-------------|----------|
| Fixed chunk, auto-continue | Drain in fixed batches, no prompts | |
| Confirm count first | Report 'N pending — proceed?' then drain in chunks | ✓ |
| Fixed chunk + final summary | Drain + end summary, no upfront confirm | |

**Notes:** The sample-review gate (below, under Tone) was added on top of the count confirm.

---

## Email voice & anatomy

### Where the voice/guardrails live
| Option | Description | Selected |
|--------|-------------|----------|
| New networking voice-guide.md | Email-specific guide borrowing honesty + scrub rules | ✓ |
| Reuse cover-letter-style.md | Point at existing file verbatim | |
| New guide + cite the original | Short deltas file + cite original | |

### Body length / shape
| Option | Description | Selected |
|--------|-------------|----------|
| Very short: 1 short para | A few sentences, opener + ask | |
| Short: 2 short paras | Reconnect hook + ask/context | |
| Tier-dependent length | Length scales with closeness | ✓ |

### Subject / greeting / sign-off
| Option | Description | Selected |
|--------|-------------|----------|
| Casual, first-name, light subject | Fixed casual template | |
| Goal-driven subject, first-name | Subject reflects campaign goal | |
| You decide per email | Agent chooses within voice-guide rules; natural variation | ✓ |

### The ask
| Option | Description | Selected |
|--------|-------------|----------|
| Soft ask, always present | Low-pressure ask from campaign goal, adapted per person | ✓ |
| Ask scales with tier | Direct for close, softer for distant | |
| Goal verbatim is the instruction | Follow goalInstruction literally | |

---

## Tone & low-context

### Tone bands across tiers
| Option | Description | Selected |
|--------|-------------|----------|
| Follow criteria, fill gaps sensibly | Use ROADMAP bands, tier 6 → brief/direct | |
| Map by enum, not number | Tone per closeness enum value | |
| Three registers, agent decides | Agent picks register from context | |
| **Other (free text)** | Owner: mostly always conversational; small friend-vs-colleague difference; needs to review examples | ✓ |

**User's choice:** Free-text. Conversational by default; closeness is light modulation only; the tier bands are calibration scaffolding, not a literal spec. Confirmed (plain text): voice-guide leads with "always conversational" + a **5-email sample-review gate** before the full drain. Owner approved a sample size of 5.

### Low-context (<2 interactions) handling + where the flag lives
| Option | Description | Selected |
|--------|-------------|----------|
| Generate + flag via run summary | Generate facts-only, flag in summary + sample; no schema change | ✓ |
| Generate + persist a flag | Add needsReview/lowContext column + migration + write-back | |
| Generate, conservative, note in body | More generic email + body marker | |

---

## Guardrails & run behavior

### LLM-tell enforcement
| Option | Description | Selected |
|--------|-------------|----------|
| Hard gate, self-correct | Block on full tailor banned list, rewrite until clean | |
| Hard gate, criteria list only | Block on criteria minimums (em/en-dash, leverage, robust, generic openers); broader list advisory | ✓ |
| Scan + flag, no auto-rewrite | Write back regardless, flag tells in summary | |

### Invocation + failure handling
| Option | Description | Selected |
|--------|-------------|----------|
| Batch + single-regenerate | Drain-all + --email <id> single mode | |
| Batch only | Drain-all only; regenerate via UI reset to pending + re-run | ✓ |
| You decide | Planner chooses | |

**Notes:** Per-email failure → PATCH .../status {failed, lastError}, continue, report in summary (success criterion #5).

---

## Claude's Discretion

- Exact chunk size for inline batches (constraint: write back each email before authoring the next).
- Exact end-of-run summary format (generated / failed / low-context counts).
- Sample-selection logic for the 5-email gate (reasonable friend/former-colleague/distant spread; graceful fallback).
- Exact grep patterns / wording of `voice-guide.md` (mirror the cover-letter-style.md scrub).

## Deferred Ideas

- Persisted low-context / needs-review column on `outreach_emails` (durable UI badge) — out of scope; revisit if needed.
- Per-email `--email <id>` single-regenerate skill mode — dropped for batch-only; revisit if re-running the batch for one email becomes annoying.
- Per-email Claude API sub-calls / configurable generation model — rejected in favor of inline authoring; revisit only if campaign sizes outgrow chunked inline authoring.
