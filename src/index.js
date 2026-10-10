const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const { connectDatabase } = require('./database/connect');
const { loadCommands } = require('./handlers/commandLoader');
const { loadEvents } = require('./handlers/eventLoader');
const { printBanner } = require('./utils/banner');

if (!config.token) {
  console.error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, // prefix commands
    GatewayIntentBits.GuildMembers, // join/leave log, auto role (privileged intent)
    GatewayIntentBits.MessageContent, // prefix commands and ticket transcripts (privileged intent)
  ],
  partials: [Partials.GuildMember, Partials.Channel],
  allowedMentions: { parse: [], repliedUser: false },
});

client.commands = loadCommands();
printBanner(client.commands.size);
loadEvents(client);

process.on('unhandledRejection', (err) => console.error('[UNHANDLED REJECTION]', err));
process.on('uncaughtException', (err) => console.error('[UNCAUGHT EXCEPTION]', err));

(async () => {
  await connectDatabase(config.mongoUri);
  await client.login(config.token);
})().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
