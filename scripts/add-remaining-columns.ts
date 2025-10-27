import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

async function addRemainingColumns() {
  try {
    console.log('🔄 Adding remaining columns...');
    
    const sql = neon(DATABASE_URL);
    
    // Test connection
    await sql`SELECT 1`;
    console.log('✅ Database connection successful');

    // Add remaining columns to appointments table
    await sql`ALTER TABLE appointments 
      ADD COLUMN IF NOT EXISTS tip_amount DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS payment_method TEXT,
      ADD COLUMN IF NOT EXISTS payment_reference TEXT,
      ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
      ADD COLUMN IF NOT EXISTS rescheduled_from INTEGER REFERENCES appointments(id),
      ADD COLUMN IF NOT EXISTS rescheduled_to INTEGER REFERENCES appointments(id)`;
    console.log('✅ Added remaining columns');

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_appointments_payment_status ON appointments(payment_status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_appointments_payment_date ON appointments(payment_date)`;
    console.log('✅ Created indexes');

    console.log('🎉 Schema update completed successfully!');
  } catch (error) {
    console.error('❌ Error updating schema:', error);
    process.exit(1);
  }
}

addRemainingColumns();
