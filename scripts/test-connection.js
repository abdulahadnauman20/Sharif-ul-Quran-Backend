import pool from '../src/config/db.js';

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic connection
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL database');
    
    // Test query
    const result = await client.query('SELECT NOW() as current_time');
    console.log('⏰ Current database time:', result.rows[0].current_time);
    
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ Users table exists');
      
      // Check table structure
      const tableInfo = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        ORDER BY ordinal_position;
      `);
      
      console.log('📊 Table structure:');
      tableInfo.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
      
      // Check if there are any users
      const userCount = await client.query('SELECT COUNT(*) as count FROM users');
      console.log(`👥 Total users in database: ${userCount.rows[0].count}`);
      
    } else {
      console.log('❌ Users table does not exist. Please run: npm run setup-db');
    }
    
    client.release();
    console.log('🎉 Database connection test completed successfully!');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('\n🔧 Troubleshooting tips:');
    console.error('1. Check if PostgreSQL is running');
    console.error('2. Verify your .env file has correct credentials');
    console.error('3. Make sure the database "quranic_platform" exists');
    console.error('4. Check if your PostgreSQL user has proper permissions');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the test
testConnection();