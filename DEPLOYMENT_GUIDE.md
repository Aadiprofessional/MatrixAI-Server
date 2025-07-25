# MatrixAI Server Deployment Guide

## Overview

This guide explains how to deploy the MatrixAI Server to Alibaba Cloud Function Compute, with special attention to the Sharp image processing library which requires platform-specific installation.

## Prerequisites

1. Node.js installed (version 18.17.0 or higher)
2. Serverless Devs CLI installed (`npm install -g @serverless-devs/s`)
3. Alibaba Cloud account and credentials configured

## Deployment Steps

### 1. Configure Alibaba Cloud Credentials

Make sure your Alibaba Cloud credentials are properly configured. You can set them in a `.env` file or as environment variables:

```
ALIBABA_CLOUD_ACCESS_KEY_ID=your_access_key_id
ALIBABA_CLOUD_ACCESS_KEY_SECRET=your_access_key_secret
```

### 2. Run the Deployment Setup Script

We've created a deployment script that handles the installation of dependencies, including the platform-specific Sharp library, and deploys the application to Alibaba Cloud:

```bash
./deploy-setup.sh
```

This script will:
1. Install all dependencies
2. Install Sharp for your local platform
3. Install Sharp specifically for Linux x64 (required for Alibaba Cloud)
4. Deploy the application using Serverless Devs (`s deploy`)
5. Provide instructions for testing the deployment

### 3. Test the Deployment

After deployment, you can test if the server is working properly by setting the deployment URL and running the test script:

```bash
export DEPLOYMENT_URL=https://your-deployment-url.com
npm run test-deployment
```

Alternatively, if you set the `DEPLOYMENT_URL` environment variable before running the deployment script, the test will run automatically.

#### What the Test Checks

The test-deployment.js script performs several checks to ensure your server is functioning correctly:

1. **Health Endpoint Test**: Verifies that the `/health` endpoint returns a successful response with server status information.

2. **API Info Endpoint Test**: Checks that the `/api` endpoint returns the expected format with an array of available endpoints. Note that this endpoint returns a 404 status code by design, but includes helpful information about available endpoints.

3. **Sharp Image Processing Test**: Performs a basic check to ensure the server can handle requests that might involve image processing using the Sharp library.

If all tests pass, you'll see a success message. If any test fails, the script will provide detailed error information to help you troubleshoot.

#### Sample Successful Test Output

```
🧪 Testing deployment at: https://your-deployment-url.com

📋 Test 1: Health endpoint
Health endpoint response: {
  status: 'OK',
  timestamp: '2025-07-25T00:40:18.319Z',
  service: 'MatrixAI Server',
  version: '1.0.0',
  platform: 'Express.js'
}
✅ Health endpoint is working!

📋 Test 2: API info endpoint
API endpoint response: {
  error: 'Not Found',
  message: 'The requested endpoint does not exist',
  availableEndpoints: [
    '/health',
    '/api/audio/uploadAudioUrl',
    // ... other endpoints
  ]
}
✅ API info endpoint is working as expected! (Returns available endpoints)

📋 Test 3: Testing Sharp image processing
✅ Server is responding to OPTIONS requests (CORS preflight check passed)

🔍 Deployment Test Results:
✅ All tests passed! The server is working properly.
```

## Troubleshooting

### Sharp Module Issues

If you encounter errors related to the Sharp module, such as:

```
Could not load the "sharp" module using the linux-x64 runtime
```

This is likely because Sharp needs to be installed specifically for the target platform. Our deployment script handles this by installing Sharp for both your local platform and the Linux x64 platform used by Alibaba Cloud.

If you need to manually fix this issue:

```bash
npm install --os=linux --cpu=x64 sharp
```

### Supabase Compatibility

If you see warnings about Node.js version compatibility with Supabase:

```
deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later.
```

Consider upgrading the Node.js runtime in the `s.yaml` file from `nodejs18` to `nodejs20` if supported by Alibaba Cloud Function Compute.

## Additional Information

- The deployment uses the configuration in `s.yaml`
- The server is deployed as a Function Compute service with an HTTP trigger
- Memory is set to 1024MB and timeout to 900 seconds

For more information about Sharp installation for different platforms, see: https://sharp.pixelplumbing.com/install#cross-platform