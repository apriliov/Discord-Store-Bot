const { SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require('discord.js');
const config = require('../config');
const Product = require('../database/models/Product');
const Rating = require('../database/models/Rating');
const { getGuildConfig } = require('../services/guildConfig');
const { truncate, stars } = require('../utils/format');

const data = new SlashCommandBuilder()
  .setName('ratings')
  .setDescription('See the average rating of the store or a product')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o.setName('product').setDescription('Show the rating of one product').setMaxLength(80).setAutocomplete(true));

async function autocomplete(interaction) {
  const typed = String(interaction.options.getFocused()).toLowerCase();
  const products = await Product.find({ guildId: interaction.guildId }).sort({ number: 1 }).limit(200).lean();
  return interaction.respond(
    products.filter((p) => p.name.toLowerCase().includes(typed)).slice(0, 25).map((p) => ({ name: truncate(p.name, 100), value: truncate(p.name, 80) }))
  );
}

async function execute(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const product = interaction.options.getString('product');
  const query = { guildId: interaction.guildId, ...(product ? { product } : {}) };

  const rows = await Rating.aggregate([{ $match: query }, { $group: { _id: '$stars', count: { $sum: 1 } } }]);
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    dist[r._id] = r.count;
    total += r.count;
    sum += r._id * r.count;
  }

  const embed = new EmbedBuilder().setColor(config.colors.gold).setTitle(`⭐ Ratings - ${product ? truncate(product, 80) : cfg.storeName || config.storeName}`);
  if (!total) {
    embed.setDescription('No ratings yet. Be the first with `/rate`!');
    return interaction.reply({ embeds: [embed] });
  }

  const avg = sum / total;
  const bar = (n) => {
    const filled = Math.round((n / total) * 12);
    return '█'.repeat(filled) + '░'.repeat(12 - filled);
  };
  const lines = [5, 4, 3, 2, 1].map((s) => `\`${s}★\` ${bar(dist[s])} **${dist[s]}**`);
  embed.setDescription(`# ${avg.toFixed(2)} / 5\n${stars(avg)}\nBased on **${total}** rating${total === 1 ? '' : 's'}\n\n${lines.join('\n')}`);
  return interaction.reply({ embeds: [embed] });
}

module.exports = { data, execute, autocomplete };
