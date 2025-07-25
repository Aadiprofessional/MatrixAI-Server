import axios from 'axios';

const baseUrl = 'https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run';
const uid = '0a147ebe-af99-481b-bcaf-ae70c9aeb8d8';

// Test createHumanization API
async function testCreateHumanization() {
  try {
    console.log('Testing createHumanization API...');
    const response = await axios.post(`${baseUrl}/api/humanize/createHumanization`, {
      uid,
      prompt: 'The Significance of Friendship in Our Lives. Friendship holds a special place in our hearts.',
      title: 'Friendship Essay',
      tags: ['friendship', 'relationships']
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data.humanization?.id; // Return the humanization ID for further tests
  } catch (error) {
    console.error('Error testing createHumanization:', error.response?.data || error.message);
    return null;
  }
}

// Test getUserHumanizations API
async function testGetUserHumanizations() {
  try {
    console.log('\nTesting getUserHumanizations API...');
    const response = await axios.get(`${baseUrl}/api/humanize/getUserHumanizations`, {
      params: { uid }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error testing getUserHumanizations:', error.response?.data || error.message);
  }
}

// Test getHumanization API
async function testGetHumanization(humanizationId) {
  if (!humanizationId) {
    console.log('\nSkipping getHumanization test - no humanization ID available');
    return;
  }
  
  try {
    console.log('\nTesting getHumanization API...');
    const response = await axios.get(`${baseUrl}/api/humanize/getHumanization`, {
      params: { uid, humanizationId }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return humanizationId; // Return the ID for delete test
  } catch (error) {
    console.error('Error testing getHumanization:', error.response?.data || error.message);
    return null;
  }
}

// Test deleteHumanization API
async function testDeleteHumanization(humanizationId) {
  if (!humanizationId) {
    console.log('\nSkipping deleteHumanization test - no humanization ID available');
    return;
  }
  
  try {
    console.log('\nTesting deleteHumanization API...');
    const response = await axios.delete(`${baseUrl}/api/humanize/deleteHumanization`, {
      data: { uid, humanizationId }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error testing deleteHumanization:', error.response?.data || error.message);
  }
}

// Run all tests in sequence
async function runTests() {
  try {
    // First create a humanization
    const humanizationId = await testCreateHumanization();
    
    // Get all humanizations for the user
    await testGetUserHumanizations();
    
    // Get the specific humanization we just created
    const confirmedId = await testGetHumanization(humanizationId);
    
    // Delete the humanization
    await testDeleteHumanization(confirmedId);
    
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

runTests();