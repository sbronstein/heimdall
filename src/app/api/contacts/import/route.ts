import { db } from '@/lib/db';
import { contacts } from '../../../../../drizzle/schema';
import { success } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { isNull, sql, and } from 'drizzle-orm';
import Papa from 'papaparse';
import { z } from 'zod';
import { contactClosenessValues, contactEnrichmentStatusValues, outreachStatusValues } from '@/lib/domain/types';

const defaultClosenessSchema = z.enum(contactClosenessValues).optional();

interface LinkedInRow {
  'First Name'?: string;
  'Last Name'?: string;
  'Email Address'?: string;
  'Company'?: string;
  'Position'?: string;
  'Connected On'?: string;
  'URL'?: string;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const defaultCloseness = defaultClosenessSchema.parse(
      formData.get('defaultCloseness') || 'acquaintance'
    );

    if (!file || !(file instanceof File)) {
      return validationError('CSV file is required');
    }

    let text = await file.text();

    // LinkedIn CSV exports include a notes preamble before the actual headers.
    // Find the header row (starts with "First Name") and strip everything before it.
    const headerIndex = text.indexOf('First Name');
    if (headerIndex > 0) {
      text = text.substring(headerIndex);
    }

    const parsed = Papa.parse<LinkedInRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim()
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return validationError('Failed to parse CSV: ' + parsed.errors[0].message);
    }

    // === STEP 1: VALIDATION PASS ===
    // Build the candidate rows + the dedup key set from CSV in one pass.
    type Candidate = {
      firstName: string;
      lastName: string;
      email: string | null;
      linkedinUrl: string | null;
      currentCompany: string | null;
      title: string | null;
      linkedinConnectionDate: Date | null;
      companyAtConnection: string | null;
      roleAtConnection: string | null;
      key: string;  // for name+company dedup
    };

    const candidates: Candidate[] = [];
    const errors: string[] = [];

    for (const row of parsed.data) {
      const firstName = row['First Name']?.trim();
      const lastName = row['Last Name']?.trim();

      if (!firstName || !lastName) {
        errors.push('Skipped row: missing name');
        continue;
      }

      const linkedinUrl = row['URL']?.trim() || null;
      const email = row['Email Address']?.trim() || null;
      const company = row['Company']?.trim() || null;
      const position = row['Position']?.trim() || null;
      const connectedOn = row['Connected On']?.trim() || null;

      let linkedinConnectionDate: Date | null = null;
      if (connectedOn) {
        const d = new Date(connectedOn);
        if (!isNaN(d.getTime())) linkedinConnectionDate = d;
      }

      candidates.push({
        firstName,
        lastName,
        email,
        linkedinUrl,
        currentCompany: company,
        title: position,
        linkedinConnectionDate,
        companyAtConnection: null,
        roleAtConnection: null,
        key: `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${(company ?? '').toLowerCase()}`
      });
    }

    // === STEP 2: NARROWED NAME+COMPANY SELECT (D-09) ===
    // Empty-input short-circuit — no SQL issued.
    let existingNameCompanyKeys = new Set<string>();
    if (candidates.length > 0) {
      const keys = candidates.map((c) => c.key);
      // Narrowed SELECT — only fetches rows whose composed-key matches a CSV row.
      // The composed-key is `lower(first_name) || '|' || lower(last_name) || '|' || lower(coalesce(current_company, ''))`.
      // sql.join parameter-binds each key string individually — NO sql.raw, NO concat.
      // D-06: sql template inside Drizzle's query builder is the documented
      // escape; this is NOT the "raw SQL" CLAUDE.md forbids.
      const narrowed = await db
        .select({
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          currentCompany: contacts.currentCompany
        })
        .from(contacts)
        .where(and(
          isNull(contacts.archivedAt),
          sql`(lower(${contacts.firstName}) || '|' || lower(${contacts.lastName}) || '|' || lower(coalesce(${contacts.currentCompany}, ''))) IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`
        ));
      existingNameCompanyKeys = new Set(
        narrowed.map(
          (r) => `${r.firstName.toLowerCase()}|${r.lastName.toLowerCase()}|${(r.currentCompany ?? '').toLowerCase()}`
        )
      );
    }

    // === STEP 3: FILTER by name+company dedup ===
    // URL dedup is NOT pre-filtered — handled DB-side by ON CONFLICT below.
    const toInsert = candidates.filter((c) => !existingNameCompanyKeys.has(c.key));
    const nameCompanySkipped = candidates.length - toInsert.length;

    // === STEP 4: BULK INSERT with ON CONFLICT (D-08, D-10) ===
    let created = 0;
    if (toInsert.length > 0) {
      try {
        const returningRows = await db
          .insert(contacts)
          .values(
            toInsert.map((c) => ({
              firstName: c.firstName,
              lastName: c.lastName,
              email: c.email,
              linkedinUrl: c.linkedinUrl,
              currentCompany: c.currentCompany,
              title: c.title,
              closeness: (defaultCloseness || 'acquaintance') as (typeof contactClosenessValues)[number],
              outreachStatus: 'not_reached_out' as (typeof outreachStatusValues)[number],
              importSource: 'linkedin_csv',
              importedAt: new Date(),
              linkedinConnectionDate: c.linkedinConnectionDate,
              companyAtConnection: null,
              roleAtConnection: null,
              // CSV columns (Company/Position) are the contact's CURRENT role as of export date,
              // not their role at time of connection. At-connection fields require enrichment.
              enrichmentStatus: 'unenriched' as (typeof contactEnrichmentStatusValues)[number],
              tags: ['linkedin-import']
            }))
          )
          // Targets the partial UNIQUE index `contacts_linkedin_url_unique_idx`
          // (Plan 1) whose predicate is
          // `WHERE linkedin_url IS NOT NULL AND archived_at IS NULL`.
          // The WHERE clause must be specified explicitly so Postgres (and PGlite)
          // can match the conflict target to the partial index — omitting the
          // predicate produces "no unique constraint matching the ON CONFLICT
          // specification" on engines that require an exact match.
          // ACTIVE-rows-only scope (BLOCKER 1 fix) means:
          //   - Conflicts trigger ONLY against existing active contacts with the same URL.
          //   - Re-importing an ARCHIVED contact with the same URL creates a fresh
          //     active row (no silent skip).
          //   - Rows with linkedinUrl IS NULL are not covered by the index and pass
          //     through (no conflict path).
          .onConflictDoNothing({
            target: contacts.linkedinUrl,
            where: sql`${contacts.linkedinUrl} IS NOT NULL AND ${contacts.archivedAt} IS NULL`
          })
          .returning({ id: contacts.id });
        created = returningRows.length;
      } catch (err) {
        // Aggregate failure — per D-10, DB-level errors after the bulk INSERT
        // report as a single error, NOT per-row.
        errors.push(`Failed to insert ${toInsert.length} rows: ${String(err)}`);
      }
    }

    // skipped = (rows lost to name+company dedup) + (rows lost to URL ON CONFLICT)
    const urlConflictSkipped = toInsert.length - created;
    const skipped = nameCompanySkipped + urlConflictSkipped;

    // === STEP 5: SINGLE TIMELINE EVENT ===
    if (created > 0) {
      await logTimeline({
        eventType: 'contacts_imported',
        title: `Imported ${created} contacts from LinkedIn CSV`,
        metadata: { created, skipped, errors: errors.length }
      });
    }

    return success({ created, skipped, errors });
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
