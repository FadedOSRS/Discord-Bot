const fs = require('fs-extra');
const path = require('path');

function getStorePath() {
  const dataDir = process.env.DATA_DIR || './data';
  return path.join(dataDir, 'geWatches.json');
}

function loadGeWatches() {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) return {};
  try {
    return fs.readJsonSync(storePath);
  } catch (err) {
    console.error('Failed to read geWatches.json', err);
    return {};
  }
}

function saveGeWatches(store) {
  const dataDir = process.env.DATA_DIR || './data';
  fs.ensureDirSync(dataDir);
  fs.writeJsonSync(getStorePath(), store || {}, { spaces: 2 });
}

module.exports = {
  loadGeWatches,
  saveGeWatches
};

