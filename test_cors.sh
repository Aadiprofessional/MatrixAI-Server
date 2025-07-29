#!/bin/bash

# Test script for CORS fixes
# This script tests both local and production endpoints for CORS issues

echo "===== Testing CORS Fixes ====="

# Function to test an endpoint
test_endpoint() {
  local endpoint=$1
  local origin=$2
  local description=$3
  
  echo "\n----- Testing $description -----"
  echo "Endpoint: $endpoint"
  echo "Origin: $origin"
  
  echo "\n1. Testing OPTIONS preflight request:"
  curl -s -o /dev/null -w "Status: %{http_code}\n" -X OPTIONS \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: GET" \
    "$endpoint"
    
  echo "\nHeaders:"
  curl -s -I -X OPTIONS \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: GET" \
    "$endpoint" | grep -i "access-control"
  
  echo "\n2. Testing actual GET request:"
  curl -s -o /dev/null -w "Status: %{http_code}\n" -X GET \
    -H "Origin: $origin" \
    "$endpoint"
    
  echo "\nHeaders:"
  curl -s -I -X GET \
    -H "Origin: $origin" \
    "$endpoint" | grep -i "access-control"
}

# Test local server
if [[ $(lsof -i:3002 -sTCP:LISTEN -t) ]]; then
  test_endpoint "http://localhost:3002/api/video/getVideoHistory?uid=test123" "http://localhost:3001" "Local Server"
else
  echo "\n----- Local server not running on port 3002 -----"
  echo "Start the local server with: node local-server-cors.js"
fi

# Test production server
test_endpoint "https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run/api/admin/fetchUserInfoAdmin" "http://localhost:3001" "Production Server"

echo "\n===== CORS Testing Complete ====="
echo "Check for duplicate Access-Control headers in the responses above."
echo "If you see duplicate headers, the CORS fix has not been applied correctly."