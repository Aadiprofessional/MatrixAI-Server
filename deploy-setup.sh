#!/bin/bash

# Script to prepare the application for deployment and deploy to Alibaba Cloud
# This ensures Sharp is properly installed for both local and server environments

set -e

echo "🚀 Setting up deployment environment..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install Sharp for the current platform
echo "📦 Installing Sharp for current platform..."
npm install sharp

# Install Sharp specifically for Linux x64 (for server deployment)
echo "📦 Installing Sharp for Linux x64 (server deployment)..."
npm install --os=linux --cpu=x64 sharp

echo "✅ Deployment setup complete!"

# Deploy to Alibaba Cloud using Serverless Devs
echo "🚀 Deploying to Alibaba Cloud..."
s deploy

# Since we can't reliably capture the URL from the output, we'll use s info to get it
echo "\n📋 Getting deployment URL..."
s info > deploy_info.txt
cat deploy_info.txt

# Extract the deployment URL from the info output - try urlInternet field
SYSTEM_URL=$(grep -o 'urlInternet:[ ]*https://[^ ]*' deploy_info.txt | awk '{print $2}')

echo "\n📋 Extracted URL: $SYSTEM_URL"

if [ ! -z "$SYSTEM_URL" ]; then
  echo "📋 Deployment URL: $SYSTEM_URL"
  # Export the URL for testing
  export DEPLOYMENT_URL=$SYSTEM_URL
fi

# Test the deployment
echo "🧪 Testing the deployment..."

# If SYSTEM_URL or DEPLOYMENT_URL is set, run the test automatically
if [ ! -z "$SYSTEM_URL" ]; then
  echo "Deployment URL detected: $SYSTEM_URL"
  echo "Running deployment test automatically..."
  DEPLOYMENT_URL=$SYSTEM_URL npm run test-deployment
elif [ ! -z "$DEPLOYMENT_URL" ]; then
  echo "DEPLOYMENT_URL is set. Running deployment test automatically..."
  npm run test-deployment
else
  echo "No deployment URL detected. Skipping automatic test."
  echo "Please set DEPLOYMENT_URL to your deployment URL and run 'npm run test-deployment' manually."
fi

echo "📝 Note: If deploying to a different platform, you may need to install Sharp for that platform:"
echo "npm install --os=[os] --cpu=[cpu] sharp"
echo "See https://sharp.pixelplumbing.com/install#cross-platform for more information."

echo "✅ Deployment process completed successfully!"