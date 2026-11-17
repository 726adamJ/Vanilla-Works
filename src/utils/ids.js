const { v4: uuidv4 } = require('uuid');

function generateId(prefix = '') {
  const id = uuidv4().split('-')[0].toUpperCase();
  return prefix ? `${prefix}-${id}` : id;
}

function generateRequestId() {
  return generateId('REQ');
}

function generateLogId() {
  return generateId('LOG');
}

function generatePollId() {
  return generateId('POLL');
}

function generatePostId() {
  return generateId('POST');
}

function generateEmbedId() {
  return generateId('EMB');
}

function generateBlacklistId() {
  return generateId('BL');
}

module.exports = {
  generateId,
  generateRequestId,
  generateLogId,
  generatePollId,
  generatePostId,
  generateEmbedId,
  generateBlacklistId
};
