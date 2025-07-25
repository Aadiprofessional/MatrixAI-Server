import axios from 'axios';

// Test user ID - replace with a valid user ID from your database
const TEST_UID = '0a147ebe-af99-481b-bcaf-ae70c9aeb8d8';
const BASE_URL = 'http://localhost:3000';

// Sample text for AI detection
const SAMPLE_TEXT = `RapidAPI is a platform that enables developers to find, connect to, and manage APIs (Application Programming Interfaces) in one place. It serves as a marketplace where you can access a wide range of public and private APIs. Developers can search for APIs, test them directly on the platform, and integrate them into their applications using RapidAPI's tools.`;

// Test the createDetection endpoint
async function testCreateDetection() {
  try {
    console.log('\n=== Testing createDetection endpoint ===');
    const response = await axios.post(`${BASE_URL}/api/detection/createDetection`, {
      uid: TEST_UID,
      text: SAMPLE_TEXT,
      title: 'Test Detection',
      tags: ['test', 'api'],
      language: 'en'
    });

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));

    // Return the detection ID for further testing
    return response.data.detection.id;
  } catch (error) {
    console.error('Error testing createDetection:', error.response?.data || error.message);
    return null;
  }
}

// Test the getUserDetections endpoint
async function testGetUserDetections() {
  try {
    console.log('\n=== Testing getUserDetections endpoint ===');
    const response = await axios.get(`${BASE_URL}/api/detection/getUserDetections`, {
      params: {
        uid: TEST_UID,
        page: 1,
        itemsPerPage: 10
      }
    });

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error testing getUserDetections:', error.response?.data || error.message);
  }
}

// Test the getDetection endpoint
async function testGetDetection(detectionId) {
  try {
    console.log('\n=== Testing getDetection endpoint ===');
    const response = await axios.get(`${BASE_URL}/api/detection/getDetection`, {
      params: {
        uid: TEST_UID,
        detectionId
      }
    });

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error testing getDetection:', error.response?.data || error.message);
  }
}

// Test the deleteDetection endpoint
async function testDeleteDetection(detectionId) {
  try {
    console.log('\n=== Testing deleteDetection endpoint ===');
    const response = await axios.delete(`${BASE_URL}/api/detection/deleteDetection`, {
      data: {
        uid: TEST_UID,
        detectionId
      }
    });

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error testing deleteDetection:', error.response?.data || error.message);
  }
}

// Run all tests
async function runTests() {
  try {
    // Test create detection and get the detection ID
    const detectionId = await testCreateDetection();
    
    if (detectionId) {
      // Wait a bit to ensure the detection is saved
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test get user detections
      await testGetUserDetections();
      
      // Test get specific detection
      await testGetDetection(detectionId);
      
      // Test delete detection
      await testDeleteDetection(detectionId);
    }
    
    console.log('\n=== All tests completed ===');
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run the tests
runTests();