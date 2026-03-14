import { db } from '@/lib/db';
import { contacts } from '../../../../../drizzle/schema';
import { success } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { isNull, sql, ilike } from 'drizzle-orm';
import Papa from 'papaparse';
import { z } from 'zod';
import { contactClosenessValues } from '@/lib/domain/types';

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

    // Get existing contacts for dedup
    const existing = await db
      .select({
        id: contacts.id,
        linkedinUrl: contacts.linkedinUrl,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        currentCompany: contacts.currentCompany
      })
      .from(contacts)
      .where(isNull(contacts.archivedAt));

    const existingUrls = new Set(
      existing.filter((c) => c.linkedinUrl).map((c) => c.linkedinUrl!.toLowerCase())
    );
    const existingNameCompany = new Set(
      existing.map(
        (c) =>
          `${c.firstName.toLowerCase()}|${c.lastName.toLowerCase()}|${(c.currentCompany || '').toLowerCase()}`
      )
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of parsed.data) {
      const firstName = row['First Name']?.trim();
      const lastName = row['Last Name']?.trim();

      if (!firstName || !lastName) {
        errors.push(`Skipped row: missing name`);
        continue;
      }

      const linkedinUrl = row['URL']?.trim() || null;
      const email = row['Email Address']?.trim() || null;
      const company = row['Company']?.trim() || null;
      const position = row['Position']?.trim() || null;
      const connectedOn = row['Connected On']?.trim() || null;

      // Dedup by LinkedIn URL
      if (linkedinUrl && existingUrls.has(linkedinUrl.toLowerCase())) {
        skipped++;
        continue;
      }

      // Dedup by name + company
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${(company || '').toLowerCase()}`;
      if (existingNameCompany.has(key)) {
        skipped++;
        continue;
      }

      let linkedinConnectionDate: Date | null = null;
      if (connectedOn) {
        const parsed = new Date(connectedOn);
        if (!isNaN(parsed.getTime())) {
          linkedinConnectionDate = parsed;
        }
      }

      try {
        const [contact] = await db
          .insert(contacts)
          .values({
            firstName,
            lastName,
            email,
            linkedinUrl,
            currentCompany: company,
            title: position,
            closeness: defaultCloseness || 'acquaintance',
            outreachStatus: 'not_reached_out',
            importSource: 'linkedin_csv',
            importedAt: new Date(),
            linkedinConnectionDate,
            tags: ['linkedin-import']
          })
          .returning();

        // Track for dedup within batch
        if (linkedinUrl) existingUrls.add(linkedinUrl.toLowerCase());
        existingNameCompany.add(key);

        created++;
      } catch (err) {
        errors.push(`Failed to import ${firstName} ${lastName}: ${String(err)}`);
      }
    }

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
