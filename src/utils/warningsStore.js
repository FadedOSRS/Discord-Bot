const fs = require('fs-extra');
const path = require('path');

const dataDir = process.env.DATA_DIR || './data';
const WARNINGS_PATH = path.join(dataDir, 'warnings.json');

function loadWarnings() {
  if (!fs.existsSync(WARNINGS_PATH)) return {};
  try {
    return fs.readJsonSync(WARNINGS_PATH);
  } catch {
    return {};
  }
}

function saveWarnings(store) {
  fs.writeJsonSync(WARNINGS_PATH, store, { spaces: 2 });
}

function keyFor(guildId, userId) {
  return `${guildId}:${userId}`;
}

module.exports = {
  loadWarnings,
  saveWarnings,
  keyFor
};

