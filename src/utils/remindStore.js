const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const dataDir = process.env.DATA_DIR || './data';
const REMIND_PATH = path.join(dataDir, 'reminders.json');

function loadReminders() {
  if (!fs.existsSync(REMIND_PATH)) return {};
  try {
    return fs.readJsonSync(REMIND_PATH);
  } catch {
    return {};
  }
}

function saveReminders(store) {
  fs.writeJsonSync(REMIND_PATH, store, { spaces: 2 });
}

function addReminder({ userId, message, fireAtMs }) {
  const store = loadReminders();
  const id = crypto.randomUUID();
  store[id] = {
    id,
    userId,
    message: String(message).slice(0, 500),
    fireAtMs,
    createdAt: new Date().toISOString()
  };
  saveReminders(store);
  return id;
}

function removeReminder(id) {
  const store = loadReminders();
  delete store[id];
  saveReminders(store);
}

module.exports = {
  loadReminders,
  saveReminders,
  addReminder,
  removeReminder
};
