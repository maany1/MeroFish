/**
 * server.js
 * MeroFish Express backend entry point.
 *
 * IMPORTANT: This project does NOT use Zep.
 * ZEP_API_KEY must never be set or referenced.
 * Graph construction is fully in-memory via services/graphBuilder.js.
 */

const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const logger      = require('./utils/logger');
const graphRoutes = require('./routes/graphRoutes');

// ---------------------------------------------------------------------------
// Guard: abort startup if ZEP_API_KEY is accidentally set
// ---------------------------------------------------------------------------
if (process.env.ZEP_API_KEY) {
  logger.error(
    'ZEP_API_KEY is set in the environment. ' +
    'Zep integration has been permanently removed from this project. ' +
    'Please remove ZEP_API_KEY from your .env file and restart.'
  );
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
  res.send('MeroFish backend is running');
});

app.use('/api/graph', graphRoutes);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  logger.info(`MeroFish backend started`, { port: PORT });
});
