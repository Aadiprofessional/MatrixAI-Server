import app from './app.js';

// Set port for local development
const PORT = process.env.PORT || 3002;

// Start the server
app.listen(PORT, () => {
  console.log(`MatrixAI Server running locally on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop the server');
});