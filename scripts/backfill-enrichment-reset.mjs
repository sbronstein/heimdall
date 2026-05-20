/**
 * Backfill: reset legacy contacts where at-connection == current (wrong baseline).
 *
 * Context: the CSV import previously seeded companyAtConnection/roleAtConnection
 * directly from the CSV Company/Position columns (which are the contact's CURRENT
 * role as of export date, not their role at time of connection). Those rows were
 * also marked enrichmentStatus='enriched', removing them from the enrichment queue.
 *
 * This script resets rows that still have at-connection == current by setting
 * companyAtConnection and roleAtConnection back to NULL and enrichmentStatus back
 * to 'unenriched', so they re-enter the enrichment queue.
 *
 * Predicate: archived_at IS NULL
 *            AND company_at_connection IS NOT DISTINCT FROM current_company
 *            AND role_at_connection IS NOT DISTINCT FROM title
 *
 * Usage:
 *   Stats (read-only breakdown — total / in-queue / enriched / would-reset):
 *     node scripts/backfill-enrichment-reset.mjs --stats
 *
 *   Dry-run (count would-reset only, NO writes):
 *     node scripts/backfill-enrichment-reset.mjs
 *
 *   Apply (writes to the live DB — USER runs this after reviewing dry-run count):
 *     node scripts/backfill-enrichment-reset.mjs --apply
 *
 * IMPORTANT: The executor (Claude Code) MUST NOT run --apply against the live DB.
 * The user reviews the dry-run count first and then decides whether to apply.
 */

import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';

// Load DATABASE_URL from .env.local if not already in the environment.
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  try {
    const envFile = readFileSync('.env.local', 'utf8');
    const match = envFile.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      databaseUrl = match[1].trim();
    }
  } catch {
    // .env.local missing or unreadable — handled below
  }
}

if (!databaseUrl) {
  console.error('Error: DATABASE_URL is not set and could not be read from .env.local.');
  console.error('Set DATABASE_URL in your environment or ensure .env.local exists.');
  process.exit(1);
}

// Normalize the connection string. Some environments export DATABASE_URL with
// the query-string separators HTML-entity-encoded (`&amp;`) or wrapped in quotes
// (common with `.env.local` values or copy/paste through web tooling). Neither is
// ever valid in a real Postgres URL, so strip them defensively — a no-op when the
// value is already clean.
databaseUrl = databaseUrl.replace(/^["']|["']$/g, '').replace(/&amp;/g, '&');

const sql = neon(databaseUrl);
const applyMode = process.argv.includes('--apply');
const statsMode = process.argv.includes('--stats');

const PREDICATE = `
  archived_at IS NULL
  AND company_at_connection IS NOT DISTINCT FROM current_company
  AND role_at_connection IS NOT DISTINCT FROM title
`;

// Mirrors the GET /api/contacts/enrichment-queue WHERE clause:
//   active AND (company_at_connection IS NULL OR role_at_connection IS NULL)
//   AND enrichment_status <> 'enriched'
const IN_QUEUE = `
  archived_at IS NULL
  AND (company_at_connection IS NULL OR role_at_connection IS NULL)
  AND enrichment_status <> 'enriched'
`;

async function main() {
  if (statsMode) {
    // STATS: read-only breakdown, no writes.
    const rows = await sql`
      SELECT
        count(*) FILTER (WHERE archived_at IS NULL) AS total_active,
        count(*) FILTER (WHERE archived_at IS NULL AND enrichment_status = 'enriched') AS enriched,
        count(*) FILTER (WHERE archived_at IS NULL AND enrichment_status = 'pending') AS pending,
        count(*) FILTER (WHERE archived_at IS NULL AND enrichment_status = 'failed') AS failed,
        count(*) FILTER (WHERE ${sql.unsafe(IN_QUEUE)}) AS in_queue,
        count(*) FILTER (WHERE ${sql.unsafe(PREDICATE)}) AS would_reset
      FROM contacts
    `;
    const s = rows[0];
    console.log('Enrichment stats (active contacts only):');
    console.log(`  total active        : ${Number(s.total_active)}`);
    console.log(`  in enrichment queue : ${Number(s.in_queue)}  (missing at-connection, not enriched)`);
    console.log(`  enriched            : ${Number(s.enriched)}`);
    console.log(`  pending             : ${Number(s.pending)}`);
    console.log(`  failed              : ${Number(s.failed)}`);
    console.log(`  would reset (--apply): ${Number(s.would_reset)}  (at-connection == current)`);
    return;
  }

  if (!applyMode) {
    // DRY-RUN: count affected rows, no writes.
    const rows = await sql`
      SELECT count(*) AS affected
      FROM contacts
      WHERE ${sql.unsafe(PREDICATE)}
    `;
    const affected = Number(rows[0].affected);
    console.log(`Dry-run: ${affected} row(s) would be reset (at-connection == current, not archived).`);
    console.log('No rows were written. Pass --apply to perform the reset.');
    return;
  }

  // APPLY: reset the identified rows.
  const rows = await sql`
    UPDATE contacts
    SET
      company_at_connection = NULL,
      role_at_connection = NULL,
      enrichment_status = 'unenriched',
      updated_at = now()
    WHERE ${sql.unsafe(PREDICATE)}
    RETURNING id
  `;
  console.log(`Applied: ${rows.length} row(s) reset (at-connection cleared, enrichment_status='unenriched').`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
