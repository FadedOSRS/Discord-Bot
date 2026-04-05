const fs = require('fs-extra');
const path = require('path');

function getStorePath() {
  const dataDir = process.env.DATA_DIR || './data';
  return path.join(dataDir, 'geMarketState.json');
}

function loadGeMarketState() {
  const p = getStorePath();
  if (!fs.existsSync(p)) return { lastRefById: {}, lastGeDailyScanDate: null };
  try {
    const data = fs.readJsonSync(p);
    if (!data || typeof data !== 'object') return { lastRefById: {}, lastGeDailyScanDate: null };
    if (!data.lastRefById || typeof data.lastRefById !== 'object') data.lastRefById = {};
    return data;
  } catch (err) {
    console.error('Failed to read geMarketState.json', err);
    return { lastRefById: {}, lastGeDailyScanDate: null };
  }
}

function saveGeMarketState(state) {
  const dataDir = process.env.DATA_DIR || './data';
  fs.ensureDirSync(dataDir);
  fs.writeJsonSync(getStorePath(), state || { lastRefById: {}, lastGeDailyScanDate: null }, { spaces: 2 });
}

module.exports = {
  loadGeMarketState,
  saveGeMarketState
};

