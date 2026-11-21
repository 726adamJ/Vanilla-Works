/**
 * Thin wrapper — real handler lives in src/handlers/interactionCreate.js
 * This prevents double-loading and keeps events/ clean.
 */
module.exports = require('../handlers/interactionCreate');
