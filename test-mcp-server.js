#!/usr/bin/env node

// Simple test script to verify MCP server endpoints
const MCP_SERVER_URL = 'http://localhost:3001';

async function testMcpServer() {
  console.log('🧪 Testing MCP Server endpoints...\n');

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await fetch(`${MCP_SERVER_URL}/health`);
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Health check passed:', healthData);
    } else {
      console.log('❌ Health check failed:', healthResponse.status);
    }

    // Test 2: Create cluster (this will fail without proper credentials, but should return a proper error)
    console.log('\n2️⃣ Testing cluster creation endpoint...');
    const createResponse = await fetch(`${MCP_SERVER_URL}/create-cluster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clusterName: 'test-cluster-' + Date.now(),
        tier: 'M10'
      })
    });
    
    if (createResponse.ok) {
      const createData = await createResponse.json();
      console.log('✅ Cluster creation started:', createData);
      
      // Test 3: Check cluster status
      if (createData.requestId) {
        console.log('\n3️⃣ Testing cluster status endpoint...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const statusResponse = await fetch(`${MCP_SERVER_URL}/api/cluster-status?id=${createData.requestId}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log('✅ Status endpoint working:', statusData);
        } else {
          console.log('❌ Status endpoint failed:', statusResponse.status);
        }
      }
    } else {
      const errorData = await createResponse.json();
      console.log('⚠️ Cluster creation failed (expected without credentials):', errorData.message);
    }

    console.log('\n🎉 MCP Server test completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Copy env-template.txt to .env');
    console.log('2. Add your MongoDB Atlas credentials to .env');
    console.log('3. Start the MCP server: ./start-mcp-server.sh');
    console.log('4. Start the frontend: npm run dev');
    console.log('\n🔧 Debugging the Atlas API error:');
    console.log('- The error "No cluster named X exists" suggests the cluster creation response');
    console.log('- might be returning a request ID instead of the actual cluster ID');
    console.log('- The MCP server now uses cluster names for status checks instead of IDs');
    console.log('- This should resolve the "cluster not found" errors');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the MCP server is running on port 3001');
    console.log('   Run: ./start-mcp-server.sh');
  }
}

testMcpServer();
