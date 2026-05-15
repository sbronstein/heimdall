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

  const db = drizzle(pglite, { schema });

  // Production code uses db.batch([...]) for atomic multi-statement writes
  // (required because the neon-http driver does NOT support db.transaction).
  // pglite's Drizzle adapter does NOT expose .batch, but it DOES support
  // db.transaction. We add a .batch shim here that runs all queries inside a
  // single pglite transaction so atomicity semantics match production.
  // Returns the same tuple shape as neon-http's batch.
  if (typeof (db as unknown as { batch?: unknown }).batch !== 'function') {
    type Runnable = { execute: () => Promise<unknown> };
    (db as unknown as { batch: (qs: Runnable[]) => Promise<unknown[]> }).batch =
      async (queries: Runnable[]) => {
        return db.transaction(async () => {
          // The pre-built queries reference the outer db, but pglite's
          // PGlite client is single-connection — statements issued during
          // a transaction block share the same wire connection. Each query
          // resolves via its own .execute() call, all inside this tx.
          const results: unknown[] = [];
          for (const q of queries) {
            results.push(await q.execute());
          }
          return results;
        });
      };
  }

  return db;
}
