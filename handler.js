import app from './app.js';

// Function Compute handler for Alibaba Cloud
export const handler = async (req, resp, context) => {
  console.log('Function Compute request received:', req.path);
  console.log('Request method:', req.method);
  console.log('Request headers:', req.headers);
  console.log('Request body type:', typeof req.body);
  if (req.body) {
    console.log('Request body is Buffer:', Buffer.isBuffer(req.body));
  }
  
  try {
    // Helper function to parse request body
    function parseBody(body) {
      if (!body) return {};
      
      try {
        // Handle Buffer objects from Function Compute
        if (Buffer.isBuffer(body)) {
          const bufferString = body.toString('utf8');
          console.log('Body as string:', bufferString);
          try {
            return JSON.parse(bufferString);
          } catch (e) {
            console.log('Body is not JSON, treating as string');
            return bufferString;
          }
        }
        // Handle string body
        else if (typeof body === 'string' && body.trim()) {
          try {
            return JSON.parse(body);
          } catch (e) {
            console.log('Body is not JSON, treating as string');
            return body;
          }
        }
        // Handle object body
        else if (typeof body === 'object') {
          return body;
        }
      } catch (parseError) {
        console.error('Error parsing body:', parseError);
        return {};
      }
      
      return {};
    }
    
    // Parse the request body, prioritizing parsedBody from index.js if available
    let parsedBody;
    if (req.parsedBody) {
      console.log('Using parsedBody from index.js');
      parsedBody = req.parsedBody;
    } else {
      parsedBody = parseBody(req.body);
      console.log('Using handler parsed body:', parsedBody);
    }
    
    // Create a mock Express request object
    const expressReq = {
      method: req.method,
      url: req.path,
      path: req.path,
      headers: req.headers,
      body: parsedBody,
      rawBody: req.body,
      bodyJSON: parsedBody, // Add bodyJSON for compatibility with serverless.js
      parsedBody: parsedBody, // Add parsedBody for compatibility with index.js
      query: req.queries || {},
      params: {},
      originalUrl: req.path
    };
    
    // Log the request object for debugging
    console.log('Express request body:', expressReq.body);
    console.log('Express request bodyJSON:', expressReq.bodyJSON);
    console.log('Express request parsedBody:', expressReq.parsedBody);
    
    // Create a mock Express response object
    const expressRes = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: null,
      headersSent: false,
      
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      
      setHeader: function(name, value) {
        this.headers[name] = value;
        return this;
      },
      
      set: function(name, value) {
        if (typeof name === 'object') {
          for (const key in name) {
            this.headers[key] = name[key];
          }
        } else {
          this.headers[name] = value;
        }
        return this;
      },
      
      get: function(name) {
        return this.headers[name];
      },
      
      getHeader: function(name) {
        return this.headers[name];
      },
      
      removeHeader: function(name) {
        delete this.headers[name];
        return this;
      },
      
      vary: function(field) {
        // Safely handle the vary header
        try {
          const current = this.getHeader('Vary') || '';
          const fields = Array.isArray(field) ? field : [field];
          
          // If there's no current Vary header, just set it
          if (!current) {
            this.setHeader('Vary', fields.join(', '));
            return this;
          }
          
          // Otherwise, append to it
          const values = current.split(',').map(value => value.trim());
          fields.forEach(field => {
            if (!values.includes(field)) {
              values.push(field);
            }
          });
          
          this.setHeader('Vary', values.join(', '));
          return this;
        } catch (error) {
          console.error('Error handling vary header:', error);
          return this;
        }
      },
      
      send: function(body) {
        this.body = body;
        
        // Send the response back to Function Compute
        resp.setStatusCode(this.statusCode);
        
        // Set headers
        for (const key in this.headers) {
          resp.setHeader(key, this.headers[key]);
        }
        
        // Send body
        if (body === null || body === undefined) {
          resp.send('');
        } else if (typeof body === 'string') {
          resp.send(body);
        } else if (Buffer.isBuffer(body)) {
          resp.send(body);
        } else if (typeof body === 'object') {
          resp.setHeader('Content-Type', 'application/json');
          resp.send(JSON.stringify(body));
        } else {
          resp.send(String(body));
        }
        
        return this;
      },
      
      json: function(body) {
        this.setHeader('Content-Type', 'application/json');
        return this.send(body);
      },
      
      end: function(data) {
        return this.send(data || '');
      },
      
      // Additional Express response methods
      redirect: function(status, url) {
        if (typeof status === 'string') {
          url = status;
          status = 302;
        }
        this.status(status);
        this.setHeader('Location', url);
        this.send();
        return this;
      },
      
      type: function(type) {
        this.setHeader('Content-Type', type);
        return this;
      },
      
      attachment: function(filename) {
        if (filename) {
          this.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        } else {
          this.setHeader('Content-Disposition', 'attachment');
        }
        return this;
      }
    };
    
    // Add Express-like properties
    expressReq.res = expressRes;
    expressRes.req = expressReq;
    
    // Set default CORS headers
    const allowedOrigins = ['http://localhost:3000', 'https://matrixaiglobal.com', 'https://www.matrixaiglobal.com'];
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
      expressRes.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      expressRes.setHeader('Access-Control-Allow-Origin', 'https://matrixaiglobal.com');
    }
    
    expressRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    expressRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    expressRes.setHeader('Access-Control-Allow-Credentials', 'true');
    expressRes.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
      resp.setStatusCode(204); // No content
      
      // Set CORS headers for preflight response
      if (allowedOrigins.includes(origin)) {
        resp.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        resp.setHeader('Access-Control-Allow-Origin', 'https://matrixaiglobal.com');
      }
      
      resp.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      resp.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      resp.setHeader('Access-Control-Allow-Credentials', 'true');
      resp.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
      
      resp.send('');
      return;
    }
    
    // Handle the request with the Express app
    app(expressReq, expressRes);
    
  } catch (error) {
    console.error('Handler error:', error);
    resp.setStatusCode(500);
    resp.setHeader('Content-Type', 'application/json');
    resp.send(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
      service: 'MatrixAI Server',
      platform: 'Alibaba Cloud Function Compute',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }));
  }
}