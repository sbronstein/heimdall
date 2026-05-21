---
phase: quick-260521-dwi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/job-leads/components/recommendation-card.tsx
  - src/features/job-leads/components/recommendation-list.tsx
autonomous: true
requirements: [DWI-01]

must_haves:
  truths:
    - "On a job lead detail page, each recommended-intro contact with a LinkedIn URL shows a LinkedIn badge to the right of their name that opens their profile in a new tab"
    - "On a job lead detail page, each prospect (2nd-degree connection) row with a LinkedIn URL shows a LinkedIn badge to the right of their name/title that opens their profile in a new tab"
    - "Contacts/prospects without a LinkedIn URL render exactly as before (no empty badge)"
  artifacts:
    - path: "src/features/job-leads/components/recommendation-card.tsx"
      provides: "LinkedIn badge rendering for contact and prospect rows"
      contains: "IconBrandLinkedin"
    - path: "src/features/job-leads/components/recommendation-list.tsx"
      provides: "Passes contact.linkedinUrl and prospect.linkedinUrl into RecommendationCard"
      contains: "linkedinUrl"
  key_links:
    - from: "recommendation-list.tsx"
      to: "recommendation-card.tsx"
      via: "contactLinkedinUrl prop + prospects[].linkedinUrl prop"
      pattern: "linkedinUrl"
    - from: "recommendation-card.tsx"
      to: "contact/prospect LinkedIn profile"
      via: "anchor href with target=_blank"
      pattern: "IconBrandLinkedin"
---

<objective>
Add a LinkedIn badge/rectangle to the right of each person's name on the job lead detail page — for both the recommended-intro contacts and the prospects (2nd-degree connections) listed under each contact. Clicking the badge opens that person's LinkedIn profile in a new tab.

Purpose: Let the owner jump straight to a connection's or prospect's LinkedIn profile from the intro-path recommendations without copy-pasting URLs.
Output: Updated `recommendation-card.tsx` (renders the badge) and `recommendation-list.tsx` (threads the existing `linkedinUrl` field through as props).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Data is ALREADY available end-to-end. No schema or API change needed. -->

The recommendations API (`src/app/api/job-leads/[id]/recommendations/route.ts`) selects the full
`contacts` and `prospects` rows. `buildRecommendations` (prioritization.ts) returns:

```typescript
type PrioritizedRecommendation = {
  contact: Contact;                 // Contact has linkedinUrl: string | null
  score: number;
  prospects: Array<{
    prospect: Prospect;             // Prospect has linkedinUrl: string | null
    bridgeScore: number;
  }>;
};
```

Both `Contact` and `Prospect` (drizzle-inferred types) carry `linkedinUrl: string | null`:
- `drizzle/schema/contacts.ts` → `linkedinUrl: text('linkedin_url')`
- `drizzle/schema/job-leads.ts` (prospects table) → `linkedinUrl: text('linkedin_url')`

EXISTING badge pattern to copy verbatim — from `src/features/contacts/components/triage/triage-card.tsx` lines 35-46:

```tsx
{contact.linkedinUrl && (
  <a
    href={contact.linkedinUrl}
    target='_blank'
    rel='noopener noreferrer'
    tabIndex={-1}
    className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent'
  >
    <IconBrandLinkedin className='h-4 w-4' />
    <span>LinkedIn</span>
  </a>
)}
```

Icon import: `import { IconBrandLinkedin } from '@tabler/icons-react';`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Thread linkedinUrl through RecommendationList into RecommendationCard props</name>
  <files>src/features/job-leads/components/recommendation-list.tsx</files>
  <action>
In `recommendation-list.tsx`, where each `<RecommendationCard>` is rendered (the `recommendations.map`), add a `contactLinkedinUrl={rec.contact.linkedinUrl}` prop. The data already exists on `rec.contact` (Contact type has `linkedinUrl: string | null`) — no fetch or API change.

In the same map, the `prospects` prop is built from `rec.prospects.map((p) => ({ ... }))`. Add `linkedinUrl: p.prospect.linkedinUrl` to each mapped prospect object so the card receives the prospect profile URL alongside name/title/seniorityLevel/bridgeScore.

