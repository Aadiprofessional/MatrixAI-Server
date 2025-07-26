#!/bin/bash

# Test script for the updated video API with direct file upload

# Set your test variables here
API_URL="http://localhost:3000/api/video"
TEST_UID="test-user-123"
TEST_IMAGE="./test-image.jpg"

echo "\n=== Testing Video API with Direct File Upload ==="

# Test 1: Create video from uploaded image (no template)
echo "\n1. Testing createVideo with direct image upload (no template):"
curl -X POST \
  -F "uid=${TEST_UID}" \
  -F "promptText=A beautiful landscape" \
  -F "image=@${TEST_IMAGE}" \
  "${API_URL}/createVideo"

# Test 2: Create video from uploaded image with template
echo "\n\n2. Testing createVideo with direct image upload and template:"
curl -X POST \
  -F "uid=${TEST_UID}" \
  -F "template=dance1" \
  -F "image=@${TEST_IMAGE}" \
  "${API_URL}/createVideo"

# Test 3: Create video from prompt only
echo "\n\n3. Testing createVideo with prompt only:"
curl -X POST \
  -F "uid=${TEST_UID}" \
  -F "promptText=A futuristic city with flying cars" \
  "${API_URL}/createVideo"

# Test 4: Get video history
echo "\n\n4. Testing getVideoHistory:"
curl -X GET "${API_URL}/getVideoHistory?uid=${TEST_UID}"

# Test 5: Remove video (replace VIDEO_ID with an actual ID from your database)
echo "\n\n5. Testing removeVideo (update VIDEO_ID before running):"
# curl -X POST -F "uid=${TEST_UID}" -F "videoId=VIDEO_ID" "${API_URL}/removeVideo"

echo "\n\nTests completed."