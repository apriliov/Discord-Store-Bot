const { SlashCommandBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const Product = require('../database/models/Product');
const { buildCatalogPage } = require('../services/catalog');

const data = new SlashCommandBuilder()
  .setName('catalog')
  .setDescription('Browse the product catalog')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o.setName('category').setDescription('Only show one category').setAutocomplete(true));

async function autocomplete(interaction) {
  const typed = String(interaction.options.getFocused()).toLowerCase();
  const cats = await Product.distinct('category', { guildId: interaction.guildId });
  return interaction.respond(cats.filter((c) => c.toLowerCase().includes(typed)).slice(0, 25).map((c) => ({ name: c, value: c })));
}

async function execute(interaction) {
  const category = interaction.options.getString('category') || '*';
  const payload = await buildCatalogPage(interaction.guildId, 0, category);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute, autocomplete };