Do not change any fetch logic, the recommendations API, or the prioritization module — `linkedinUrl` is already present on the `Contact` and `Prospect` objects returned by the endpoint.
  </action>
  <verify>
    <automated>cd /Users/sbronstein/Github/heimdall && grep -q "contactLinkedinUrl={rec.contact.linkedinUrl}" src/features/job-leads/components/recommendation-list.tsx && grep -q "linkedinUrl: p.prospect.linkedinUrl" src/features/job-leads/components/recommendation-list.tsx && echo PASS</automated>
  </verify>
  <done>RecommendationList passes `contactLinkedinUrl` and each prospect's `linkedinUrl` into RecommendationCard. No API/fetch changes.</done>
</task>

<task type="auto">
  <name>Task 2: Render LinkedIn badge for contact and prospect rows in RecommendationCard</name>
  <files>src/features/job-leads/components/recommendation-card.tsx</files>
  <action>
In `recommendation-card.tsx`:

1. Import the icon: `import { IconBrandLinkedin } from '@tabler/icons-react';`

2. Extend `RecommendationCardProps`:
   - Add `contactLinkedinUrl?: string | null;`
   - Add `linkedinUrl: string | null;` to the `prospects` array item type (alongside `name`, `title`, `seniorityLevel`, `bridgeScore`).
   Destructure `contactLinkedinUrl` in the component signature.

3. Contact name row: inside the existing `<div className='flex items-center gap-2'>` that wraps `{contactName}` and the closeness `<Badge>`, append a conditional LinkedIn anchor AFTER the closeness badge. Use the exact existing badge pattern (anchor with `target='_blank'`, `rel='noopener noreferrer'`, `tabIndex={-1}`, className `text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent`, containing `<IconBrandLinkedin className='h-4 w-4' />` and `<span>LinkedIn</span>`). Render only when `contactLinkedinUrl` is truthy.

4. Prospect rows: each prospect renders in a row with `<div className='flex items-center gap-2'>{p.name} ...{p.title}</div>` on the left and a seniority `<Badge>` on the right. Add a conditional LinkedIn anchor (same pattern as above, using `p.linkedinUrl`) immediately to the right of the prospect name/title text — place it inside the left `flex items-center gap-2` div, after the title span, so it sits next to the name/title rather than next to the seniority badge. Render only when `p.linkedinUrl` is truthy.

Match Tailwind class ordering conventions (prettier-plugin-tailwindcss). Do not add a badge when the URL is null/empty.
  </action>
  <verify>
    <automated>cd /Users/sbronstein/Github/heimdall && grep -q "IconBrandLinkedin" src/features/job-leads/components/recommendation-card.tsx && grep -q "contactLinkedinUrl" src/features/job-leads/components/recommendation-card.tsx && grep -c "rel='noopener noreferrer'" src/features/job-leads/components/recommendation-card.tsx | grep -q 2 && npx tsc --noEmit -p tsconfig.json && echo PASS</automated>
  </verify>
  <done>RecommendationCard renders a LinkedIn badge to the right of each contact name (when contactLinkedinUrl present) and each prospect name/title (when prospect linkedinUrl present), opening the profile in a new tab. Type-checks clean.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (no type errors from new props).
- Manual: open a job lead detail page in `ready`/`actioned` status. Contacts with a stored `linkedinUrl` show a "LinkedIn" rectangle next to their name; prospects with a stored `linkedinUrl` show one next to their name/title. Both open the correct profile in a new tab. People without a URL show no badge.
</verification>

<success_criteria>
- LinkedIn badge appears to the right of contact names and prospect names/titles on the job lead detail page when a LinkedIn URL exists.
- Badge links to the person's LinkedIn profile and opens in a new tab (`target='_blank'`, `rel='noopener noreferrer'`).
- No badge rendered when the URL is null.
- No DB schema, migration, or API route changes (URL field already exists and is already returned by the recommendations endpoint).
- Visual style matches the existing triage-card LinkedIn badge.
</success_criteria>

<output>
Create `.planning/quick/260521-dwi-add-linkedin-link-rectangle-next-to-name/260521-dwi-SUMMARY.md` when done
</output>
