const fs = require('fs-extra');
const path = require('path');

const DEFAULT_CONFIG = {
  verificationChannelId: null,
  /** Latest verify sticky message id (reposted to channel bottom on activity). */
  verificationMessageId: null,
  geChannelId: null,
  geThresholdGp: 25000,
  womAnnouncementsChannelId: null,
  womPingRoleId: null,
  womGroupId: null,
  womVerificationCode: null,
  verifiedRoleId: null,
  /** Role IDs allowed to approve/deny verify log buttons (besides Admin / Manage Server). */
  verificationApproverRoleIds: [],
  lfgChannelId: null,
  logChannelId: null,
  modLogChannelId: null,
  /** When set, `/events` embeds post here instead of the channel where the command was started. */
  siteEventChannelId: null
};

function loadJsonOrDefault(filePath, fallback, label) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return fs.readJsonSync(filePath);
  } catch (err) {
    console.error(`Failed to read ${label}`, err);
    return fallback;
  }
}

function createRuntimeState(dataDir) {
  fs.ensureDirSync(dataDir);

  const CONFIG_PATH = path.join(dataDir, 'config.json');
  let config = {
    ...DEFAULT_CONFIG,
    ...loadJsonOrDefault(CONFIG_PATH, {}, 'config.json')
  };

  function saveConfig() {
    fs.writeJsonSync(CONFIG_PATH, config, { spaces: 2 });
  }

  const VERIFICATIONS_PATH = path.join(dataDir, 'verifications.json');
  let verifications = loadJsonOrDefault(VERIFICATIONS_PATH, {}, 'verifications.json');
  function saveVerifications() {
    fs.writeJsonSync(VERIFICATIONS_PATH, verifications, { spaces: 2 });
  }

  const GIVEAWAYS_PATH = path.join(dataDir, 'giveaways.json');
  let giveaways = loadJsonOrDefault(GIVEAWAYS_PATH, {}, 'giveaways.json');
  function saveGiveaways() {
    fs.writeJsonSync(GIVEAWAYS_PATH, giveaways, { spaces: 2 });
  }

  const BIRTHDAYS_PATH = path.join(dataDir, 'birthdays.json');
  let birthdays = loadJsonOrDefault(BIRTHDAYS_PATH, {}, 'birthdays.json');
  function saveBirthdays() {
    fs.writeJsonSync(BIRTHDAYS_PATH, birthdays, { spaces: 2 });
  }

  const STICKIES_PATH = path.join(dataDir, 'stickies.json');
  let stickies = loadJsonOrDefault(STICKIES_PATH, {}, 'stickies.json');
  function saveStickies() {
    fs.writeJsonSync(STICKIES_PATH, stickies, { spaces: 2 });
  }

  function flushRuntimeState() {
    try {
      saveConfig();
      saveVerifications();
      saveGiveaways();
      saveBirthdays();
      saveStickies();
    } catch (err) {
      console.error('Failed to flush runtime state:', err);
    }
  }

  return {
    get config() {
      return config;
    },
    set config(next) {
      config = next;
    },
    saveConfig,
    get verifications() {
      return verifications;
    },
    set verifications(next) {
      verifications = next;
    },
    saveVerifications,
    get giveaways() {
      return giveaways;
    },
    set giveaways(next) {
      giveaways = next;
    },
    saveGiveaways,
    get birthdays() {
      return birthdays;
    },
    set birthdays(next) {
      birthdays = next;
    },
    saveBirthdays,
    get stickies() {
      return stickies;
    },
    set stickies(next) {
      stickies = next;
    },
    saveStickies,
    flushRuntimeState
  };
}

module.exports = { createRuntimeState };
