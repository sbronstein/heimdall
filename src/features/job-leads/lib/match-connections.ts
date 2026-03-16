import { db } from '@/lib/db';
import { contacts, prospects, prospectBridges } from '../../../../drizzle/schema';
import { eq, isNull } from 'drizzle-orm';
import type { ScrapedProspect } from './scrape-connections';
import type { Contact } from '@/lib/domain/types';

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
  jobLeadId: string,
  scrapedProspects: ScrapedProspect[]
): Promise<MatchResult> {
  // Fetch all active contacts
  const allContacts = await db
    .select()
    .from(contacts)
    .where(isNull(contacts.archivedAt));

  // Build prospect records and collect all mutual names
  const prospectRecords = await db
    .select()
    .from(prospects)
    .where(
      eq(prospects.jobLeadId, jobLeadId)
    );

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

      // Also try to match by linkedin URL if available
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

  // Insert bridges
  if (bridgeValues.length > 0) {
    for (const val of bridgeValues) {
      try {
        await db.insert(prospectBridges).values(val).onConflictDoNothing();
      } catch {
        // Ignore duplicate bridge errors
      }
    }
  }

  return {
    matched,
    unmatched,
    contactIdsNeedingTriage: Array.from(contactIdsNeedingTriage)
  };
}
