# Cover letter style

Steve's cover letters are **casual, warm, and personal** — not formal business letters. They
read like a confident note from a peer, lead with a story, and stay short (the project
`CLAUDE.md` caps them at 2-3 paragraphs).

## Format

- **No letterhead.** No name/address/phone block, no `Re:` subject line. (A bare date line is
  optional and usually omitted.)
- **Open with:** `Hey <Company> folks!` or `Hey <Company> team!`
- **Three short paragraphs** (the arc below).
- **Sign off:** `Thanks,` / `Steve Bronstein` — or `Sincerely,` / `Steve Bronstein`. Always the
  name **"Steve Bronstein."**
- First person, enthusiastic, specific. Phrases that fit the voice: "I'd love to discuss," "I
  believe deeply that," "I definitely show up with working software, not slides."

## The three-paragraph arc

1. **The closest parallel, as a story.** Open with the single experience that maps most
   directly to *this* role, told concretely. (Updater → the IODA royalty-reconciliation system;
   Veho → directing agentic/Claude Code work; Lyra → a decade building/scaling data orgs.)
2. **Recent proof, with real numbers.** Two or three current-era results that show the range is
   live, not historical. Name the actual stack where it matches the JD.
3. **Forward-looking close.** "I'd love to talk through how I can help <do the role's core
   thing>, the team I'd build, and where I'd focus first." Then a thank-you.

## Honesty rules (these came from Steve's own edits)

- **Match tools to reality.** Anaconda used **Omni**, not Looker. If the JD lists Looker and
  you're citing Anaconda, say "the same Snowflake, dbt, and Python stack you use today (with
  Omni instead of Looker)." Don't paper over a mismatch.
- **Use the real figures** from `steve-fact-bank.md`: 400K+ songs and 10,000+ rightsholders at
  IODA, hundreds of billions of rows at Anaconda, 100+ people scaled earlier in career, VP Data
  title at Business.com, founding COO at IODA.
- In prose it's fine to soften a hard metric ("made investigators dramatically more productive")
  even though the resume keeps the precise number ("5x") — but never inflate.

## Gold-standard examples (the final, Steve-approved letters)

**Lyra Health:**
> Hey Lyra Health folks!
>
> I have spent the last decade building and scaling data orgs - data engineering, data science,
> analytics, and applied AI. At Anaconda I built an enterprise customer intelligence platform on
> top of 100 billion-plus rows and stood up the applied AI work that fed a period of significant
> ARR growth and a $150M Series C. Before that I grew data teams from a handful of people to
> 20-plus at companies moving through hypergrowth.
>
> I have led data and ML in regulated, high-trust settings: at ID.me I built fraud models that
> made the investigations team five times more productive while serving the IRS, the VA, and
> state agencies; governance, data quality, and responsible use of models was critical. Second,
> I am hands-on with modern AI. I direct multi-agent workflows for data operations and build
> with tools like Claude Code myself, which keeps my strategy grounded in what the technology
> can actually deliver today.
>
> I would love to discuss further how I can help define and execute Lyra's data and AI strategy,
> build the team behind it, and report progress clearly to your executives and board. Thank you
> for your consideration.
>
> Thanks,
> Steve Bronstein

**Updater:**
> Hey Updater team!
>
> I have spent my career in businesses where data runs the operation rather than supporting it.
> At IODA, the digital music distributor where I was founding COO, I built and ran the systems
> that took in activity and royalty reporting on 400K+ songs from more than 60 services and
> reconciled payouts to over 10,000 rightsholders.
>
> More recently, as VP Data at Business.com, I deployed prediction models that lifted gross
> margin from 25 percent to 37 percent on a revenue-driven engine. At ID.me, I built fraud and
> anomaly detection that made investigators dramatically more productive, and at Anaconda I
> turned hundreds of billions of rows of product telemetry into account-level intelligence in
> the same Snowflake, dbt, and Python stack you use today (with Omni instead of Looker),
> leveraging both traditional ML and LLMs.
>
> I'd love to talk through how I would approach Updater's revenue and risk intelligence, the
> team I would build to own it, and where I would focus first.
>
> Thanks,
> Steve Bronstein

**Veho:**
> Hey Veho folks!
>
> I believe deeply that LLMs can and should change how an entire tech organization builds. At
> Anaconda I directed analytics engineers building multi-agent orchestration for autonomous data
> operations, and I build with Claude Code myself, including a dashboard that grades LLM usage
> and optimizes AI spend. I definitely show up with working software, not slides.
>
> I have also done the scaling that this job requires. Earlier in my career, I led teams of
> technical + non-technical folks that scaled up to 100+ people. More recently, I have built and
> led data science, analytics engineering, and platform teams from the first hire through
> 20-plus people, including distributed teams, and I move in weeks rather than quarters. I made
> experimentation a core capability at Anaconda, and I have a track record of compressing the
> path from question to insight so teams stop fighting their data and start using it.
>
> I would love to discuss further how I can help drive Veho's transformation into an AI-first
> org. Thank you for your consideration.
>
> Sincerely,
> Steve Bronstein

## Writing to `.docx`

Draft as a plain `.txt`, scrub it (below), then:

```bash
textutil -convert docx -output "<Company>/Steve Bronstein - <Company> Cover Letter.docx" /tmp/cl.txt
```

## LLM-tell scrub (required before finalizing)

Use plain hyphens, never em/en dashes. Avoid the usual machine-writing tells. Run this and fix
any hit:

```bash
grep -nP '\x{2014}|\x{2013}' cl.txt || echo "no em/en dashes"
grep -niE "delve|tapestry|navigate the|in today's|boast|underscore|testament|realm|not just|isn't just|it's not|not only|seamless|robust|cutting-edge|game-chang|elevate|unlock|pivotal|moreover|furthermore" cl.txt || echo "no tells"
```

(The project `CLAUDE.md` calls out em-dashes and "it's not this, it's that" specifically — those
are the non-negotiables.)
