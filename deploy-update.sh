#!/bin/bash

# Exit on error
set -e

# Display commands being executed
set -x

echo "Updating database schema..."
node update-humanization-table.js

echo "Deploying updated server..."
s deploy

echo "Waiting for deployment to complete..."
sleep 10

echo "Testing updated API..."
node test-updated-humanize-api.js

echo "Deployment and testing complete!"