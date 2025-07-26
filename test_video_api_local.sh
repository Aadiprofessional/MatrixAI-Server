#!/bin/bash

# Test script for video API with local server

UID="0a147ebe-af99-481b-bcaf-ae70c9aeb8d8"
IMAGE_PATH="/Users/aadisrivastava/Downloads/IMG_0893.jpg"
LOCAL_URL="http://localhost:3002"

echo "\n🧪 Testing Image-to-Video with Template (flying)\n"
curl -X POST \
  -F "uid=$UID" \
  -F "template=flying" \
  -F "image=@$IMAGE_PATH" \
  "$LOCAL_URL/api/video/createVideo"

echo "\n\n🧪 Testing Image-to-Video (no template)\n"
curl -X POST \
  -F "uid=$UID" \
  -F "image=@$IMAGE_PATH" \
  "$LOCAL_URL/api/video/createVideo"

echo "\n\n🧪 Testing Text-to-Video\n"
curl -X POST \
  -F "uid=$UID" \
  -F "promptText=A beautiful sunset over the ocean" \
  "$LOCAL_URL/api/video/createVideo"

echo "\n\n🧪 Testing Video History\n"
curl -X GET "$LOCAL_URL/api/video/getVideoHistory?uid=$UID"

echo "\n"