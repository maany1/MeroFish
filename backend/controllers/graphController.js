/**
 * graphController.js
 * Handles HTTP request/response logic for the graph build pipeline.
 *
 * Endpoints handled:
 *   POST /api/graph/build
 *   GET  /api/graph/status/:task_id
 *   GET  /api/graph/:graph_id
 */

const { v4: uuidv4 } = require('uuid');
const { createTask, getTask, getGraph } = require('../utils/graphStore');
const { generateOntology } = require('../services/ontologyGenerator');
const { buildGraph } = require('../services/graphBuilder');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// POST /api/graph/build
// ---------------------------------------------------------------------------
async function startBuild(req, res) {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({
      task_id: null,
      status: 'error',
      progress: 0,
      graph_id: null,
      nodes: null,
      edges: null,
      error: 'Request body must include a non-empty "text" field.',
    });
  }

  const taskId  = `task_${uuidv4()}`;
  const graphId = `graph_${uuidv4()}`;

  // Register task immediately so status endpoint can respond right away
  createTask(taskId);

  logger.info('Build request received', { task_id: taskId, graph_id: graphId, text_length: text.length });

  // Fire-and-forget: generate ontology then build graph asynchronously
  (async () => {
    const ontology = await generateOntology(text);
    await buildGraph(taskId, graphId, text, ontology);
  })();

  return res.status(202).json({
    task_id: taskId,
    status: 'building',
    progress: 0,
    graph_id: null,
    nodes: null,
    edges: null,
    error: null,
  });
}

// ---------------------------------------------------------------------------
// GET /api/graph/status/:task_id
// ---------------------------------------------------------------------------
function getStatus(req, res) {
  const { task_id } = req.params;
  const task = getTask(task_id);

  if (!task) {
    return res.status(404).json({
      task_id: task_id,
      status: 'error',
      progress: 0,
      graph_id: null,
      nodes: null,
      edges: null,
      error: `Task not found: ${task_id}`,
    });
  }

  return res.json({
    task_id: task.task_id,
    status: task.status,
    progress: task.progress,
    graph_id: task.graph_id,
    nodes: null,
    edges: null,
    error: task.error,
  });
}

// ---------------------------------------------------------------------------
// GET /api/graph/:graph_id
// ---------------------------------------------------------------------------
function getGraphData(req, res) {
  const { graph_id } = req.params;
  const graph = getGraph(graph_id);

  if (!graph) {
    return res.status(404).json({
      task_id: null,
      status: 'error',
      progress: 0,
      graph_id: graph_id,
      nodes: null,
      edges: null,
      error: `Graph not found: ${graph_id}`,
    });
  }

  if (!graph.nodes || graph.nodes.length === 0) {
    return res.status(422).json({
      task_id: null,
      status: 'error',
      progress: 100,
      graph_id: graph_id,
      nodes: null,
      edges: null,
      error: 'Graph exists but contains no nodes. Build may have failed silently.',
    });
  }

  return res.json({
    task_id: null,
    status: 'completed',
    progress: 100,
    graph_id: graph.graph_id,
    nodes: graph.nodes,
    edges: graph.edges,
    error: null,
  });
}

module.exports = { startBuild, getStatus, getGraphData };
