import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { contacts } from '../drizzle/schema';
import { isNull } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

interface ContactData {
  firstName: string;
  lastName: string;
  linkedinUrl: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

async function main() {
  const dataFile = path.resolve(__dirname, 'linkedin-contacts.json');
  if (!fs.existsSync(dataFile)) {
    console.error('Run: cat paste.txt | python3 scripts/generate-import-data.py > scripts/linkedin-contacts.json');
    process.exit(1);
  }

  const parsed: ContactData[] = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  console.log(`Loaded ${parsed.length} contacts from JSON`);

  // Get existing contacts for dedup
  const existing = await db
    .select({
      id: contacts.id,
      linkedinUrl: contacts.linkedinUrl,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      currentCompany: contacts.currentCompany,
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

  console.log(`Found ${existing.length} existing contacts for dedup`);

  let skipped = 0;
  const toInsert: Array<typeof contacts.$inferInsert> = [];

  for (const row of parsed) {
    const linkedinUrl = row.linkedinUrl || null;

    if (linkedinUrl && existingUrls.has(linkedinUrl.toLowerCase())) {
      skipped++;
      continue;
    }

    const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}|${(row.company || '').toLowerCase()}`;
    if (existingNameCompany.has(key)) {
      skipped++;
      continue;
    }

    if (linkedinUrl) existingUrls.add(linkedinUrl.toLowerCase());
    existingNameCompany.add(key);

    toInsert.push({
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email || undefined,
      linkedinUrl: linkedinUrl || undefined,
      currentCompany: row.company || undefined,
      title: row.position || undefined,
      closeness: 'linkedin_only',
      outreachStatus: 'not_reached_out',
      importSource: 'linkedin_csv',
      importedAt: new Date(),
      linkedinConnectionDate: parseDate(row.connectedOn) || undefined,
      tags: ['linkedin-import'],
    });
  }

  console.log(`Will insert ${toInsert.length} new contacts (${skipped} duplicates skipped)`);

  if (toInsert.length === 0) {
    console.log('Nothing to insert.');
    process.exit(0);
  }

  // Insert in batches of 50
  const BATCH_SIZE = 50;
  let created = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(contacts).values(batch);
      created += batch.length;
      process.stdout.write(`\r  Inserted ${created}/${toInsert.length}`);
    } catch (err) {
      console.error(`\n  Batch at ${i} failed:`, err);
      errors += batch.length;
    }
  }

  console.log(`\n\nDone! Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
