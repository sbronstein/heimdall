import { db } from '@/lib/db';
import { contacts, prospectBridges } from '../../../../drizzle/schema';
import { and, isNull, sql } from 'drizzle-orm';
import type { ScrapedProspect } from './types';
import type { Contact } from '@/lib/domain/types';

// ProspectWithId — a ScrapedProspect plus the UUID that will be (or has been)
// assigned to the prospect row in the prospects table. Caller pre-generates
// these IDs in app code so bridges can be built without a post-insert RETURNING
// round-trip (required for db.batch atomic non-interactive transaction — see
// route.ts and Phase 6 D-02).
export type ProspectWithId = ScrapedProspect & { id: string };

export type BridgeRow = {
  prospectId: string;
  contactId: string;
};

export type MatchResult = {
  matched: number;
  unmatched: number;
  contactIdsNeedingTriage: string[];
  bridgeValues: BridgeRow[];
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

// matchConnections is now READ-ONLY against the database and PURE with respect
// to writes — it computes the bridge rows that the caller must insert. The
// caller is responsible for batching the bridge insert alongside the prospects
// insert and lead status flip so all three commit atomically (D-02). This
// shape change was forced by the neon-http driver's lack of interactive
// transactions: db.transaction() throws, but db.batch() runs a non-interactive
// transaction over a single HTTP request — which is sufficient for our write
// set because bridge rows can be computed entirely in app code from the
// pre-assigned prospect UUIDs (see ProspectWithId).
export async function matchConnections(
  scrapedProspects: ProspectWithId[]
): Promise<MatchResult> {
  // Defensive early return — no contacts to match if no prospects provided (D-11)
  if (scrapedProspects.length === 0) {
    return { matched: 0, unmatched: 0, contactIdsNeedingTriage: [], bridgeValues: [] };
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
    allContacts = await db
      .select()
      .from(contacts)
      .where(
        and(
          isNull(contacts.archivedAt),
          sql`(lower(${contacts.firstName}) IN (${sql.join(tokens.map((t) => sql`${t}`), sql`, `)}) OR lower(${contacts.lastName}) IN (${sql.join(tokens.map((t) => sql`${t}`), sql`, `)}))`
        )
      );
  }

  let matched = 0;
  let unmatched = 0;
  const contactIdsNeedingTriage = new Set<string>();
  const bridgeValues: BridgeRow[] = [];

  for (const scraped of scrapedProspects) {
    let hasMatch = false;

    for (const mutualName of scraped.mutualConnectionNames) {
      // Try to match by name
      const matchedContact = allContacts.find((c) => fuzzyMatch(mutualName, c));

      if (matchedContact) {
        hasMatch = true;
        matched++;
        bridgeValues.push({
          prospectId: scraped.id,
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

  return {
    matched,
    unmatched,
    contactIdsNeedingTriage: Array.from(contactIdsNeedingTriage),
    bridgeValues
  };
}

// buildBridgeInsert returns the prebuilt Drizzle insert query for the
// computed bridge values, suitable for inclusion in db.batch([...]).
// Returns null when there are no bridges to insert so the caller can skip it.
// onConflictDoNothing() leverages the prospect_bridge_unique constraint
// on (prospect_id, contact_id) (D-04).
export function buildBridgeInsert(bridgeValues: BridgeRow[]) {
  if (bridgeValues.length === 0) return null;
  return db.insert(prospectBridges).values(bridgeValues).onConflictDoNothing();
}
