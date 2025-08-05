const express = require('express');
const cors = require('cors');
const audioRoutes = require('./src/routes/audioRoutes.js');
const videoRoutes = require('./src/routes/videoRoutes.js');
const imageRoutes = require('./src/routes/imageRoutes.js');
const userRoutes = require('./src/routes/userRoutes.js');
const adminRoutes = require('./src/routes/adminRoutes.js');
const emailRoutes = require('./src/routes/emailRoutes.js');
const contentRoutes = require('./src/routes/contentRoutes.js');
const humanizeRoutes = require('./src/routes/humanizeRoutes.js');
const detectionRoutes = require('./src/routes/detectionRoutes.js');
const paymentRoutes = require('./src/routes/paymentRoutes.js');
const presentationRoutes = require('./src/routes/presentationRoutes.js');

// Set up environment variables with fallback configuration
const setupEnvironment = () => {
  const fallbackEnv = {
    ENVIRONMENT: 'production',
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://ddtgdhehxhgarkonvpfq.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdGdkaGVoeGhnYXJrb252cGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ2Njg4MTIsImV4cCI6MjA1MDI0NDgxMn0.mY8nx-lKrNXjJxHU7eEja3-fTSELQotOP4aZbxvmNPY',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdGdkaGVoeGhnYXJrb252cGZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDY2ODgxMiwiZXhwIjoyMDUwMjQ0ODEyfQ.96FIL3jqf7QfnMITUkx5ze6t417VPkLFi83Su6Cgb7c',
    DEEPGRAM_API_URL: 'https://api.deepgram.com/v1/listen',
    DEEPGRAM_API_KEY: '45ef09cde6cad708abadbe83e5e9eff19f398427',
    DASHSCOPE_API_KEY: 'sk-e580e1af954e41a6a1e90f5adac47bc3',
    DASHSCOPEVIDEO_API_KEY: 'sk-e580e1af954e41a6a1e90f5adac47bc3',
    DASHSCOPEIMAGE_API_KEY: 'sk-e580e1af954e41a6a1e90f5adac47bc3',
    RAPIDAPI_KEY: 'ded161a4bbmsh97e7e2c341abd29p1e8fa4jsn56149c4f8718',
    BASE_URL: 'https://main-matrixai-server-lujmidrakh.cn-hangzhou.fcapp.run'
  };

  Object.keys(fallbackEnv).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = fallbackEnv[key];
    }
  });
};

// Initialize environment
setupEnvironment();

const app = express();

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3000', 'https://matrix-4hv.pages.dev', 'http://localhost:3001', 'http://localhost:3002', 'https://matrixaiglobal.com', 'https://www.matrixaiglobal.com', 'https://matrixai.asia'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key', 'Accept', 'Origin', 'Cache-Control', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Enable CORS middleware for Express
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'MatrixAI Server',
    version: '1.0.0',
    platform: 'Express.js'
  });
});

// Routes
app.use('/api/audio', audioRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/humanize', humanizeRoutes);
app.use('/api/detection', detectionRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/presentation', presentationRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    availableEndpoints: [
      '/health',
      '/api/audio/uploadAudioUrl',
      '/api/audio/getAudioStatus', 
      '/api/audio/getAudioFile',
      '/api/audio/getAllAudioFiles',
      '/api/video/createVideo',
      '/api/video/getVideoStatus',
      '/api/video/getAllVideos',
      '/api/image/createImage',
      '/api/image/getImageStatus',
      '/api/image/getAllImages',
      '/api/user/subtractCoins',
      '/api/user/getUserCoins',
      '/api/user/userinfo',
      '/api/user/AllTransactions',
      '/api/user/getCoupon',
      '/api/user/getUserOrder',
      '/api/user/BuySubscription',
      '/api/user/edituser',
      '/api/admin/getAllUsers',
      '/api/admin/getAllGeneratedImage',
      '/api/email/send',
      '/api/email/logs',
      '/api/content/generateContent',
      '/api/content/getGeneratedContent',
      '/api/content/getContent/:contentId',
      '/api/content/deleteContent/:contentId',
      '/api/detection/createDetection',
      '/api/detection/getUserDetections',
      '/api/detection/getDetection',
      '/api/detection/deleteDetection'
    ]
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    service: 'MatrixAI Server',
    platform: 'Express.js'
  });
});

module.exports = app;