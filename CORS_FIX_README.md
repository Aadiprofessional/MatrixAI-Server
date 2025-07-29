# CORS Fix Documentation

## Overview

This document outlines the changes made to fix CORS (Cross-Origin Resource Sharing) issues in the MatrixAI Server application. The main issue was duplicate CORS headers being set in multiple places throughout the codebase, which could cause problems with browser requests.

## Files Modified

### 1. handler.js

Changes made:
- Added a method to prevent duplicate headers when setting them
- Overrode the `setHeader` method to check for existing CORS headers before setting new ones
- Improved the `corsHeadersSet` flag to prevent duplicate CORS headers across different handlers

### 2. index.js

Changes made:
- Moved the CORS header clearing logic inside the conditional check
- Only clears and sets CORS headers if they haven't been set in handler.js

### 3. serverless.js

Changes made:
- Updated the CORS header check to also consider the `corsHeadersSet` flag
- Prevents setting CORS headers if they've already been set in handler.js or index.js

## Testing

To test the CORS fixes:

1. Local testing:
   ```bash
   node local-server-cors.js
   ```

2. Test with curl:
   ```bash
   # Test OPTIONS preflight request
   curl -X OPTIONS -H "Origin: http://localhost:3001" -H "Access-Control-Request-Method: GET" http://localhost:3002/api/video/getVideoHistory -v
   
   # Test actual GET request
   curl -X GET -H "Origin: http://localhost:3001" http://localhost:3002/api/video/getVideoHistory?uid=test123 -v
   ```

3. Production testing:
   ```bash
   # Test OPTIONS preflight request
   curl -X OPTIONS -H "Origin: http://localhost:3001" -H "Access-Control-Request-Method: GET" https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run/api/admin/fetchUserInfoAdmin -v
   
   # Test actual GET request
   curl -X GET -H "Origin: http://localhost:3001" https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run/api/admin/fetchUserInfoAdmin -v
   ```

## Deployment

To deploy these changes to production, run the deployment script:

```bash
./deploy.sh
```

This will deploy the updated code to Alibaba Cloud Function Compute.

## Troubleshooting

If CORS issues persist after deployment:

1. Check the response headers to see if duplicate CORS headers are still present
2. Verify that all three files (handler.js, index.js, serverless.js) were properly updated
3. Make sure the deployment was successful
4. Check the browser console for any CORS-related errors