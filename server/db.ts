import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import postgres from 'postgres';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import * as schema from "../shared/schema.js";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Determine if we're using local PostgreSQL or Neon based on the URL
const isLocalPostgres = !databaseUrl.includes('neon') && (databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1'));

// Configure database connection based on environment
let db: any;

if (isLocalPostgres) {
  // Use postgres.js for local PostgreSQL connection
  const sql = postgres(databaseUrl, { 
    max: 10, // connection pool size
    idle_timeout: 20,
    connect_timeout: 10,
  });
  db = drizzlePostgres(sql, { schema });
} else {
  // Use Neon for cloud database
  const sql = neon(databaseUrl, { arrayMode: false, fullResults: false } as any);
  db = drizzleNeon(sql as any, { schema });
}

export { db };