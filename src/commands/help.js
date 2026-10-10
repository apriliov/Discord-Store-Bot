const { SlashCommandBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const { getGuildConfig } = require('../services/guildConfig');
const { buildHelp, CATEGORIES, ORDER } = require('../services/help');

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all commands, grouped by section')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) =>
    o.setName('section').setDescription('Jump straight to one section').addChoices(...ORDER.map((k) => ({ name: CATEGORIES[k].label, value: k })))
  );

async function execute(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const payload = buildHelp(interaction.user.id, cfg.storeName || config.storeName, interaction.options.getString('section') || 'overview');
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute };
