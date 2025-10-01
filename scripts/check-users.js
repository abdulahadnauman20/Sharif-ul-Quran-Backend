import pool from '../src/config/db.js';

async function checkUsers() {
  try {
    console.log('👥 Checking users in database...\n');
    
    const client = await pool.connect();
    
    // Get all users with their roles
    const result = await client.query(`
      SELECT 
        id,
        name,
        email,
        user_type as role,
        is_verified,
        created_at
      FROM users 
      ORDER BY created_at DESC
    `);
    
    if (result.rows.length === 0) {
      console.log('📭 No users found in the database.');
      console.log('💡 Try registering a user through your frontend form!');
    } else {
      console.log(`📊 Found ${result.rows.length} user(s) in the database:\n`);
      
      result.rows.forEach((user, index) => {
        console.log(`${index + 1}. 👤 ${user.name}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   🎭 Role: ${user.role}`);
        console.log(`   ✅ Verified: ${user.is_verified ? 'Yes' : 'No'}`);
        console.log(`   📅 Created: ${new Date(user.created_at).toLocaleString()}`);
        console.log('');
      });
    }
    
    // Get count by role
    const roleCount = await client.query(`
      SELECT 
        user_type as role,
        COUNT(*) as count
      FROM users 
      GROUP BY user_type
      ORDER BY user_type
    `);
    
    if (roleCount.rows.length > 0) {
      console.log('📈 Users by role:');
      roleCount.rows.forEach(row => {
        console.log(`   ${row.role}: ${row.count} user(s)`);
      });
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Error checking users:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the check
checkUsers();

