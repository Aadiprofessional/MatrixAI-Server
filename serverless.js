import serverless from 'serverless-http';
import app from './app.js';
import url from 'url';

// Set up environment variables with fallback configuration
const setupEnvironment = () => {
  const fallbackEnv = {
    ENVIRONMENT: 'production',
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://ixpxvqnbmddxydnmcjwf.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4cHh2cW5ibWRkeHlkbm1jandmIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTc1MzA5NzYsImV4cCI6MjAxMzEwNjk3Nn0.Ib73YYSKQHm9z3MBXKYPBQXcBYZ3_3nF9tG5W0EvB-o',
    DEEPGRAM_API_URL: 'https://api.deepgram.com/v1/listen',
    DEEPGRAM_API_KEY: '4d8f9c5e9e5e9e5e9e5e9e5e9e5e9e5e9e5e9e5e',
    DASHSCOPE_API_KEY: 'sk-1234567890abcdef1234567890abcdef',
    DASHSCOPEVIDEO_API_KEY: 'sk-4d8f9c5e9e5e9e5e9e5e9e5e9e5e9e5e9e5e9e5e',
    DASHSCOPEIMAGE_API_KEY: 'sk-4d8f9c5e9e5e9e5e9e5e9e5e9e5e9e5e9e5e9e5e',
    BASE_URL: 'https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run'
  };

  Object.keys(fallbackEnv).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = fallbackEnv[key];
      console.log(`Setting environment variable ${key} to fallback value`);
    }
  });
};

// This file is now simplified as the main handler logic has been moved to index.js
// We keep this file for compatibility with existing code that might import from it

// Initialize environment before creating the serverless handler
setupEnvironment();

// Wrap the Express app with serverless-http
const serverlessHandler = serverless(app, {
  request: (req, event, context) => {
    // Parse query parameters from the path
    if (req.url && req.url.includes('?')) {
      const parsedUrl = url.parse(req.url, true);
      req.query = parsedUrl.query;
      console.log('Parsed query parameters:', req.query);
    } else if (event.queries) {
      req.query = event.queries;
      console.log('Using event.queries:', req.query);
    }
    
    // Handle request body for POST requests
    if (req.method === 'POST' && event.body) {
      try {
        console.log('Raw event body:', event.body);
        console.log('Event body type:', typeof event.body);
        
        // If the body is a string, try to parse it as JSON
        if (typeof event.body === 'string') {
          req.body = JSON.parse(event.body);
        } else {
          req.body = event.body;
        }
        
        console.log('Parsed request body:', req.body);
      } catch (error) {
        console.error('Error parsing request body:', error);
      }
    }
    
    return req;
  }
});

// Create a handler function for Alibaba Cloud Function Compute
export async function handler(req, resp, context) {
  try {
    console.log('Request path:', req.path);
    console.log('Request method:', req.method);
    console.log('Request queries:', req.queries);
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    
    // Handle request body for Alibaba Cloud Function Compute
    if (req.method === 'POST') {
      try {
        // Check if body exists and parse it if needed
        if (req.body) {
          console.log('Raw request body:', req.body);
          console.log('Request body type:', typeof req.body);
          
          // If the body is a string, try to parse it as JSON
          if (typeof req.body === 'string') {
            try {
              req.bodyJSON = JSON.parse(req.body);
              console.log('Parsed body JSON:', req.bodyJSON);
            } catch (parseError) {
              console.error('Error parsing body as JSON:', parseError);
            }
          } else if (Buffer.isBuffer(req.body)) {
            try {
              const bufferString = req.body.toString('utf8');
              console.log('Buffer as string:', bufferString);
              req.bodyJSON = JSON.parse(bufferString);
              console.log('Parsed buffer JSON:', req.bodyJSON);
            } catch (parseError) {
              console.error('Error parsing buffer as JSON:', parseError);
            }
          } else if (typeof req.body === 'object') {
            req.bodyJSON = req.body;
          }
        }
      } catch (bodyError) {
        console.error('Error processing request body:', bodyError);
      }
    }
    
    // Log environment variables for debugging
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
    console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
    
    // Handle OPTIONS requests directly for CORS preflight
    if (req.method === 'OPTIONS') {
      console.log('Handling OPTIONS preflight request');
      
      // Set CORS headers
      const allowedOrigins = ['http://localhost:3000', 'https://matrixaiglobal.com', 'https://www.matrixaiglobal.com'];
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes(origin)) {
        resp.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        resp.setHeader('Access-Control-Allow-Origin', 'https://matrixaiglobal.com');
      }
      
      resp.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      resp.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      resp.setHeader('Access-Control-Allow-Credentials', 'true');
      resp.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
      
      resp.setStatusCode(204); // No content
      resp.send('');
      return;
    }
    
    // Manually set the query parameters
    if (req.queries) {
      // Create a URL with the query parameters
      const fullUrl = `${req.path}?${Object.entries(req.queries)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')}`;
      
      // Set the URL on the request object
      req.url = fullUrl;
      console.log('Set request URL to:', fullUrl);
      
      // Also set req.query for Express compatibility
      req.query = req.queries;
      console.log('Set req.query to:', req.query);
    }
    
    // Set the parsed body for Express compatibility
    if (req.bodyJSON) {
      req.body = req.bodyJSON;
      console.log('Set req.body to parsed JSON:', req.body);
    }
    
    // Call the serverless handler
    const result = await serverlessHandler(req, context);
    
    // Set the status code
    resp.setStatusCode(result.statusCode);
    
    // Set the headers
    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        if (value !== undefined && key !== undefined) {
          try {
            resp.setHeader(key, value);
          } catch (headerError) {
            console.error(`Error setting header ${key}:`, headerError);
          }
        }
      });
    }
    
    // Ensure CORS headers are set
    const allowedOrigins = ['http://localhost:3000', 'https://matrixaiglobal.com', 'https://www.matrixaiglobal.com'];
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
      resp.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      // Always set a default origin if none matched
      resp.setHeader('Access-Control-Allow-Origin', 'https://matrixaiglobal.com');
    }
    
    // Always set CORS headers (Alibaba Function Compute doesn't have getHeader method)
    resp.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    resp.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    resp.setHeader('Access-Control-Allow-Credentials', 'true');
    resp.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Send the body
    resp.send(result.body);
  } catch (error) {
    console.error('Serverless handler error:', error);
    console.error('Error stack:', error.stack);
    
    // Check if it's a Supabase error
    if (error.message && error.message.includes('Supabase')) {
      console.error('Supabase configuration error detected');
      console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
      console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
    }
    
    resp.setStatusCode(500);
    resp.setHeader('Content-Type', 'application/json');
    resp.send(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
      service: 'MatrixAI Server',
      platform: 'Alibaba Cloud Function Compute'
    }));
  }
}