const { SlashCommandBuilder, EmbedBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Rating = require('../database/models/Rating');
const { getGuildConfig } = require('../services/guildConfig');
const { truncate, stars } = require('../utils/format');
const { getSeller, productChoices } = require('../services/sellers');

const data = new SlashCommandBuilder()
  .setName('ratings')
  .setDescription('See the average rating of the store, a product or a seller')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o.setName('product').setDescription('Show the rating of one product').setMaxLength(80).setAutocomplete(true))
  .addUserOption((o) => o.setName('seller').setDescription('Show the rating of one seller'));

async function autocomplete(interaction) {
  return interaction.respond(await productChoices(interaction.guildId, interaction.options.getFocused()));
}

async function execute(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const product = interaction.options.getString('product');
  const sellerUser = interaction.options.getUser('seller');
  let seller = null;
  if (sellerUser) {
    seller = await getSeller(interaction.guildId, sellerUser.id);
    if (!seller) return interaction.reply({ embeds: [embeds.error(`${sellerUser} is not a seller of this store.`)], flags: MessageFlags.Ephemeral });
  }
  const query = { guildId: interaction.guildId, ...(product ? { product } : {}), ...(seller ? { sellerId: seller.userId } : {}) };

  const rows = await Rating.aggregate([{ $match: query }, { $group: { _id: '$stars', count: { $sum: 1 } } }]);
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    dist[r._id] = r.count;
    total += r.count;
    sum += r._id * r.count;
  }

  const subject = seller ? truncate(seller.displayName || sellerUser.username, 60) : cfg.storeName || config.storeName;
  const embed = new EmbedBuilder().setColor(config.colors.gold).setTitle(`⭐ Ratings - ${product ? (seller ? `${truncate(product, 80)} (${subject})` : truncate(product, 80)) : subject}`);
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
