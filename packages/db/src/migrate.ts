import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, closeDb } from './client.js';

async function main() {
  const db = getDb();
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
