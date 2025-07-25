import express from 'express';
import cors from 'cors';
import audioRoutes from './routes/audioRoutes.js';
import contentRoutes from './routes/contentRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import humanizeRoutes from './routes/humanizeRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import userRoutes from './routes/userRoutes.js';
import videoRoutes from './routes/videoRoutes.js';

// Import payment routes (CommonJS module)
// Using dynamic import for CommonJS module
let paymentRoutes;
try {
  // Use a dynamic import with .then() for the CommonJS module
  const paymentRoutesModule = await import('./routes/paymentRoutes.js');
  paymentRoutes = paymentRoutesModule.default;
} catch (error) {
  console.error('Error importing payment routes:', error);
  // Fallback to empty router
  paymentRoutes = express.Router();
}

const app = express();

// Set up environment variables with fallback configuration
const setupEnvironment = () => {
  // Default values for development - these will be overridden by actual environment variables if present
  const fallbackEnv = {
    ENVIRONMENT: 'development',
    NODE_ENV: 'development',
    FC_ACCOUNT_ID: '',
    FC_ACCESS_KEY_ID: '',
    FC_ACCESS_KEY_SECRET: '',
    FC_REGION: 'cn-hangzhou',
    FC_SERVICE_NAME: 'matrixai-server',
    BASE_URL: '',
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    DEEPGRAM_API_URL: 'https://api.deepgram.com/v1/listen',
    DEEPGRAM_API_KEY: '',
    DASHSCOPE_API_KEY: '',
    RAPIDAPI_KEY: '',
    DASHSCOPEVIDEO_API_KEY: '',
    DASHSCOPEIMAGE_API_KEY: ''
  };

  // Set fallback environment variables if not already set
  Object.keys(fallbackEnv).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = fallbackEnv[key];
    }
  });
};

// Initialize environment
setupEnvironment();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://matrixai.asia', 'https://matrixaiglobal.com', 'https://www.matrixaiglobal.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Handle OPTIONS requests explicitly
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'MatrixAI Server',
    version: '1.0.0',
    platform: 'Alibaba Cloud Function Compute'
  });
});

// Debug endpoint to check environment variables
app.get('/debug/env', (req, res) => {
  console.log('Debug endpoint called - checking environment variables');
  
  res.json({
    environment: process.env.ENVIRONMENT || 'undefined',
    nodeEnv: process.env.NODE_ENV || 'undefined',
    supabaseConfigured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    deepgramConfigured: !!(process.env.DEEPGRAM_API_URL && process.env.DEEPGRAM_API_KEY),
    dashscopeConfigured: !!(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPEVIDEO_API_KEY),
    dashscopeImageConfigured: !!(process.env.DASHSCOPEIMAGE_API_KEY),
    fcConfigured: !!(process.env.FC_ACCOUNT_ID && process.env.FC_ACCESS_KEY_ID),
    baseUrl: process.env.BASE_URL || 'undefined'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'MatrixAI Server API',
    version: '1.0.0',
    platform: 'Alibaba Cloud Function Compute',
    endpoints: {
      audio: '/api/audio/*',
      email: '/api/email/*',
      humanize: '/api/humanize/*',
      payment: '/api/payment/*',
      health: '/health',
      debug: '/debug/env'
    },
    documentation: 'https://github.com/your-username/MatrixAI_Server'
  });
});

// Register route modules
app.use('/api/audio', audioRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/humanize', humanizeRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/user', userRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/payment', paymentRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    availableEndpoints: ['/health', '/api', '/debug/env', '/api/audio/*', '/api/email/*', '/api/humanize/*', '/api/image/*', '/api/user/*', '/api/video/*', '/api/payment/*']
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: error.message,
    service: 'MatrixAI Server'
  });
});

export default app;