/**
 * graphStore.js
 * In-memory store for graph build tasks and completed graphs.
 * No external dependencies — all data lives in process memory.
 *
 * NOTE: ZEP_API_KEY is intentionally NOT used anywhere in this project.
 * Graph state is managed entirely in-process.
 */

const tasks = new Map();   // task_id  → task object
const graphs = new Map();  // graph_id → graph object (nodes + edges)

/**
 * Create a new task record and return its id.
 * @param {string} taskId
 */
function createTask(taskId) {
  tasks.set(taskId, {
    task_id: taskId,
    status: 'building',
    progress: 0,
    graph_id: null,
    error: null,
    created_at: new Date().toISOString(),
  });
}

/**
 * Update fields on an existing task.
 * @param {string} taskId
 * @param {object} updates
 */
function updateTask(taskId, updates) {
  const task = tasks.get(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  Object.assign(task, updates);
}

/**
 * Retrieve a task by id.
 * @param {string} taskId
 * @returns {object|null}
 */
function getTask(taskId) {
  return tasks.get(taskId) || null;
}

/**
 * Store a completed graph.
 * @param {string} graphId
 * @param {Array} nodes
 * @param {Array} edges
 */
function storeGraph(graphId, nodes, edges) {
  graphs.set(graphId, {
    graph_id: graphId,
    nodes,
    edges,
    created_at: new Date().toISOString(),
  });
}

/**
 * Retrieve a graph by id.
 * @param {string} graphId
 * @returns {object|null}
 */
function getGraph(graphId) {
  return graphs.get(graphId) || null;
}

module.exports = { createTask, updateTask, getTask, storeGraph, getGraph };
