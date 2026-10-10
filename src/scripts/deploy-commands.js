const config = require('../config');
const { loadCommands } = require('../handlers/commandLoader');
const { syncSlashCommands } = require('../services/registerSlash');

(async () => {
  if (!config.token) throw new Error('DISCORD_TOKEN is missing in .env.');
  const r = await syncSlashCommands(loadCommands());
  console.log(`Registered ${r.count} slash commands (${r.scope}):`);
  console.log('  ' + r.names.join(', '));
})().catch((err) => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
