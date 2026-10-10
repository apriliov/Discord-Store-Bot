const { Events, MessageFlags } = require('discord.js');
const embeds = require('../utils/embeds');
const tickets = require('../services/tickets');
const verification = require('../services/verification');
const catalog = require('../services/catalog');
const ratings = require('../services/ratings');
const help = require('../services/help');

const ROUTES = [
  ['tk:', 'TICKETS', tickets.handleInteraction],
  ['vf:', 'VERIFY', verification.handleInteraction],
  ['ct:', 'CATALOG', catalog.handleInteraction],
  ['rt:', 'RATING', ratings.handleInteraction],
  ['hp:', 'HELP', help.handleInteraction],
];

// 10062 = interaction expired (Discord only allows 3 seconds), 40060 = already acknowledged.
// This happens when the host lags or reconnects, so it is not worth a stack trace.
const isStale = (err) => err && (err.code === 10062 || err.code === 40060);

async function fail(interaction, tag, err) {
  if (isStale(err)) return console.warn(`[${tag}] Interaction expired before the bot could answer (host lag or reconnect).`);
  console.error(`[${tag}] Interaction failed:`, err);
  const payload = { embeds: [embeds.error('Something went wrong. Please try again.')], flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {
    /* nothing else we can do */
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command && typeof command.autocomplete === 'function') await command.autocomplete(interaction).catch((err) => { if (!isStale(err)) console.warn('[AUTOCOMPLETE]', err.message); });
        return;
      }

      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const id = interaction.customId || '';
        const route = ROUTES.find(([prefix]) => id.startsWith(prefix));
        if (!route) return;
        await route[2](client, interaction).catch((err) => fail(interaction, route[1], err));
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      if (!interaction.inGuild()) {
        return interaction.reply({ content: 'Store commands only work inside a server.', flags: MessageFlags.Ephemeral });
      }
      await command.execute(interaction, client).catch((err) => fail(interaction, `/${interaction.commandName}`, err));
    } catch (err) {
      if (isStale(err)) return console.warn('[INTERACTION] Interaction expired before the bot could answer (host lag or reconnect).');
      console.error('[INTERACTION]', err);
    }
  },
};
