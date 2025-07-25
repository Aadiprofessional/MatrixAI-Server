#!/bin/bash

# Test script for Content Writer API using curl

# Configuration
API_BASE_URL="https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run/api/content"
TEST_USER_ID="0a147ebe-af99-481b-bcaf-ae70c9aeb8d8" # Replace with a valid test user ID

# Colors for output
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
NC="\033[0m" # No Color

echo -e "${YELLOW}Starting Content Writer API tests...${NC}"
echo -e "API Base URL: ${API_BASE_URL}"
echo -e "Test User ID: ${TEST_USER_ID}"

# 1. Test saveContent endpoint
echo -e "\n${YELLOW}=== Testing saveContent API ===${NC}"
SAVE_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/saveContent" \
  -H "Content-Type: application/json" \
  -d "{\
    \"uid\": \"${TEST_USER_ID}\",\
    \"prompt\": \"Write a blog post about artificial intelligence\",\
    \"content\": \"Artificial Intelligence (AI) is transforming our world in unprecedented ways. From self-driving cars to virtual assistants, AI technologies are becoming increasingly integrated into our daily lives. This blog post explores the current state of AI, its applications, and the ethical considerations surrounding its development and deployment.\",\
    \"title\": \"The Rise of Artificial Intelligence\",\
    \"tags\": [\"AI\", \"Technology\", \"Future\"],\
    \"content_type\": \"blog\",\
    \"tone\": \"professional\",\
    \"language\": \"en\"\
  }")

echo "Response: $SAVE_RESPONSE"

# Extract content ID from the response
CONTENT_ID=$(echo $SAVE_RESPONSE | grep -o '"id":"[^"]*"' | cut -d '"' -f 4)

if [ -n "$CONTENT_ID" ]; then
  echo -e "${GREEN}✅ saveContent API test passed${NC}"
  echo "Content ID: $CONTENT_ID"
else
  echo -e "${RED}❌ saveContent API test failed${NC}"
  exit 1
fi

# 2. Test getUserContent endpoint
echo -e "\n${YELLOW}=== Testing getUserContent API ===${NC}"
GET_USER_CONTENT_RESPONSE=$(curl -s "${API_BASE_URL}/getUserContent?uid=${TEST_USER_ID}")

echo "Response: $GET_USER_CONTENT_RESPONSE"

if [[ $GET_USER_CONTENT_RESPONSE == *"content"* ]]; then
  echo -e "${GREEN}✅ getUserContent API test passed${NC}"
else
  echo -e "${RED}❌ getUserContent API test failed${NC}"
fi

# 3. Test getUserContent with filters
echo -e "\n${YELLOW}=== Testing getUserContent API with filters ===${NC}"
GET_USER_CONTENT_FILTERED_RESPONSE=$(curl -s "${API_BASE_URL}/getUserContent?uid=${TEST_USER_ID}&contentType=blog&searchQuery=artificial")

echo "Response: $GET_USER_CONTENT_FILTERED_RESPONSE"

if [[ $GET_USER_CONTENT_FILTERED_RESPONSE == *"content"* ]]; then
  echo -e "${GREEN}✅ getUserContent API with filters test passed${NC}"
else
  echo -e "${RED}❌ getUserContent API with filters test failed${NC}"
fi

# 4. Test getContent endpoint
echo -e "\n${YELLOW}=== Testing getContent API ===${NC}"
GET_CONTENT_RESPONSE=$(curl -s "${API_BASE_URL}/getContent?uid=${TEST_USER_ID}&contentId=${CONTENT_ID}")

echo "Response: $GET_CONTENT_RESPONSE"

if [[ $GET_CONTENT_RESPONSE == *"content"* ]]; then
  echo -e "${GREEN}✅ getContent API test passed${NC}"
else
  echo -e "${RED}❌ getContent API test failed${NC}"
fi

# 5. Test downloadContent endpoint (txt format)
echo -e "\n${YELLOW}=== Testing downloadContent API (txt format) ===${NC}"
DOWNLOAD_RESPONSE=$(curl -s "${API_BASE_URL}/downloadContent/${CONTENT_ID}?uid=${TEST_USER_ID}&format=txt")

echo "Response: $DOWNLOAD_RESPONSE"

if [[ $DOWNLOAD_RESPONSE == *"Artificial Intelligence"* ]]; then
  echo -e "${GREEN}✅ downloadContent API (txt format) test passed${NC}"
else
  echo -e "${RED}❌ downloadContent API (txt format) test failed${NC}"
fi

# 6. Test shareContent endpoint
echo -e "\n${YELLOW}=== Testing shareContent API ===${NC}"
SHARE_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/shareContent" \
  -H "Content-Type: application/json" \
  -d "{\
    \"uid\": \"${TEST_USER_ID}\",\
    \"contentId\": \"${CONTENT_ID}\"\
  }")

echo "Response: $SHARE_RESPONSE"

# Extract share ID from the response
SHARE_ID=$(echo $SHARE_RESPONSE | grep -o '"shareId":"[^"]*"' | cut -d '"' -f 4)

if [ -n "$SHARE_ID" ]; then
  echo -e "${GREEN}✅ shareContent API test passed${NC}"
  echo "Share ID: $SHARE_ID"
else
  echo -e "${RED}❌ shareContent API test failed${NC}"
fi

# 7. Test shared content endpoint
echo -e "\n${YELLOW}=== Testing shared content API ===${NC}"
SHARED_CONTENT_RESPONSE=$(curl -s "${API_BASE_URL}/shared/${SHARE_ID}")

echo "Response: $SHARED_CONTENT_RESPONSE"

if [[ $SHARED_CONTENT_RESPONSE == *"content"* ]]; then
  echo -e "${GREEN}✅ shared content API test passed${NC}"
else
  echo -e "${RED}❌ shared content API test failed${NC}"
fi

# 8. Test deleteContent endpoint
echo -e "\n${YELLOW}=== Testing deleteContent API ===${NC}"
DELETE_RESPONSE=$(curl -s -X DELETE "${API_BASE_URL}/deleteContent" \
  -H "Content-Type: application/json" \
  -d "{\
    \"uid\": \"${TEST_USER_ID}\",\
    \"contentId\": \"${CONTENT_ID}\"\
  }")

echo "Response: $DELETE_RESPONSE"

if [[ $DELETE_RESPONSE == *"deleted successfully"* ]]; then
  echo -e "${GREEN}✅ deleteContent API test passed${NC}"
else
  echo -e "${RED}❌ deleteContent API test failed${NC}"
fi

echo -e "\n${GREEN}=== All tests completed ===${NC}"