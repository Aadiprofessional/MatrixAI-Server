import axios from 'axios';

// Configuration
const baseUrl = 'http://localhost:3000'; // Local server URL instead of Alibaba deployment
const uid = '123e4567-e89b-12d3-a456-426614174000'; // Replace with a valid user ID

// Test functions
async function testCreateHumanization() {
  console.log('\n=== Testing createHumanization with new parameters ===');
  try {
    const response = await axios.post(`${baseUrl}/api/humanize/createHumanization`, {
      uid,
      prompt: 'This is a test of the updated humanization API with new parameters.',
      title: 'Test Humanization',
      tags: ['test', 'api', 'update'],
      language: 'en',
      stealth: 0.8,
      ai_detector: 'ZeroGPT.com'
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    // Save the humanization ID for later tests
    return response.data.humanization.id;
  } catch (error) {
    console.error('Error testing createHumanization:', error.response ? error.response.data : error.message);
    return null;
  }
}

async function testGetUserHumanizations() {
  console.log('\n=== Testing getUserHumanizations ===');
  try {
    const response = await axios.get(`${baseUrl}/api/humanize/getUserHumanizations`, {
      params: { uid }
    });
    
    console.log('Response status:', response.status);
    console.log('Total humanizations:', response.data.total);
    console.log('First humanization:', JSON.stringify(response.data.humanizations[0], null, 2));
    
    return response.data.humanizations;
  } catch (error) {
    console.error('Error testing getUserHumanizations:', error.response ? error.response.data : error.message);
    return [];
  }
}

async function testGetHumanization(humanizationId) {
  console.log(`\n=== Testing getHumanization for ID: ${humanizationId} ===`);
  try {
    const response = await axios.get(`${baseUrl}/api/humanize/getHumanization`, {
      params: { uid, humanizationId }
    });
    
    console.log('Response status:', response.status);
    console.log('Humanization details:', JSON.stringify(response.data.humanization, null, 2));
    
    return response.data.humanization;
  } catch (error) {
    console.error('Error testing getHumanization:', error.response ? error.response.data : error.message);
    return null;
  }
}

async function testDeleteHumanization(humanizationId) {
  console.log(`\n=== Testing deleteHumanization for ID: ${humanizationId} ===`);
  try {
    const response = await axios.delete(`${baseUrl}/api/humanize/deleteHumanization`, {
      params: { uid, humanizationId }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    return true;
  } catch (error) {
    console.error('Error testing deleteHumanization:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  try {
    console.log('Starting API tests on local server...');
    
    // Test creating a humanization with new parameters
    const humanizationId = await testCreateHumanization();
    
    if (humanizationId) {
      // Wait a moment for the database to update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test getting all humanizations
      await testGetUserHumanizations();
      
      // Test getting a specific humanization
      await testGetHumanization(humanizationId);
      
      // Test deleting the humanization
      await testDeleteHumanization(humanizationId);
    }
    
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Execute the tests
runTests();