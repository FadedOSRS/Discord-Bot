const fs = require('fs-extra');
const path = require('path');

const dataDir = process.env.DATA_DIR || './data';
const AFK_PATH = path.join(dataDir, 'afk.json');

function loadAfk() {
  if (!fs.existsSync(AFK_PATH)) return {};
  try {
    return fs.readJsonSync(AFK_PATH);
  } catch {
    return {};
  }
}

function saveAfk(store) {
  fs.writeJsonSync(AFK_PATH, store, { spaces: 2 });
}

function keyFor(guildId, userId) {
  return `${guildId}:${userId}`;
}

function setAfk(guildId, userId, reason) {
  const store = loadAfk();
  const key = keyFor(guildId, userId);
  store[key] = {
    reason: String(reason || 'AFK').slice(0, 200),
    since: new Date().toISOString()
  };
  saveAfk(store);
}

function clearAfk(guildId, userId) {
  const store = loadAfk();
  const key = keyFor(guildId, userId);
  if (store[key]) {
    delete store[key];
    saveAfk(store);
    return true;
  }
  return false;
}

function getAfk(guildId, userId) {
  return loadAfk()[keyFor(guildId, userId)] || null;
}

module.exports = {
  loadAfk,
  saveAfk,
  keyFor,
  setAfk,
  clearAfk,
  getAfk
};
