#!/bin/bash

# Test script for the video API with a specific image and UID

# Set variables
SYSTEM_URL="https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run"
TEST_UID="0a147ebe-af99-481b-bcaf-ae70c9aeb8d8"
TEST_IMAGE="/Users/aadisrivastava/Downloads/IMG_0893.jpg"

echo "\n=== Testing Video API with Specific Image and UID ==="

# Test 1: Create video from uploaded image (no template)
echo "\n1. Testing createVideo with direct image upload (no template):"
curl -X POST \
  -F "uid=${TEST_UID}" \
  -F "promptText=A beautiful scene" \
  -F "image=@${TEST_IMAGE}" \
  "${SYSTEM_URL}/api/video/createVideo"

# Test 2: Create video from uploaded image with template
echo "\n\n2. Testing createVideo with direct image upload and template:"
curl -X POST \
  -F "uid=${TEST_UID}" \
  -F "template=dance1" \
  -F "image=@${TEST_IMAGE}" \
  "${SYSTEM_URL}/api/video/createVideo"

# Test 3: Create video from uploaded image with premium template
echo "\n\n3. Testing createVideo with direct image upload and premium template:"
curl -X POST \
  -F "uid=${TEST_UID}" \
  -F "template=mermaid" \
  -F "image=@${TEST_IMAGE}" \
  "${SYSTEM_URL}/api/video/createVideo"

# Test 4: Create video from prompt only
echo "\n\n4. Testing createVideo with prompt only:"
curl -X POST \
  -F "uid=${TEST_UID}" \
  -F "promptText=A futuristic city with flying cars" \
  "${SYSTEM_URL}/api/video/createVideo"

# Test 5: Get video history
echo "\n\n5. Testing getVideoHistory:"
curl -X GET "${SYSTEM_URL}/api/video/getVideoHistory?uid=${TEST_UID}"

# Test 6: Get video status (replace VIDEO_ID with an actual ID from your database)
echo "\n\n6. Testing getVideoStatus (update VIDEO_ID before running):"
# curl -X GET "${SYSTEM_URL}/api/video/getVideoStatus?uid=${TEST_UID}&videoId=VIDEO_ID"

# Test 7: Remove video (replace VIDEO_ID with an actual ID from your database)
echo "\n\n7. Testing removeVideo (update VIDEO_ID before running):"
# curl -X POST -F "uid=${TEST_UID}" -F "videoId=VIDEO_ID" "${SYSTEM_URL}/api/video/removeVideo"

echo "\n\nTests completed. Check the responses for video IDs to use in the commented-out tests."