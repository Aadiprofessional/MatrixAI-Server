// Import app and Readable stream for request handling
const app = require('./src/app.js');
const { Readable } = require('stream');

// HTTP handler for Alibaba Cloud Function Compute
const handler = (req, resp, context) => {
  console.log('HTTP Handler called');
  console.log('Request method:', req.method);
  console.log('Request path:', req.path);
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Request body type:', typeof req.body);
  
  try {
    // Parse JSON body if present - handle Buffer objects
    let parsedBody = {};
    let bodyString = '';
    
    if (req.body) {
      if (Buffer.isBuffer(req.body)) {
        // Convert Buffer to string first
        bodyString = req.body.toString('utf8');
        console.log('Body as string:', bodyString);
        try {
          parsedBody = JSON.parse(bodyString);
          console.log('Parsed body:', parsedBody);
        } catch (e) {
          console.log('Body is not JSON, treating as string');
          parsedBody = bodyString;
        }
      } else if (typeof req.body === 'string') {
        bodyString = req.body;
        try {
          parsedBody = JSON.parse(req.body);
          console.log('Parsed body:', parsedBody);
        } catch (e) {
          console.log('Body is not JSON, treating as string');
          parsedBody = req.body;
        }
      } else if (typeof req.body === 'object') {
        parsedBody = req.body;
        bodyString = JSON.stringify(req.body);
        console.log('Using object body directly:', parsedBody);
      }
    }
    
    // Create a mock request object that looks like Express request
    const expressReq = {
      method: req.method,
      url: req.path,
      headers: req.headers,
      body: parsedBody,
      parsedBody: parsedBody,  // Add for compatibility with existing code
      bodyJSON: parsedBody,    // Add for compatibility with existing code
      rawBody: req.body,
      query: req.queries || {},
      params: {},
      path: req.path,
      originalUrl: req.path,
      baseUrl: '',
      hostname: req.headers.host || 'localhost',
      protocol: 'https',
      secure: true,
      ip: req.clientIP || '127.0.0.1',
      
      // Stream-like properties for body parsing middleware
      readable: true,
      readableEnded: false,
      readableListening: false,
      readableFlowing: null,
      destroyed: false,
      complete: false,
      
      // Create internal readable stream for body parsing
      _bodyStream: new Readable({
        read() {
          this.push(bodyString);
          this.push(null);
        }
      }),
      
      // Stream methods that delegate to internal stream
      pipe: function(destination, options) {
        return this._bodyStream.pipe(destination, options);
      },
      
      unpipe: function(destination) {
        return this._bodyStream.unpipe(destination);
      },
      
      on: function(event, listener) {
        this._bodyStream.on(event, listener);
        return this;
      },
      
      once: function(event, listener) {
        this._bodyStream.once(event, listener);
        return this;
      },
      
      removeListener: function(event, listener) {
        this._bodyStream.removeListener(event, listener);
        return this;
      },
      
      emit: function(event, ...args) {
        return this._bodyStream.emit(event, ...args);
      },
      
      read: function(size) {
        return this._bodyStream.read(size);
      },
      
      pause: function() {
        this._bodyStream.pause();
        return this;
      },
      
      resume: function() {
        this._bodyStream.resume();
        return this;
      },
      
      destroy: function(error) {
        this._bodyStream.destroy(error);
        this.destroyed = true;
        return this;
      },
      
      // Express request methods
      get: function(name) {
        return this.headers[name.toLowerCase()];
      },
      
      header: function(name) {
        return this.get(name);
      },
      
      accepts: function() { return false; },
      acceptsCharsets: function() { return false; },
      acceptsEncodings: function() { return false; },
      acceptsLanguages: function() { return false; },
      is: function() { return false; },
      
      // Add query string to URL if present
      param: function(name) {
        return this.params[name] || this.query[name] || this.body[name];
      },
      
      range: function() { return undefined; }
    };
    
    // Add query string to URL if present
    if (req.queries && Object.keys(req.queries).length > 0) {
      const queryString = new URLSearchParams(req.queries).toString();
      expressReq.url = `${req.path}?${queryString}`;
      expressReq.originalUrl = expressReq.url;
    }
    
    // Set up response object that's compatible with Express response
    const expressRes = {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
      body: '',
      locals: {},
      headersSent: false,
      finished: false,
      writable: true,
      writableEnded: false,
      app: app,
      _headers: {}, // Internal headers storage
      
      // Express response methods
      status: function(code) {
        this.statusCode = code;
        resp.setStatusCode(code);
        return this;
      },
      
      json: function(data) {
        this.body = JSON.stringify(data);
        this.setHeader('Content-Type', 'application/json');
        this.end();
        return this;
      },
      
      send: function(data) {
        if (typeof data === 'object' && data !== null) {
          this.body = JSON.stringify(data);
          this.setHeader('Content-Type', 'application/json');
        } else {
          this.body = String(data);
        }
        this.end();
        return this;
      },
      
      // Header methods
      setHeader: function(name, value) {
        if (name !== undefined && value !== undefined) {
          try {
            this._headers[name.toLowerCase()] = value;
            this.headers[name.toLowerCase()] = value;
            resp.setHeader(name, value);
          } catch (error) {
            console.error(`Error setting header ${name}:`, error);
          }
        }
        return this;
      },
      
      getHeader: function(name) {
        return this._headers[name.toLowerCase()];
      },
      
      // Express aliases
      set: function(name, value) {
        return this.setHeader(name, value);
      },
      
      // CORS-specific methods
      vary: function(field) {
        try {
          const current = this.getHeader('vary');
          if (current) {
            if (current.indexOf(field) === -1) {
              this.setHeader('vary', current + ', ' + field);
            }
          } else {
            this.setHeader('vary', field);
          }
        } catch (error) {
          console.error('Error in vary method:', error);
        }
        return this;
      },
      
      end: function(data) {
        if (data) {
          this.body += data;
        }
        this.finished = true;
        this.headersSent = true;
        this.writableEnded = true;
        
        // Set all headers
        Object.keys(this._headers).forEach(key => {
          if (key !== undefined && this._headers[key] !== undefined) {
            try {
              resp.setHeader(key, this._headers[key]);
            } catch (error) {
              console.error(`Error setting header ${key}:`, error);
            }
          }
        });
        
        // Set CORS headers directly on the headers object
        this._headers = this._headers || {};
        
        // Only set CORS headers if they haven't been set in handler.js
        if (!req.corsHeadersSet) {
          // Clear any existing CORS headers
          Object.keys(this._headers).forEach(key => {
            if (key.toLowerCase().startsWith('access-control-')) {
              delete this._headers[key];
            }
          });
          
          // Now set the CORS headers once
          const allowedOrigins = ['http://localhost:3000', 'https://matrix-4hv.pages.dev', 'http://localhost:3001', 'https://matrixaiglobal.com', 'https://www.matrixaiglobal.com', 'https://matrixai.asia'];
          const origin = req.headers.origin;
          
          if (allowedOrigins.includes(origin)) {
            this._headers['Access-Control-Allow-Origin'] = origin;
          } else {
            // Always set a default origin if none matched
            this._headers['Access-Control-Allow-Origin'] = 'https://matrix-4hv.pages.dev';
          }
          
          this._headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
          this._headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, X-API-Key';
          this._headers['Access-Control-Allow-Credentials'] = 'true';
          this._headers['Access-Control-Max-Age'] = '86400'; // 24 hours
          
          // Mark that we've set CORS headers
          req.corsHeadersSet = true;
        }
        
        resp.send(this.body || '');
        return this;
      }
    };
    
    // Handle OPTIONS requests for CORS preflight
    if (req.method === 'OPTIONS') {
      expressRes.status(200);
      
      // Only set CORS headers if they haven't been set in handler.js
      if (!req.corsHeadersSet) {
        // Set CORS headers directly on the headers object
        expressRes.headers = expressRes.headers || {};
        
        // Clear any existing CORS headers
        Object.keys(expressRes.headers).forEach(key => {
          if (key.toLowerCase().startsWith('access-control-')) {
            delete expressRes.headers[key];
          }
        });
        
        // Now set the CORS headers once
        const allowedOrigins = ['http://localhost:3000', 'https://matrix-4hv.pages.dev','http://localhost:3001', 'https://matrixaiglobal.com', 'https://www.matrixaiglobal.com', 'https://matrixai.asia'];
        const origin = req.headers.origin;
        
        if (allowedOrigins.includes(origin)) {
          expressRes.headers['Access-Control-Allow-Origin'] = origin;
        } else {
          // Always set a default origin if none matched
          expressRes.headers['Access-Control-Allow-Origin'] = 'https://matrix-4hv.pages.dev';
        }
        
        expressRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        expressRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, X-API-Key';
        expressRes.headers['Access-Control-Allow-Credentials'] = 'true';
        expressRes.headers['Access-Control-Max-Age'] = '86400'; // 24 hours
        
        // Mark that we've set CORS headers
        req.corsHeadersSet = true;
      }
      
      expressRes.end();
      return;
    }
    
    // Process the request through the Express app
    app(expressReq, expressRes);
    
  } catch (error) {
    console.error('Error in handler:', error);
    console.error('Error stack:', error.stack);
    
    // Set error response
    resp.setStatusCode(500);
    resp.setHeader('Content-Type', 'application/json');
    resp.send(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
      service: 'MatrixAI Server',
      platform: 'Alibaba Cloud Function Compute'
    }));
  }
};

// For local development, start the Express server
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`MatrixAI Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Export handler for Function Compute
module.exports = handler;
module.exports.handler = handler;