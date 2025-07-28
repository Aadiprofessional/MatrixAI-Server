#!/bin/bash

# Test script for Video API endpoints

# Set your base URL and test UID
BASE_URL="http://localhost:3000/api/video"
TEST_UID="your-test-uid-here"

# Colors for output
GREEN="\033[0;32m"
RED="\033[0;31m"
NC="\033[0m" # No Color

echo -e "${GREEN}Testing Video API Endpoints${NC}"
echo "=========================="

# Test 1: Get Video History
echo -e "\n${GREEN}Test 1: Get Video History${NC}"
echo "Command: curl -X GET '$BASE_URL/getVideoHistory?uid=$TEST_UID&page=1&itemsPerPage=10'"
echo "Expected result: List of videos with pagination"

# Test 2: Create Video from Prompt
echo -e "\n${GREEN}Test 2: Create Video from Prompt${NC}"
echo "Command: curl -X POST '$BASE_URL/createVideo' \
  -H 'Content-Type: application/json' \
  -d '{
    "uid": "$TEST_UID",
    "promptText": "A beautiful sunset over the ocean with waves crashing on the shore",
    "size": "720P"
  }'"
echo "Expected result: Video generation started with task ID"

# Test 3: Create Video from Image URL
echo -e "\n${GREEN}Test 3: Create Video from Image URL${NC}"
echo "Command: curl -X POST '$BASE_URL/createVideo' \
  -H 'Content-Type: application/json' \
  -d '{
    "uid": "$TEST_UID",
    "promptText": "Transform this image into a dynamic video",
    "imageUrl": "https://example.com/your-image.jpg"
  }'"
echo "Expected result: Video generation started with task ID"

# Test 4: Create Video with Template
echo -e "\n${GREEN}Test 4: Create Video with Template${NC}"
echo "Command: curl -X POST '$BASE_URL/createVideo' \
  -H 'Content-Type: application/json' \
  -d '{
    "uid": "$TEST_UID",
    "promptText": "Make this image fly",
    "imageUrl": "https://example.com/your-image.jpg",
    "template": "flying"
  }'"
echo "Expected result: Video generation started with task ID"

# Test 5: Create Premium Template Video
echo -e "\n${GREEN}Test 5: Create Premium Template Video${NC}"
echo "Command: curl -X POST '$BASE_URL/createVideo' \
  -H 'Content-Type: application/json' \
  -d '{
    "uid": "$TEST_UID",
    "promptText": "Make this image dance",
    "imageUrl": "https://example.com/your-image.jpg",
    "template": "dance1"
  }'"
echo "Expected result: Video generation started with task ID (55 coins deducted)"

# Test 6: Get Video Status
echo -e "\n${GREEN}Test 6: Get Video Status${NC}"
echo "Command: curl -X GET '$BASE_URL/getVideoStatus?uid=$TEST_UID&videoId=your-video-id-here'"
echo "Expected result: Current status of the video generation process"

# Test 7: Remove Video
echo -e "\n${GREEN}Test 7: Remove Video${NC}"
echo "Command: curl -X POST '$BASE_URL/removeVideo' \
  -H 'Content-Type: application/json' \
  -d '{
    "uid": "$TEST_UID",
    "videoId": "your-video-id-here"
  }'"
echo "Expected result: Video deleted successfully"

# Test 8: Upload Image and Create Video (using form data)
echo -e "\n${GREEN}Test 8: Upload Image and Create Video (using form data)${NC}"
echo "Command: curl -X POST '$BASE_URL/createVideo' \
  -F 'uid=$TEST_UID' \
  -F 'promptText=Transform this uploaded image into a video' \
  -F 'file=@/path/to/your/image.jpg'"
echo "Expected result: Video generation started with task ID"

echo -e "\n${GREEN}Testing Complete${NC}"
echo "=========================="
echo "Note: Replace 'your-test-uid-here' and 'your-video-id-here' with actual values before running the tests."
echo "Also, replace 'http://localhost:3000', 'https://matrix-4hv.pages.dev' with your actual API base URL."