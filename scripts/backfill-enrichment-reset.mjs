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
 *   Dry-run (count only, NO writes):
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

const PREDICATE = `
  archived_at IS NULL
  AND company_at_connection IS NOT DISTINCT FROM current_company
  AND role_at_connection IS NOT DISTINCT FROM title
`;

async function main() {
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
