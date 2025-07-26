#!/bin/bash

# Test script to verify the API key changes in videoRoutes.js

# Set environment variables for testing
export DASHSCOPE_API_KEY="test-dashscope-key"
export DASHSCOPEVIDEO_API_KEY="test-dashscopevideo-key"

# Test case 1: Text-to-Video (should use DASHSCOPEVIDEO_API_KEY)
echo "\nTest Case 1: Text-to-Video (should use DASHSCOPEVIDEO_API_KEY)"
curl -X POST http://localhost:3000/api/video/createVideo \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "test-user",
    "promptText": "A beautiful sunset over the ocean"
  }'

# Test case 2: Image-to-Video (should use DASHSCOPE_API_KEY)
echo "\nTest Case 2: Image-to-Video"
curl -X POST http://localhost:3000/api/video/createVideo \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "test-user",
    "imageUrl": "https://example.com/test-image.jpg"
  }'

# Test case 3: Template with Image (should use DASHSCOPE_API_KEY)
echo "\nTest Case 3: Template with Image"
curl -X POST http://localhost:3000/api/video/createVideo \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "test-user",
    "imageUrl": "https://example.com/test-image.jpg",
    "template": "dance1"
  }'

echo "\nDone testing API key changes."