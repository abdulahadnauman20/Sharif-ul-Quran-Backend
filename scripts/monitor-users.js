import pool from '../src/config/db.js';

let lastUserCount = 0;

async function monitorUsers() {
  try {
    const client = await pool.connect();
    
    // Get initial count
    const initialResult = await client.query('SELECT COUNT(*) as count FROM users');
    lastUserCount = parseInt(initialResult.rows[0].count);
    
    console.log(`🔍 Monitoring users in database...`);
    console.log(`📊 Initial user count: ${lastUserCount}`);
    console.log(`⏰ Started monitoring at: ${new Date().toLocaleString()}`);
    console.log(`💡 Register a user through your frontend to see real-time updates!\n`);
    
    // Monitor every 2 seconds
    const interval = setInterval(async () => {
      try {
        const result = await client.query(`
          SELECT 
            id,
            name,
            email,
            user_type as role,
            created_at
          FROM users 
          ORDER BY created_at DESC
          LIMIT 1
        `);
        
        const currentCount = result.rows.length;
        
        if (currentCount > lastUserCount) {
          const newUser = result.rows[0];
          console.log(`\n🎉 NEW USER REGISTERED!`);
          console.log(`👤 Name: ${newUser.name}`);
          console.log(`📧 Email: ${newUser.email}`);
          console.log(`🎭 Role: ${newUser.role}`);
          console.log(`📅 Time: ${new Date(newUser.created_at).toLocaleString()}`);
          console.log(`📊 Total users: ${currentCount}\n`);
          
          lastUserCount = currentCount;
        }
        
      } catch (error) {
        console.error('❌ Monitoring error:', error.message);
      }
    }, 2000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping user monitoring...');
      clearInterval(interval);
      client.release();
      pool.end();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start monitoring:', error.message);
    process.exit(1);
  }
}

// Start monitoring
monitorUsers();

