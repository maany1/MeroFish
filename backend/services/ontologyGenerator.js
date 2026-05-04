/**
 * ontologyGenerator.js
 * Generates an ontology (entity types + relationship types) from document text.
 *
 * Uses the OpenAI API when OPENAI_API_KEY is set.
 * Falls back to a sensible default ontology when no key is available,
 * so the pipeline always works locally without external dependencies.
 *
 * ZEP_API_KEY is intentionally NOT referenced here or anywhere in this project.
 */

const logger = require('../utils/logger');

const DEFAULT_ONTOLOGY = {
  entityTypes: ['Person', 'Organization', 'Location', 'Event', 'Concept', 'Product'],
  relationshipTypes: ['RELATED_TO', 'WORKS_FOR', 'LOCATED_IN', 'PARTICIPATES_IN', 'PRODUCES', 'CAUSES'],
};

/**
 * Generate an ontology from the first ~800 words of the document.
 * @param {string} text
 * @returns {Promise<{ entityTypes: string[], relationshipTypes: string[] }>}
 */
async function generateOntology(text) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'your_actual_api_key_here') {
    logger.warn('OPENAI_API_KEY not set — using default ontology');
    return DEFAULT_ONTOLOGY;
  }

  try {
    const { OpenAI } = require('openai');
    const client = new OpenAI({ apiKey });

    const snippet = text.split(/\s+/).slice(0, 800).join(' ');

    const response = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a knowledge graph expert. Given a text excerpt, ' +
            'return a JSON object with two arrays: ' +
            '"entityTypes" (5–8 entity category names) and ' +
            '"relationshipTypes" (5–8 relationship type names in UPPER_SNAKE_CASE). ' +
            'Respond with valid JSON only, no markdown fences.',
        },
        { role: 'user', content: `Text:\n${snippet}` },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });

    const raw = response.choices[0].message.content.trim();
    const ontology = JSON.parse(raw);

    if (!Array.isArray(ontology.entityTypes) || !Array.isArray(ontology.relationshipTypes)) {
      throw new Error('Malformed ontology response from LLM');
    }

    logger.info('Ontology generated via LLM', {
      entity_types: ontology.entityTypes.length,
      relationship_types: ontology.relationshipTypes.length,
    });

    return ontology;

  } catch (err) {
    logger.warn('Ontology LLM call failed — falling back to default', { error: err.message });
    return DEFAULT_ONTOLOGY;
  }
}

module.exports = { generateOntology };
