const { REST, Routes } = require('discord.js');
const config = require('../config');

async function syncSlashCommands(commands, { clientId = config.clientId } = {}) {
  if (!clientId) throw new Error('CLIENT_ID is missing in .env.');
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = [...commands.values()].map((cmd) => cmd.data.toJSON());

  // With GUILD_ID set, commands are registered for that server only (instant updates).
  // Without it they are registered globally (can take up to an hour to appear).
  const route = config.guildId
    ? Routes.applicationGuildCommands(clientId, config.guildId)
    : Routes.applicationCommands(clientId);
  await rest.put(route, { body });

  return { count: body.length, scope: config.guildId ? `server ${config.guildId}` : 'global', names: body.map((c) => c.name).sort() };
}

module.exports = { syncSlashCommands };
