// Test script for Content Writer API

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
let API_BASE_URL = process.env.BASE_URL || 'https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run';
// Force override the API_BASE_URL if it's set to matrixai-server.pages.dev
if (API_BASE_URL === 'https://matrixai-server.pages.dev') {
  console.log('Overriding API_BASE_URL to use the Alibaba Cloud Function Compute URL');
  API_BASE_URL = 'https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run';
}
const TEST_USER_ID = '0a147ebe-af99-481b-bcaf-ae70c9aeb8d8'; // Replace with a valid test user ID

// Test functions
async function testGenerateContent() {
  console.log('\n=== Testing Generate Content API ===');
  console.log(`API URL: ${API_BASE_URL}/api/content/generateContent`);
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: TEST_USER_ID,
        prompt: 'Write a blog post about artificial intelligence',
        contentType: 'blog',
        tone: 'professional',
        length: 'medium',
      }),
    });

    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Generate Content API test passed');
      return data.content.content_id; // Return content ID for further tests
    } else {
      console.log('❌ Generate Content API test failed:', data.error || 'Unknown error');
      return null;
    }
  } catch (error) {
    console.error('❌ Generate Content API test failed with exception:', error);
    return null;
  }
}

async function testGetGeneratedContent() {
  console.log('\n=== Testing Get Generated Content API ===');
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/getGeneratedContent?uid=${TEST_USER_ID}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Get Generated Content API test passed');
      return true;
    } else {
      console.log('❌ Get Generated Content API test failed:', data.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('❌ Get Generated Content API test failed with exception:', error);
    return false;
  }
}

async function testGetSpecificContent(contentId) {
  console.log('\n=== Testing Get Specific Content API ===');
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/getContent/${contentId}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Get Specific Content API test passed');
      return true;
    } else {
      console.log('❌ Get Specific Content API test failed:', data.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('❌ Get Specific Content API test failed with exception:', error);
    return false;
  }
}

async function testDeleteContent(contentId) {
  console.log('\n=== Testing Delete Content API ===');
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/deleteContent/${contentId}?uid=${TEST_USER_ID}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Delete Content API test passed');
      return true;
    } else {
      console.log('❌ Delete Content API test failed:', data.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('❌ Delete Content API test failed with exception:', error);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('Starting Content Writer API tests...');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Test User ID: ${TEST_USER_ID}`);
  
  // Test generate content
  const contentId = await testGenerateContent();
  if (!contentId) {
    console.log('❌ Cannot proceed with further tests without a valid content ID');
    return;
  }
  
  // Test get all content
  await testGetGeneratedContent();
  
  // Test get specific content
  await testGetSpecificContent(contentId);
  
  // Test delete content
  await testDeleteContent(contentId);
  
  console.log('\n=== All tests completed ===');
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});