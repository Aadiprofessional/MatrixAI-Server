#!/bin/bash

# MatrixAI Payment API Test Script
# This script tests the payment API endpoints

set -e

echo "===== MatrixAI Payment API Test Script ====="

# Get the API URL from command line argument or use default
API_URL=${1:-"https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run"}
echo "Using API URL: $API_URL"

# Get JWT token from command line argument
JWT_TOKEN=${2}
if [ -z "$JWT_TOKEN" ]; then
  echo "Warning: No JWT token provided. Authenticated endpoints will fail."
  echo "Usage: ./test_payment_api.sh [API_URL] [JWT_TOKEN]"
  echo "Continuing with unauthenticated tests only..."
fi

# Create a temporary directory for test results
TEST_DIR="payment_api_test_results"
mkdir -p "$TEST_DIR"

echo "\n===== Testing GET /api/payment/methods ====="
echo "This endpoint should return available payment methods"
curl -s "$API_URL/api/payment/methods" | tee "$TEST_DIR/methods.json" | python3 -m json.tool

if [ -n "$JWT_TOKEN" ]; then
  echo "\n===== Testing POST /api/payment/create ====="
  echo "This endpoint should create a new payment transaction"
  curl -s -X POST "$API_URL/api/payment/create" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d '{
      "planId": "your-plan-id",
      "amount": 99.99,
      "currency": "USD",
      "paymentMethodType": "GCASH"
    }' | tee "$TEST_DIR/create_payment.json" | python3 -m json.tool
  
  # Extract payment request ID for further tests
  PAYMENT_REQUEST_ID=$(grep -o '"paymentRequestId":"[^"]*"' "$TEST_DIR/create_payment.json" | cut -d '"' -f 4)
  
  if [ -n "$PAYMENT_REQUEST_ID" ]; then
    echo "\nPayment Request ID: $PAYMENT_REQUEST_ID"
    
    echo "\n===== Testing GET /api/payment/status/$PAYMENT_REQUEST_ID ====="
    echo "This endpoint should return the status of the payment"
    curl -s "$API_URL/api/payment/status/$PAYMENT_REQUEST_ID" \
      -H "Authorization: Bearer $JWT_TOKEN" | tee "$TEST_DIR/payment_status.json" | python3 -m json.tool
    
    echo "\n===== Testing POST /api/payment/cancel/$PAYMENT_REQUEST_ID ====="
    echo "This endpoint should cancel the payment"
    curl -s -X POST "$API_URL/api/payment/cancel/$PAYMENT_REQUEST_ID" \
      -H "Authorization: Bearer $JWT_TOKEN" | tee "$TEST_DIR/cancel_payment.json" | python3 -m json.tool
  else
    echo "\nNo payment request ID found in the response. Skipping status and cancel tests."
  fi
  
  echo "\n===== Testing GET /api/payment/history ====="
  echo "This endpoint should return the payment history"
  curl -s "$API_URL/api/payment/history?page=1&limit=10" \
    -H "Authorization: Bearer $JWT_TOKEN" | tee "$TEST_DIR/payment_history.json" | python3 -m json.tool
fi

echo "\n===== Test Results ====="
echo "Test results saved to $TEST_DIR directory"
echo "Available endpoints:"
echo "✓ GET  $API_URL/api/payment/methods"
echo "✓ POST $API_URL/api/payment/create (requires authentication)"
echo "✓ GET  $API_URL/api/payment/status/:paymentRequestId (requires authentication)"
echo "✓ POST $API_URL/api/payment/cancel/:paymentRequestId (requires authentication)"
echo "✓ POST $API_URL/api/payment/notify (webhook, not tested)"
echo "✓ GET  $API_URL/api/payment/history (requires authentication)"

echo "\n===== Test Completed ====="
echo "For detailed API documentation, refer to PAYMENT_API_README.md"