// Per D-05/D-08, only DB-touching tests should call this.
// Pure-logic tests skip the harness entirely.
// Each call returns a fresh in-memory PGlite instance with all migrations applied (CD-05).

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../drizzle/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createTestDb() {
  const pglite = new PGlite();

  const migrationsDir = path.join(__dirname, '../../drizzle/migrations');
  const files = await readdir(migrationsDir);
  const sqlFiles = files
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of sqlFiles) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf-8');
    await pglite.exec(sql);
  }

  return drizzle(pglite, { schema });
}
