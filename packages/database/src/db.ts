import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root if possible
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/postgres';

console.log(`Connecting to Postgres: ${connectionString.replace(/:([^:@]+)@/, ':****@')}`);

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export * from './schema.js';

export async function initializeDatabases() {
  // In Drizzle, we don't necessarily need an init step like we did with SQLite3,
  // but we can add a connection check here if desired.
  try {
    await client`SELECT 1`;
    console.log("Database connection established.");
  } catch (error) {
    console.error("Failed to connect to database:", error);
    throw error;
  }
}
