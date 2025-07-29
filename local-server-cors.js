import express from 'express';
import cors from 'cors';
import app from './app.js';

// Set port for local development
const PORT = process.env.PORT || 3002;

// Create a new Express app that wraps the main app
const localApp = express();

// Configure CORS specifically for local development
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware before routing to the main app
localApp.use(cors(corsOptions));
localApp.options('*', cors(corsOptions));

// Mount the main app
localApp.use('/', app);

// Start the server
localApp.listen(PORT, () => {
  console.log(`MatrixAI Server running locally with CORS enabled on http://localhost:${PORT}`);
  console.log('Allowed origins:', corsOptions.origin.join(', '));
  console.log('Press Ctrl+C to stop the server');
});