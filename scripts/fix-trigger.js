import pool from '../src/config/db.js';

async function fixTrigger() {
  let client;
  
  try {
    console.log('🔍 Checking database triggers and schema...');
    
    client = await pool.connect();
    
    // Check users table structure
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Users table columns:');
    tableInfo.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Check if updated_at column exists
    const hasUpdatedAt = tableInfo.rows.some(row => row.column_name === 'updated_at');
    console.log(`\n🕒 updated_at column exists: ${hasUpdatedAt}`);
    
    // Check existing triggers
    const triggers = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement 
      FROM information_schema.triggers 
      WHERE event_object_table = 'users'
    `);
    
    console.log('\n🔧 Existing triggers on users table:');
    triggers.rows.forEach(trigger => {
      console.log(`   - ${trigger.trigger_name}: ${trigger.event_manipulation}`);
    });
    
    // Check trigger functions
    const functions = await client.query(`
      SELECT proname, prosrc 
      FROM pg_proc 
      WHERE proname LIKE '%updated_at%' OR proname LIKE '%set_updated_at%'
    `);
    
    console.log('\n⚙️ Trigger functions:');
    functions.rows.forEach(func => {
      console.log(`   - ${func.proname}`);
    });
    
    // Fix the issue
    if (!hasUpdatedAt) {
      console.log('\n🔧 Adding updated_at column to users table...');
      await client.query('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
      console.log('✅ Added updated_at column');
    }
    
    // Drop problematic triggers if they exist
    const problematicTriggers = triggers.rows.filter(t => 
      t.action_statement && t.action_statement.includes('updated_at')
    );
    
    for (const trigger of problematicTriggers) {
      console.log(`\n🗑️ Dropping problematic trigger: ${trigger.trigger_name}`);
      await client.query(`DROP TRIGGER IF EXISTS ${trigger.trigger_name} ON users`);
    }
    
    // Create proper trigger function if it doesn't exist
    console.log('\n🔧 Creating proper trigger function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    
    // Create proper trigger
    console.log('🔧 Creating proper trigger...');
    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
    `);
    
    console.log('\n✅ Database trigger fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing triggers:', error.message);
    console.error('Full error:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Run the fix
fixTrigger();







