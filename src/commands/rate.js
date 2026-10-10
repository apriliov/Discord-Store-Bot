const { SlashCommandBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const embeds = require('../utils/embeds');
const Product = require('../database/models/Product');
const Rating = require('../database/models/Rating');
const { getGuildConfig } = require('../services/guildConfig');
const { saveRating } = require('../services/ratings');
const { truncate, stars } = require('../utils/format');

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const data = new SlashCommandBuilder()
  .setName('rate')
  .setDescription('Rate our store or a product')
  .setContexts(InteractionContextType.Guild)
  .addIntegerOption((o) =>
    o
      .setName('stars')
      .setDescription('Your rating')
      .setRequired(true)
      .addChoices(
        { name: '⭐⭐⭐⭐⭐  5 - Excellent', value: 5 },
        { name: '⭐⭐⭐⭐  4 - Good', value: 4 },
        { name: '⭐⭐⭐  3 - Okay', value: 3 },
        { name: '⭐⭐  2 - Bad', value: 2 },
        { name: '⭐  1 - Very bad', value: 1 }
      )
  )
  .addStringOption((o) => o.setName('comment').setDescription('Tell us why (optional)').setMaxLength(500))
  .addStringOption((o) => o.setName('product').setDescription('Rate a specific product (optional)').setMaxLength(80).setAutocomplete(true));

async function autocomplete(interaction) {
  const typed = String(interaction.options.getFocused()).toLowerCase();
  const products = await Product.find({ guildId: interaction.guildId }).sort({ number: 1 }).limit(200).lean();
  return interaction.respond(
    products.filter((p) => p.name.toLowerCase().includes(typed)).slice(0, 25).map((p) => ({ name: truncate(p.name, 100), value: truncate(p.name, 80) }))
  );
}

async function execute(interaction, client) {
  const fail = (text) => interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });
  const cfg = await getGuildConfig(interaction.guildId);
  if (!cfg.ratingChannelId) return fail('Ratings are not set up yet. Ask an admin to run `/setup rating`.');

  const value = interaction.options.getInteger('stars');
  const comment = (interaction.options.getString('comment') || '').trim();
  const product = interaction.options.getString('product') || null;

  const recent = await Rating.findOne({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    product,
    source: 'command',
    createdAt: { $gt: new Date(Date.now() - COOLDOWN_MS) },
  }).lean();
  if (recent) return fail(`You already rated ${product ? `**${truncate(product, 60)}**` : 'the store'} in the last 24 hours. Thank you!`);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await saveRating(client, interaction.guildId, interaction.user, { stars: value, comment, product, source: 'command' });
  return interaction.editReply({ embeds: [embeds.success(`Thank you for your ${stars(value)} rating! 💛`)] });
}

module.exports = { data, execute, autocomplete };
