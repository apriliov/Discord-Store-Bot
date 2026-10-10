const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Rating = require('../database/models/Rating');
const Ticket = require('../database/models/Ticket');
const { getGuildConfig } = require('./guildConfig');
const { truncate, stars, pad } = require('../utils/format');

const STAR_LABELS = { 1: 'Very bad', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Excellent' };

function ratingEmbed({ user, rating, product }) {
  const embed = new EmbedBuilder()
    .setColor(rating.stars >= 4 ? config.colors.success : rating.stars === 3 ? config.colors.warn : config.colors.error)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(`${stars(rating.stars)}  ${rating.stars}/5 - ${STAR_LABELS[rating.stars]}`)
    .addFields({ name: 'Rated', value: product || 'The store', inline: true }, { name: 'By', value: `<@${user.id}>`, inline: true })
    .setTimestamp();
  if (rating.comment) embed.setDescription(`>>> ${truncate(rating.comment, 1500)}`);
  return embed;
}

// Saves a rating and posts it to the rating channel (if one is configured).
async function saveRating(client, guildId, user, { stars: value, comment = '', product = null, ticketId = null, source = 'command' }) {
  const rating = await Rating.create({ guildId, userId: user.id, stars: value, comment, product, ticketId, source });
  const cfg = await getGuildConfig(guildId);
  if (cfg.ratingChannelId) {
    const channel = await client.channels.fetch(cfg.ratingChannelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [ratingEmbed({ user, rating, product })] }).catch((err) => console.warn('[RATING] Could not post the rating:', err.message));
    }
  }
  return rating;
}

// DM sent when a ticket is closed: five star buttons.
async function sendRatingRequest(user, ticket, guild) {
  const row = new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder().setCustomId(`rt:${ticket._id}:${n}`).setLabel(String(n)).setEmoji('⭐').setStyle(n >= 4 ? ButtonStyle.Success : n === 3 ? ButtonStyle.Secondary : ButtonStyle.Danger)
    )
  );
  await user.send({
    embeds: [
      new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('How was your experience?')
        .setDescription(`Please rate the service you got in **${guild.name}** (ticket #${pad(ticket.number)}).\nPress a star button below. It only takes a few seconds!`),
    ],
    components: [row],
  });
}

async function handleInteraction(client, interaction) {
  const parts = interaction.customId.split(':'); // rt:<ticketId>:<stars>  |  rt:m:<ticketId>:<stars>

  if (interaction.isButton()) {
    const [, ticketId, starValue] = parts;
    const ticket = await Ticket.findById(ticketId).catch(() => null);
    if (!ticket || ticket.userId !== interaction.user.id) {
      return interaction.reply({ embeds: [embeds.error('This rating request is not for you.')], flags: MessageFlags.Ephemeral });
    }
    if (ticket.rated) return interaction.update({ embeds: [embeds.info('You already rated this ticket. Thank you! 💛')], components: [] });
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`rt:m:${ticketId}:${starValue}`)
        .setTitle(`Your rating: ${starValue}/5`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('comment').setLabel('Comment (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
          )
        )
    );
  }

  if (interaction.isModalSubmit() && parts[1] === 'm') {
    const [, , ticketId, starValue] = parts;
    const value = Number(starValue);
    const ticket = await Ticket.findById(ticketId).catch(() => null);
    const respond = (payload) => (interaction.isFromMessage() ? interaction.update(payload) : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }));

    if (!ticket || ticket.userId !== interaction.user.id || !(value >= 1 && value <= 5)) {
      return respond({ embeds: [embeds.error('This rating request is not valid.')], components: [] });
    }
    // Atomic guard so a double click cannot create two ratings.
    const claimed = await Ticket.findOneAndUpdate({ _id: ticket._id, rated: false }, { rated: true });
    if (!claimed) return respond({ embeds: [embeds.info('You already rated this ticket. Thank you! 💛')], components: [] });

    const comment = interaction.fields.getTextInputValue('comment').trim();
    await saveRating(client, ticket.guildId, interaction.user, {
      stars: value,
      comment,
      product: ticket.productName,
      ticketId: String(ticket._id),
      source: 'ticket',
    });
    return respond({ embeds: [embeds.success(`Thank you for your ${stars(value)} rating! Your feedback helps us improve.`)], components: [] });
  }
}

module.exports = { handleInteraction, sendRatingRequest, saveRating, ratingEmbed, STAR_LABELS };
