import fetch from 'node-fetch';

// Test the email sending API
const testEmailAPI = async () => {
  try {
    console.log('Testing email API...');
    
    const response = await fetch('http://localhost:8080/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: 'anadi.mpvm@gmail.com',
        subject: 'Test Email from MatrixAI',
        message: `
          <h1>Hello from MatrixAI!</h1>
          <p>This is a test email sent from the MatrixAI email API.</p>
          <p>The email was sent at: ${new Date().toLocaleString()}</p>
          <p>If you're receiving this, the email API is working correctly!</p>
          <br>
          <p>Best regards,</p>
          <p>MatrixAI Team</p>
        `
      }),
    });
    
    const data = await response.json();
    console.log('Response:', data);
    
    if (data.success) {
      console.log('✅ Email API test passed!');
    } else {
      console.log('❌ Email API test failed:', data.message);
    }
  } catch (error) {
    console.error('Error testing email API:', error);
  }
};

// Run the test
testEmailAPI();