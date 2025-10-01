import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000/api/auth';

async function testRegistration() {
  console.log('🧪 Testing user registration...\n');

  // Test data for Student
  const studentData = {
    name: 'Ahmed Ali',
    email: 'ahmed.ali@example.com',
    password: 'password123',
    userType: 'Student'
  };

  // Test data for Qari
  const qariData = {
    name: 'Sheikh Muhammad',
    email: 'sheikh.muhammad@example.com',
    password: 'password123',
    userType: 'Qari'
  };

  try {
    // Test Student registration
    console.log('📚 Testing Student registration...');
    const studentResponse = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(studentData)
    });

    const studentResult = await studentResponse.json();
    
    if (studentResult.success) {
      console.log('✅ Student registration successful!');
      console.log(`   User ID: ${studentResult.data.user.id}`);
      console.log(`   Name: ${studentResult.data.user.name}`);
      console.log(`   Email: ${studentResult.data.user.email}`);
      console.log(`   Type: ${studentResult.data.user.user_type}`);
      console.log(`   Token: ${studentResult.data.token.substring(0, 20)}...`);
    } else {
      console.log('❌ Student registration failed:', studentResult.message);
    }

    console.log('\n📖 Testing Qari registration...');
    const qariResponse = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(qariData)
    });

    const qariResult = await qariResponse.json();
    
    if (qariResult.success) {
      console.log('✅ Qari registration successful!');
      console.log(`   User ID: ${qariResult.data.user.id}`);
      console.log(`   Name: ${qariResult.data.user.name}`);
      console.log(`   Email: ${qariResult.data.user.email}`);
      console.log(`   Type: ${qariResult.data.user.user_type}`);
      console.log(`   Token: ${qariResult.data.token.substring(0, 20)}...`);
    } else {
      console.log('❌ Qari registration failed:', qariResult.message);
    }

    // Test duplicate email
    console.log('\n🔄 Testing duplicate email registration...');
    const duplicateResponse = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(studentData)
    });

    const duplicateResult = await duplicateResponse.json();
    
    if (!duplicateResult.success) {
      console.log('✅ Duplicate email correctly rejected:', duplicateResult.message);
    } else {
      console.log('❌ Duplicate email was not rejected!');
    }

    console.log('\n🎉 Registration testing completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\n🔧 Make sure your server is running: npm run dev');
  }
}

// Run the test
testRegistration();

