const { SlashCommandBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const embeds = require('../utils/embeds');
const Rating = require('../database/models/Rating');
const { getGuildConfig } = require('../services/guildConfig');
const { saveRating } = require('../services/ratings');
const { truncate, stars } = require('../utils/format');
const { resolveSellerForItem, productChoices } = require('../services/sellers');

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
  .addStringOption((o) => o.setName('product').setDescription('Rate a specific product (optional)').setMaxLength(80).setAutocomplete(true))
  .addUserOption((o) => o.setName('seller').setDescription('Rate a specific seller (optional, needed if several sellers sell the same product)'));

async function autocomplete(interaction) {
  return interaction.respond(await productChoices(interaction.guildId, interaction.options.getFocused()));
}

async function execute(interaction, client) {
  const fail = (text) => interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });
  const cfg = await getGuildConfig(interaction.guildId);
  if (!cfg.ratingChannelId) return fail('Ratings are not set up yet. Ask an admin to run `/setup rating`.');

  const value = interaction.options.getInteger('stars');
  const comment = (interaction.options.getString('comment') || '').trim();
  const product = interaction.options.getString('product') || null;

  const target = await resolveSellerForItem(interaction.guildId, product, interaction.options.getUser('seller'));
  if (target.error) return fail(target.error);
  const sellerId = target.sellerId;
  if (sellerId && sellerId === interaction.user.id) return fail('You cannot rate yourself.');

  const recent = await Rating.findOne({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    product,
    sellerId,
    source: 'command',
    createdAt: { $gt: new Date(Date.now() - COOLDOWN_MS) },
  }).lean();
  if (recent) return fail(`You already rated ${product ? `**${truncate(product, 60)}**` : sellerId ? 'this seller' : 'the store'} in the last 24 hours. Thank you!`);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await saveRating(client, interaction.guildId, interaction.user, { stars: value, comment, product, sellerId, source: 'command' });
  return interaction.editReply({ embeds: [embeds.success(`Thank you for your ${stars(value)} rating! 💛`)] });
}

module.exports = { data, execute, autocomplete };
