/**
 * graphBuilder.js
 * Pure in-memory GraphRAG pipeline.
 *
 * Pipeline stages:
 *   1. chunking       — split document text into overlapping chunks
 *   2. extraction     — extract entities and relationships from each chunk
 *   3. deduplication  — merge duplicate nodes and edges
 *   4. graph creation — assemble final nodes/edges arrays
 *
 * No external services (Zep, Neo4j, Redis, etc.) are used.
 * ZEP_API_KEY is intentionally absent and must never be referenced here.
 */

const { v4: uuidv4 } = require('uuid');
const { updateTask, storeGraph } = require('../utils/graphStore');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Stage 1 — Chunking
// ---------------------------------------------------------------------------

/**
 * Split text into overlapping chunks of ~chunkSize words.
 * @param {string} text
 * @param {number} chunkSize   words per chunk
 * @param {number} overlap     words shared between consecutive chunks
 * @returns {string[]}
 */
function chunkText(text, chunkSize = 120, overlap = 20) {
  const words = text.trim().split(/\s+/);
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start += chunkSize - overlap;
  }
  return chunks.length > 0 ? chunks : [text];
}

// ---------------------------------------------------------------------------
// Stage 2 — Entity & Relationship Extraction (rule-based, no LLM required)
// ---------------------------------------------------------------------------

/**
 * Capitalised-word heuristic entity extractor.
 * Extracts runs of Title-Cased words as candidate entities and infers
 * co-occurrence relationships between entities in the same sentence.
 *
 * @param {string} chunk
 * @param {object} ontology   { entityTypes: string[], relationshipTypes: string[] }
 * @returns {{ entities: object[], relationships: object[] }}
 */
function extractFromChunk(chunk, ontology) {
  const sentences = chunk.split(/[.!?]+/).filter(s => s.trim().length > 2);

  const entityMap = new Map(); // label → entity object
  const relationships = [];

  for (const sentence of sentences) {
    // Match runs of 1–4 Title-Cased words (simple NER heuristic)
    const matches = sentence.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g) || [];
    const sentenceEntities = [];

    for (const label of matches) {
      if (!entityMap.has(label)) {
        // Assign a type from the ontology by cycling through available types
        const typeIndex = entityMap.size % Math.max(ontology.entityTypes.length, 1);
        const type = ontology.entityTypes[typeIndex] || 'Entity';
        entityMap.set(label, {
          id: `node_${uuidv4().slice(0, 8)}`,
          label,
          type,
          properties: {},
        });
      }
      sentenceEntities.push(entityMap.get(label));
    }

    // Create co-occurrence edges between entities in the same sentence
    for (let i = 0; i < sentenceEntities.length - 1; i++) {
      const source = sentenceEntities[i];
      const target = sentenceEntities[i + 1];
      if (source.id === target.id) continue;

      const relTypeIndex = relationships.length % Math.max(ontology.relationshipTypes.length, 1);
      const relType = ontology.relationshipTypes[relTypeIndex] || 'RELATED_TO';

      relationships.push({
        id: `edge_${uuidv4().slice(0, 8)}`,
        source: source.id,
        target: target.id,
        type: relType,
        properties: {},
      });
    }
  }

  return {
    entities: Array.from(entityMap.values()),
    relationships,
  };
}

// ---------------------------------------------------------------------------
// Stage 3 — Deduplication
// ---------------------------------------------------------------------------

/**
 * Merge entities with the same label and deduplicate edges.
 * @param {object[][]} entitySets
 * @param {object[][]} edgeSets
 * @returns {{ nodes: object[], edges: object[] }}
 */
function deduplicateGraph(entitySets, edgeSets) {
  const labelToNode = new Map();

  for (const entities of entitySets) {
    for (const entity of entities) {
      if (!labelToNode.has(entity.label)) {
        labelToNode.set(entity.label, entity);
      }
    }
  }

  const nodes = Array.from(labelToNode.values());
  const nodeIdRemap = new Map(); // old id → canonical id

  // Build remap table so edges point to canonical node ids
  for (const entities of entitySets) {
    for (const entity of entities) {
      const canonical = labelToNode.get(entity.label);
      nodeIdRemap.set(entity.id, canonical.id);
    }
  }

  // Deduplicate edges by (source, target, type)
  const edgeKeys = new Set();
  const edges = [];

  for (const edgeSet of edgeSets) {
    for (const edge of edgeSet) {
      const src = nodeIdRemap.get(edge.source) || edge.source;
      const tgt = nodeIdRemap.get(edge.target) || edge.target;
      if (src === tgt) continue;
      const key = `${src}→${tgt}:${edge.type}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ ...edge, source: src, target: tgt });
      }
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Public API — async graph build
// ---------------------------------------------------------------------------

/**
 * Run the full graph build pipeline asynchronously.
 * Updates task progress at each stage via graphStore.
 *
 * @param {string}   taskId
 * @param {string}   graphId
 * @param {string}   text       raw document text
 * @param {object}   ontology   { entityTypes, relationshipTypes }
 */
async function buildGraph(taskId, graphId, text, ontology) {
  try {
    logger.info('Graph build started', { task_id: taskId, graph_id: graphId });

    // --- Stage 1: Chunking ---
    updateTask(taskId, { status: 'building', progress: 10 });
    logger.info('Chunking document', { task_id: taskId });
    const chunks = chunkText(text);
    logger.info('Chunking complete', { task_id: taskId, chunk_count: chunks.length });

    // --- Stage 2: Extraction ---
    updateTask(taskId, { status: 'processing', progress: 30 });
    logger.info('Extracting entities and relationships', { task_id: taskId });

    const allEntities = [];
    const allEdges = [];

    for (let i = 0; i < chunks.length; i++) {
      const { entities, relationships } = extractFromChunk(chunks[i], ontology);
      allEntities.push(entities);
      allEdges.push(relationships);

      const progress = 30 + Math.floor(((i + 1) / chunks.length) * 40);
      updateTask(taskId, { progress });
    }

    logger.info('Extraction complete', {
      task_id: taskId,
      raw_entity_sets: allEntities.length,
      raw_edge_sets: allEdges.length,
    });

    // --- Stage 3: Deduplication ---
    updateTask(taskId, { status: 'processing', progress: 75 });
    logger.info('Deduplicating graph', { task_id: taskId });
    const { nodes, edges } = deduplicateGraph(allEntities, allEdges);

    logger.info('Deduplication complete', {
      task_id: taskId,
      node_count: nodes.length,
      edge_count: edges.length,
    });

    // --- Guard: require at least one node ---
    if (nodes.length === 0) {
      throw new Error(
        'No entities could be extracted from the provided text. ' +
        'Please supply a longer or more structured document.'
      );
    }

    // --- Stage 4: Store graph ---
    updateTask(taskId, { status: 'processing', progress: 90 });
    logger.info('Storing graph in memory', { task_id: taskId, graph_id: graphId });
    storeGraph(graphId, nodes, edges);

    // --- Complete ---
    updateTask(taskId, {
      status: 'completed',
      progress: 100,
      graph_id: graphId,
      error: null,
    });

    logger.info('Graph build completed', {
      task_id: taskId,
      graph_id: graphId,
      node_count: nodes.length,
      edge_count: edges.length,
    });

  } catch (err) {
    logger.error('Graph build failed', { task_id: taskId, error: err.message });
    updateTask(taskId, {
      status: 'error',
      progress: 0,
      error: err.message,
    });
  }
}

module.exports = { buildGraph };
