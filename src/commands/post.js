const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const { getGuildConfig, nextCounter } = require('../services/guildConfig');
const Announcement = require('../database/models/Announcement');
const { isAdmin, checkCanPost, TEXT_CHANNEL_TYPES } = require('../utils/permissions');
const { getActor } = require('../services/sellers');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const data = new SlashCommandBuilder()
  .setName('post')
  .setDescription('Post an announcement embed in a channel (staff and sellers)')
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((o) => o.setName('channel').setDescription('Channel to post in').addChannelTypes(...TEXT_CHANNEL_TYPES).setRequired(true))
  .addStringOption((o) => o.setName('message').setDescription('The text to post (write \\n for a new line)').setRequired(true).setMaxLength(4000))
  .addStringOption((o) => o.setName('title').setDescription('Optional title').setMaxLength(256))
  .addStringOption((o) => o.setName('color').setDescription('Optional embed color as hex, e.g. #FF0000').setMaxLength(7))
  .addAttachmentOption((o) => o.setName('image').setDescription('Optional image to show in the post'))
  .addStringOption((o) => o.setName('image-url').setDescription('Optional image link (https://...) instead of an upload').setMaxLength(500));

async function execute(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const fail = (text) => interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });
  const actor = await getActor(interaction, cfg);
  if (!actor.staff && !actor.seller) return fail('Only store staff and sellers can use this command.');

  const channel = interaction.options.getChannel('channel');
  const problem = checkCanPost(interaction.guild, channel);
  if (problem) return fail(problem);

  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!isAdmin(member) && !channel.permissionsFor(member)?.has(needed)) return fail('You do not have permission to send messages in that channel.');

  const colorInput = interaction.options.getString('color');
  if (colorInput && !/^#?[0-9a-f]{6}$/i.test(colorInput.trim())) return fail('`color` must be a hex code like `#FF0000`.');

  const image = interaction.options.getAttachment('image');
  const imageUrl = interaction.options.getString('image-url');
  if (image && !(image.contentType || '').startsWith('image/')) return fail('The attachment must be an image (png, jpg, gif, webp).');
  if (image && image.size > MAX_IMAGE_BYTES) return fail('The image is too large. Max size is 8 MB.');
  if (imageUrl && !embeds.isHttpUrl(imageUrl)) return fail('`image-url` must be a link that starts with https://');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const embed = new EmbedBuilder()
    .setColor(embeds.parseColor(colorInput, config.colors.brand))
    .setDescription(interaction.options.getString('message').replace(/\\n/g, '\n'));
  const title = interaction.options.getString('title');
  if (title) embed.setTitle(title);
  // Posts made by a seller (not staff) show who posted them, so buyers know which shop it is from.
  if (!actor.staff && actor.seller) embed.setFooter({ text: `Posted by ${actor.seller.displayName || interaction.user.username}` });

  const files = [];
  if (image) {
    try {
      const res = await fetch(image.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const name = (image.name || 'image.png').replace(/[^\w.-]/g, '_');
      files.push(new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name }));
      embed.setImage(`attachment://${name}`);
    } catch (err) {
      console.warn('[POST] Could not copy the image:', err.message);
      return interaction.editReply({ embeds: [embeds.error('I could not download that image. Please try again.')] });
    }
  } else if (imageUrl) {
    embed.setImage(imageUrl);
  }

  try {
    const sent = await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
    const number = await nextCounter(interaction.guildId, 'announcementCounter');
    await Announcement.create({ guildId: interaction.guildId, number, authorId: interaction.user.id, channelId: channel.id, messageId: sent.id, title: title || null });
    return interaction.editReply({ embeds: [embeds.success(`Posted in ${channel}: ${sent.url}\nPost number: **#${number}**. Use \`/announcement edit\` or \`/announcement delete\` to change it later.`)] });
  } catch (err) {
    console.warn('[POST] Could not post:', err.message);
    return interaction.editReply({ embeds: [embeds.error(`I could not post in ${channel}. Please check my permissions there.`)] });
  }
}

module.exports = { data, execute };
