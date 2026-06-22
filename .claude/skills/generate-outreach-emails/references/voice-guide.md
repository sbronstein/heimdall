# Networking Email Voice Guide

This guide defines Steve's voice for 1:1 networking outreach emails. It is NOT
the cover-letter arc -- those use a company-addressed opener, a three-paragraph
story format, and the full first-and-last-name sign-off. Networking emails are
direct, personal, and short. They open with a first-name greeting, draw only on
known shared context, close with a soft ask, and sign off with "Steve" alone.

Read this guide before authoring any email. Also read `steve-fact-bank.md` for
durable career facts you may draw from when the contact knows Steve's work.

The cover-letter skill (`cover-letter-style.md`) uses a company-addressed opener
and the full name sign-off. This guide defines a completely different format.

---

## 1. Voice Baseline (D-06)

Steve is **always conversational** -- that is the default, not a setting that
gets turned up for close contacts. The only variation is in warmth, specificity,
and length:

- **A real friend (closeness 1-2):** warmer, more personal, can reference a
  specific shared memory by name, might be slightly longer. Reads like a note
  between people who actually grab coffee.
- **A former colleague or professional acquaintance (closeness 3-5):**
  professional-warm but still casual -- peer-level, not formal. Can mention the
  company or team context. Avoids anything stiff or corporate.
- **A distant contact (closeness 6-8):** shorter and lower-pressure. Acknowledge
  the thin connection honestly ("We connected on LinkedIn a while back..."),
  keep the ask soft.

**Use `howMet`, `companyAtConnection`, `roleAtConnection`, and the recent
`interactions` array more than the numeric `closeness` score.** The tier bands
above (friend / former colleague / distant) are a calibration starting point
against real sample output -- they are not a hard spec to implement literally.
A closeness of 4 with rich interaction history should read warmer than a closeness
of 2 with no logged interactions.

The tone never becomes formal, stiff, or corporate. No "I hope this email finds
you well." No "I am reaching out because..." openers. Just start with the person.

---

## 2. Email Anatomy (D-07)

### Subject line

Casual, specific, short. First-name or a concrete hook -- not a generic
"VP Data Role" template that reads like a mass blast. Examples:

- `Quick question, Alex`
- `Anaconda data work -- have 5 min?`
- `Been a while -- wanted to loop you in`

Vary subject lines naturally across a campaign. No template is applied uniformly.

### Greeting

Always: `Hey <FirstName>,`

Use the `firstName` field from the contact brief. Do not use the full name, a
title, or a generic "Hey there." The comma after the first name is required.

### Shared-history hook

Draw only on what is in the contact brief:
- `howMet` -- the origin story
- `companyAtConnection` + `roleAtConnection` -- the context at connection time
- `currentCompany` + `title` -- their current position
- The `interactions` array (the ~3 most recent: type, summary, occurredAt)

This hook should feel like a real person wrote it -- a specific reference, not
"as someone I have had the pleasure of connecting with." If there is no real
shared context, acknowledge the light connection briefly and move on to the ask.

### The ask (D-09)

Every email closes with a soft, low-pressure ask derived from the campaign
`goalInstruction`. The ask is always present -- an email without an ask is not
complete. Adapt it to the person:

- For a close contact who knows the search: "Would you be open to a 20-minute
  call?" works fine.
- For a former colleague: "Would love to reconnect -- any chance you have 15
  minutes in the next few weeks?"
- For a distant contact: "If anything comes to mind, even a quick intro, I would
  really appreciate it -- no pressure at all."

