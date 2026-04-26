import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://rag:rag@localhost:5432/rag',
  },
  strict: true,
  verbose: true,
} satisfies Config;
