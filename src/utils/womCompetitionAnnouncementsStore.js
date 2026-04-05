const fs = require('fs-extra');
const path = require('path');

function getStorePath() {
  const dataDir = process.env.DATA_DIR || './data';
  return path.join(dataDir, 'womCompetitionAnnouncements.json');
}

function loadWomAnnouncements() {
  const p = getStorePath();
  if (!fs.existsSync(p)) return {};
  try {
    return fs.readJsonSync(p);
  } catch (err) {
    console.error('Failed to read womCompetitionAnnouncements.json', err);
    return {};
  }
}

function saveWomAnnouncements(store) {
  const dataDir = process.env.DATA_DIR || './data';
  fs.ensureDirSync(dataDir);
  fs.writeJsonSync(getStorePath(), store || {}, { spaces: 2 });
}

module.exports = {
  loadWomAnnouncements,
  saveWomAnnouncements
};

