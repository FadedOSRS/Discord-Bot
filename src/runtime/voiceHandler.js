const { Events } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');

function registerVoiceHandler(client, dataDir) {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      // Only care when users leave a voice channel
      if (!oldState.channelId || oldState.channelId === newState.channelId) return;

      const lfgStorePath = path.join(dataDir, 'lfgEvents.json');
      if (!fs.existsSync(lfgStorePath)) return;

      const lfgEvents = fs.readJsonSync(lfgStorePath);
      const tempChannelIds = Object.values(lfgEvents)
        .map(e => e.tempVoiceChannelId)
        .filter(Boolean);

      if (!tempChannelIds.includes(oldState.channelId)) return;

      const channel = oldState.guild.channels.cache.get(oldState.channelId);
      if (!channel || channel.members.size > 0) return;

      // Delete the voice channel
      await channel.delete('Temp LFG voice channel is now empty.').catch(err =>
        console.error('Failed to delete temp voice channel:', err)
      );

      // Remove tempVoiceChannelId from any events that used it
      for (const [messageId, event] of Object.entries(lfgEvents)) {
        if (event.tempVoiceChannelId === oldState.channelId) {
          lfgEvents[messageId].tempVoiceChannelId = null;
          lfgEvents[messageId].tempVoiceCreatedAt = null;
        }
      }

      fs.writeJsonSync(lfgStorePath, lfgEvents, { spaces: 2 });
    } catch (err) {
      console.error('Error in VoiceStateUpdate handler:', err);
    }
  });
}

module.exports = { registerVoiceHandler };
