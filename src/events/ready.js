const { Events, ActivityType } = require('discord.js');
const config = require('../config');
const { assertLicense } = require('../utils/banner');
const { syncSlashCommands } = require('../services/registerSlash');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    assertLicense();
    console.log(`[BOT] Logged in as ${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: config.defaultStatus, type: ActivityType.Watching }], status: 'online' });

    if (config.autoDeploy) {
      try {
        const r = await syncSlashCommands(client.commands, { clientId: client.user.id });
        console.log(`[BOT] Slash commands synced (${r.scope}): ${r.count} -> ${r.names.join(', ')}`);
      } catch (err) {
        console.error('[BOT] Slash command sync failed:', err.message);
      }
    }
  },
};
