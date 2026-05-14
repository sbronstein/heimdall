import type { db } from '@/lib/db';
import { contacts, prospects, prospectBridges } from '../../../../drizzle/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ScrapedProspect } from './types';
import type { Contact } from '@/lib/domain/types';

// Structural alias for the neon-http transaction handle (narrower than typeof db).
// NeonHttpTransaction is not exported by drizzle-orm v0.45.1 — use the structural
// fallback instead. `tx.transaction(...)` is a compile error on this type, which
// ensures atomicity invariants are preserved at the call site (D-03 + WARNING 1 fix).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type MatchResult = {
  matched: number;
  unmatched: number;
  contactIdsNeedingTriage: string[];
};

function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

function fuzzyMatch(scraped: string, contact: Contact): boolean {
  const normalized = normalizeForMatch(scraped);
  const contactName = normalizeForMatch(
    `${contact.firstName} ${contact.lastName}`
  );

  if (normalized === contactName) return true;

  // Check if first + last name match individually
  const scrapedParts = normalized.split(/\s+/);
  const first = normalizeForMatch(contact.firstName);
  const last = normalizeForMatch(contact.lastName);

  if (scrapedParts.length >= 2) {
    if (scrapedParts[0] === first && scrapedParts[scrapedParts.length - 1] === last) {
      return true;
    }
  }

  return false;
}

export async function matchConnections(
  tx: Tx,
  jobLeadId: string,
  scrapedProspects: ScrapedProspect[]
): Promise<MatchResult> {
  // Defensive early return — no contacts to match if no prospects provided (D-11)
  if (scrapedProspects.length === 0) {
    return { matched: 0, unmatched: 0, contactIdsNeedingTriage: [] };
  }

  // Build token set from all mutual connection names (D-11)
  const tokenSet = new Set<string>(
    scrapedProspects
      .flatMap((p) => p.mutualConnectionNames)
      .flatMap((s) => s.toLowerCase().split(/\s+/))
      .filter(Boolean)
  );

  // Narrowed contacts SELECT — keyed on tokens from mutualConnectionNames (D-11).
  // Falls back to empty array if no tokens (no bridges possible in that case).
  let allContacts: Contact[] = [];
  if (tokenSet.size > 0) {
    const tokens = Array.from(tokenSet);
    // sql.join with parameterized bindings — NOT sql.raw. Each token is a separate
    // bound parameter (sql`${t}`), preventing SQL injection (T-06-05 mitigation).
    allContacts = await tx
      .select()
      .from(contacts)
      .where(
        and(
          isNull(contacts.archivedAt),
          sql`(lower(${contacts.firstName}) IN (${sql.join(tokens.map((t) => sql`${t}`), sql`, `)}) OR lower(${contacts.lastName}) IN (${sql.join(tokens.map((t) => sql`${t}`), sql`, `)}))`
        )
      );
  }

  // Build prospect records and collect all mutual names
  const prospectRecords = await tx
    .select()
    .from(prospects)
    .where(eq(prospects.jobLeadId, jobLeadId));

  // Map prospect name → prospect record
  const prospectByName = new Map(
    prospectRecords.map((p) => [normalizeForMatch(p.name), p])
  );

  let matched = 0;
  let unmatched = 0;
  const contactIdsNeedingTriage = new Set<string>();
  const bridgeValues: Array<{
    prospectId: string;
    contactId: string;
  }> = [];

  for (const scraped of scrapedProspects) {
    const prospectRecord = prospectByName.get(normalizeForMatch(scraped.name));
    if (!prospectRecord) continue;

    let hasMatch = false;

    for (const mutualName of scraped.mutualConnectionNames) {
      // Try to match by name
      const matchedContact = allContacts.find((c) => fuzzyMatch(mutualName, c));

      if (matchedContact) {
        hasMatch = true;
        matched++;
        bridgeValues.push({
          prospectId: prospectRecord.id,
          contactId: matchedContact.id
        });

        if (!matchedContact.triagedAt) {
          contactIdsNeedingTriage.add(matchedContact.id);
        }
      } else {
        unmatched++;
      }
    }

    if (!hasMatch && scraped.mutualConnectionNames.length === 0) {
      // No mutual connections listed
      unmatched++;
    }
  }

  // Single bulk bridge insert per D-04. onConflictDoNothing() leverages the
  // existing prospect_bridge_unique constraint on (prospect_id, contact_id) —
  // no target needed, Postgres infers it. No try/catch — failures propagate
  // to the caller's transaction for atomic rollback (D-02 invariant).
  if (bridgeValues.length > 0) {
    await tx.insert(prospectBridges).values(bridgeValues).onConflictDoNothing();
  }

  return {
    matched,
    unmatched,
    contactIdsNeedingTriage: Array.from(contactIdsNeedingTriage)
  };
}