The `goalInstruction` is the campaign-level intent (e.g. "VP Data/AI intros at
growth-stage companies"). Each email adapts that intent to the contact's context
and relationship level.

### Sign-off

`Steve` or `Thanks, Steve`

First name only. Not the full name with a surname. Not the cover-letter sign-off
format. Just:

```
Thanks,
Steve
```

or simply `Steve` for the shortest notes.

---

## 3. Length by Closeness (D-07)

| Relationship | Target length |
|---|---|
| Distant contact (closeness 6-8) | 2-4 sentences -- greeting, brief hook, soft ask, sign-off |
| Former colleague / acquaintance (closeness 3-5) | 3-5 sentences, or a short paragraph + ask |
| Real friend (closeness 1-2) | Up to 2 short paragraphs -- can include more context, warmer hook |

These are targets, not hard limits. A distant contact who triggered a recent
meaningful interaction might warrant an extra sentence. A friend you texted last
week might not need more than 3 lines. Use judgment.

---

## 4. Anti-Hallucination Contract (D-11 / GEN-04)

**Reference only facts present in the provided contact context or in
`steve-fact-bank.md`. Never invent shared history.**

The contact context (from `generation-context`) is the sole per-contact source
of truth:
- `howMet` -- how the connection was made
- `companyAtConnection` / `roleAtConnection` -- their role when you connected
- `currentCompany` / `title` -- where they are now
- `closeness` -- relationship calibration (see D-06)
- `interactions` array -- the ~3 most recent logged touchpoints

When `lowContext: true` (fewer than 2 logged interactions), draw ONLY on
`howMet`, `companyAtConnection`, and `roleAtConnection`. Keep the email short
and the hook brief. Do not add context you do not have.

Do not reference:
- Conversations not in the interactions array
- The contact's work history beyond what is in the brief
- Companies, projects, or events you have no source for
- Anything from `steve-fact-bank.md` that Steve would not plausibly have
  mentioned to this contact

If a `howMet` field is blank or uninformative, say so with a light touch ("We
connected a while back...") rather than inventing an origin.

---

## 5. LLM-Tell Scrub (D-10)

After authoring each email, scan for LLM-tell patterns before write-back.

### BLOCKING -- must rewrite before write-back

These are hard failures. No email is written back until it passes:

**Character patterns:**
```bash
grep -nP '\x{2014}|\x{2013}' email.txt || echo "no em/en dashes"
```
Use plain hyphens only. Em dashes (-) and en dashes (-) are not Steve's style
and are the clearest LLM tell in written output. Check the output literally --
the guide itself is written with plain hyphens only.

**Banned words (blocking):**
- `leverage` -- use "use," "apply," or just name the action
- `robust` -- use "solid," "strong," or just describe the thing
- Generic openers like `I hope this message finds you well` or
  `I hope this email finds you` -- start with the person instead

```bash
grep -niE "leverage|robust|I hope this (message|email) finds you" email.txt || echo "no blocking terms"
```

### ADVISORY -- surface but do not block

The broader banned-term list from `cover-letter-style.md` applies here as
advisory guidance. If these appear, consider rewriting -- but do not block the
write-back solely on an advisory hit:

```bash
grep -niE "delve|tapestry|navigate the|in today's|boast|underscore|testament|realm|not just|isn't just|it's not|not only|seamless|cutting-edge|game-chang|elevate|unlock|pivotal|moreover|furthermore" email.txt || echo "no advisory tells"
```

### Honesty rules (from `cover-letter-style.md`, adapted)

- Match tools and facts to reality. Use `steve-fact-bank.md` for real figures --
  do not inflate or invent numbers (e.g. $150M Series C, 5x productivity at
  ID.me, 100B+ rows at Anaconda).
- Do not soften a fact into something false. Softening is fine ("dramatically
  more productive" vs. "5x") -- inflating is not.
- Do not describe skills Steve does not have or experiences that did not happen.

---

## What NOT to include

The following cover-letter conventions do NOT apply to networking emails:

- The company-addressed opener from `cover-letter-style.md` -- do not use that
  format here. Networking emails open with `Hey <FirstName>,` only, addressing
  a specific person by first name.
- The three-paragraph arc (closest parallel / recent proof / forward-looking
  close) -- that is the cover-letter structure. Networking emails are shorter
  and less formal.
- The `.docx` conversion step -- networking emails are plain text.
- The full-name sign-off (`Sincerely, <first> <last>`) -- first name only.
  Sign as `Steve`, not with the last name attached.
