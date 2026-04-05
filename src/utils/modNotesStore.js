const fs = require('fs-extra');
const path = require('path');

const dataDir = process.env.DATA_DIR || './data';
const NOTES_PATH = path.join(dataDir, 'modNotes.json');

function loadNotes() {
  if (!fs.existsSync(NOTES_PATH)) return {};
  try {
    return fs.readJsonSync(NOTES_PATH);
  } catch {
    return {};
  }
}

function saveNotes(store) {
  fs.writeJsonSync(NOTES_PATH, store, { spaces: 2 });
}

function keyFor(guildId, userId) {
  return `${guildId}:${userId}`;
}

module.exports = {
  loadNotes,
  saveNotes,
  keyFor
};
