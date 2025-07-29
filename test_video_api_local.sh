#!/bin/bash

# Test script for video API with local server

# Use a valid UUID format for testing
TEST_UID="dffd4ff8-ad8a-4f8f-b84d-cdb252dc3826"
IMAGE_PATH="/Users/aadisrivastava/Downloads/IMG_0893.jpg"
LOCAL_URL="http://localhost:3002"

echo "\n🧪 Testing Image-to-Video with Template (flying)\n"
curl -X POST \
  -F "uid=$TEST_UID" \
  -F "template=flying" \
  -F "image=@$IMAGE_PATH" \
  "$LOCAL_URL/api/video/createVideo"

echo "\n\n🧪 Testing Image-to-Video (no template)\n"
curl -X POST \
  -F "uid=$TEST_UID" \
  -F "image=@$IMAGE_PATH" \
  "$LOCAL_URL/api/video/createVideo"

echo "\n\n🧪 Testing Text-to-Video\n"
curl -X POST \
  -F "uid=$TEST_UID" \
  -F "promptText=A beautiful sunset over the ocean" \
  "$LOCAL_URL/api/video/createVideo"

echo "\n\n🧪 Testing Video History\n"
curl -X GET "$LOCAL_URL/api/video/getVideoHistory?uid=$TEST_UID"

echo "\n"