#!/bin/bash

# MatrixAI Server - Alibaba Cloud Function Compute Deployment Script
# This script deploys the MatrixAI server to Alibaba Cloud Function Compute
# Updated to include Payment API deployment

set -e

echo "🚀 Starting MatrixAI Server deployment to Alibaba Cloud Function Compute..."

# Set credentials from .funrc or environment variables
if [ -f ".env" ]; then
  echo "Loading environment variables from .env file..."
  export $(grep -v '^#' .env | xargs)
else
  echo "⚠️ .env file not found. Make sure your environment variables are set."
  # Check if credentials are already set in environment
  if [ -z "$ALIBABA_CLOUD_ACCESS_KEY_ID" ] || [ -z "$ALIBABA_CLOUD_ACCESS_KEY_SECRET" ]; then
    echo "❌ Alibaba Cloud credentials not found. Please set them in .env file or environment."
    exit 1
  fi
fi

# Check if Fun CLI is installed
if ! command -v fun &> /dev/null; then
    echo "❌ Fun CLI is not installed. Installing it now..."
    npm install -g @alicloud/fun
fi

# Check if template.yml exists
if [ ! -f "template.yml" ]; then
    echo "❌ Error: template.yml not found. Please ensure you're in the project root directory."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install payment API specific dependencies
echo "📦 Installing payment API dependencies..."
if ! npm list @supabase/supabase-js > /dev/null 2>&1; then
  echo "Installing @supabase/supabase-js..."
  npm install @supabase/supabase-js
fi

if ! npm list jsonwebtoken > /dev/null 2>&1; then
  echo "Installing jsonwebtoken..."
  npm install jsonwebtoken
fi

# Validate template
echo "🔍 Validating template..."
fun validate

# Configure Fun CLI with credentials
echo "🔧 Configuring Fun CLI..."
fun config --access-key-id "$ALIBABA_CLOUD_ACCESS_KEY_ID" --access-key-secret "$ALIBABA_CLOUD_ACCESS_KEY_SECRET" --default-region cn-hangzhou --account-id 5939539157604809

# Deploy the function
echo "☁️  Deploying to Alibaba Cloud Function Compute..."
fun deploy --yes

# Get deployment info
echo "📋 Getting deployment information..."
fun info

echo "✅ Deployment completed successfully!"
echo ""
echo "🔗 Next steps:"
echo "1. Verify that the log project 'matrixai-log-project' and logstore 'fc-invocation-logs' exist in the Alibaba Cloud Log Service console."
echo "   If they don't exist, create them manually in the Log Service console."
echo ""
echo "2. Configure your environment variables in the FC console:"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_ANON_KEY"
echo "   - SUPABASE_SERVICE_KEY"
echo "   - DEEPGRAM_API_URL"
echo "   - DEEPGRAM_API_KEY"
echo "   - DASHSCOPE_API_KEY"
echo "   - DASHSCOPEVIDEO_API_KEY"
echo "   - JWT_SECRET (for authentication)"
echo "   - ANTOM_PRODUCTION (set to true for production)"
echo "   - ANTOM_PRODUCTION_CLIENT_ID"
echo "   - ANTOM_PRODUCTION_PRIVATE_KEY"
echo "   - ANTOM_PRODUCTION_MERCHANT_ID"
echo "   - BASE_URL (your FC trigger URL)"
echo ""
echo "3. Test your deployment:"
echo "   curl https://your-fc-trigger-url/health"
echo "   curl https://your-fc-trigger-url/api/payment/methods"
echo ""
echo "4. Update your frontend to use the new FC trigger URL"
echo ""
echo "5. Refer to PAYMENT_API_README.md for detailed payment API documentation"
echo ""
echo "6. Check API logs in the Alibaba Cloud Log Service console:"
echo "   - Go to Log Service console"
echo "   - Select project 'matrixai-log-project'"
echo "   - Select logstore 'fc-invocation-logs'"
echo "   - Use the query interface to view and analyze API logs"
echo ""
echo "🎉 MatrixAI Server is now running on Alibaba Cloud Function Compute!"

# Verify payment API deployment
echo "\n🔍 Verifying payment API deployment..."
FC_TRIGGER_URL=$(fun info | grep -o 'https://[^ ]*' | head -1)

if [ -n "$FC_TRIGGER_URL" ]; then
  echo "Testing payment methods endpoint: $FC_TRIGGER_URL/api/payment/methods"
  curl -s "$FC_TRIGGER_URL/api/payment/methods" | python3 -m json.tool || echo "Failed to reach payment methods endpoint. Please verify manually."
else
  echo "Could not determine FC trigger URL. Please verify payment API manually."
fi