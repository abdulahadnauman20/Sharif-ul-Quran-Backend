import pool from '../src/config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  let client;
  
  try {
    console.log('🔄 Running database migration...');
    
    client = await pool.connect();
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/001_add_otp_columns.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await client.query(migration);
    
    console.log('✅ Migration completed successfully!');
    console.log('📧 Added OTP columns for password reset functionality');
    console.log('📅 Added calendar tables for scheduling');
    console.log('🔍 Added indexes for better performance');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Run the migration
runMigration();







