/**
 * graphRoutes.js
 * Mounts the three graph pipeline endpoints.
 *
 * POST /api/graph/build          → start async build, returns task_id
 * GET  /api/graph/status/:task_id → poll build progress
 * GET  /api/graph/:graph_id       → fetch completed graph (nodes + edges)
 *
 * Route order matters: /status/:task_id must be registered before /:graph_id
 * to prevent "status" being matched as a graph_id.
 */

const express = require('express');
const router = express.Router();
const { startBuild, getStatus, getGraphData } = require('../controllers/graphController');

router.post('/build', startBuild);
router.get('/status/:task_id', getStatus);
router.get('/:graph_id', getGraphData);

module.exports = router;
