const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Product = require('../database/models/Product');
const Testimonial = require('../database/models/Testimonial');
const { getGuildConfig, nextCounter } = require('../services/guildConfig');
const { isAdmin, isStaff } = require('../utils/permissions');
const { truncate, pad } = require('../utils/format');

const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const data = new SlashCommandBuilder()
  .setName('testimonial')
  .setDescription('Share your experience with the store')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('submit')
      .setDescription('Post a testimonial about something you bought')
      .addStringOption((o) => o.setName('product').setDescription('What did you buy?').setRequired(true).setMaxLength(80).setAutocomplete(true))
      .addStringOption((o) => o.setName('message').setDescription('Tell us about your experience').setRequired(true).setMinLength(5).setMaxLength(1000))
      .addAttachmentOption((o) => o.setName('image').setDescription('Optional proof or screenshot'))
  )
  .addSubcommand((s) =>
    s
      .setName('delete')
      .setDescription('Delete a testimonial (staff)')
      .addIntegerOption((o) => o.setName('number').setDescription('Testimonial number, shown in its footer').setRequired(true).setMinValue(1))
  );

async function autocomplete(interaction) {
  const typed = String(interaction.options.getFocused()).toLowerCase();
  const products = await Product.find({ guildId: interaction.guildId }).sort({ number: 1 }).limit(200).lean();
  return interaction.respond(
    products.filter((p) => p.name.toLowerCase().includes(typed)).slice(0, 25).map((p) => ({ name: truncate(p.name, 100), value: truncate(p.name, 80) }))
  );
}

async function execute(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const sub = interaction.options.getSubcommand();
  const fail = (text) => interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (sub === 'delete') {
    if (!isStaff(member, cfg)) return fail('Only store staff can delete testimonials.');
    const number = interaction.options.getInteger('number');
    const doc = await Testimonial.findOne({ guildId: interaction.guildId, number });
    if (!doc) return fail(`Testimonial **#${number}** was not found.`);
    if (doc.channelId && doc.messageId) {
      const channel = await interaction.guild.channels.fetch(doc.channelId).catch(() => null);
      const msg = channel && channel.isTextBased() ? await channel.messages.fetch(doc.messageId).catch(() => null) : null;
      if (msg) await msg.delete().catch(() => {});
    }
    await doc.deleteOne();
    return interaction.reply({ embeds: [embeds.success(`Testimonial **#${number}** was deleted.`)], flags: MessageFlags.Ephemeral });
  }

  if (!cfg.testimonialChannelId) return fail('Testimonials are not set up yet. Ask an admin to run `/setup testimonial`.');
  const channel = await interaction.guild.channels.fetch(cfg.testimonialChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return fail('The testimonial channel no longer exists. Ask an admin to run `/setup testimonial` again.');

  if (cfg.testimonialCustomersOnly && !isAdmin(member)) {
    if (!cfg.customerRoleId) return fail('Customer-only testimonials are on but no customer role is set. Ask an admin to run `/setup customer`.');
    if (!member.roles.cache.has(cfg.customerRoleId)) return fail(`Only customers can post testimonials. Buy something first and staff will give you <@&${cfg.customerRoleId}>!`);
  }

  const recent = await Testimonial.findOne({ guildId: interaction.guildId, userId: interaction.user.id, createdAt: { $gt: new Date(Date.now() - COOLDOWN_MS) } }).lean();
  if (recent) return fail('You posted a testimonial a moment ago. Please wait a few minutes before posting another one.');

  const image = interaction.options.getAttachment('image');
  if (image && !(image.contentType || '').startsWith('image/')) return fail('The attachment must be an image (png, jpg, gif, webp).');
  if (image && image.size > MAX_IMAGE_BYTES) return fail('The image is too large. Max size is 8 MB.');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const product = interaction.options.getString('product');
  const message = interaction.options.getString('message');
  const number = await nextCounter(interaction.guildId, 'testimonialCounter');

  const embed = new EmbedBuilder()
    .setColor(config.colors.gold)
    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setTitle('💬 New Testimonial')
    .setDescription(`>>> ${message}`)
    .addFields({ name: '🛍️ Product', value: truncate(product, 200), inline: true }, { name: '👤 Customer', value: `${interaction.user}`, inline: true })
    .setFooter({ text: `Testimonial #${pad(number)} • ${cfg.storeName || config.storeName}` })
    .setTimestamp();

  // Re-upload the picture so it stays visible after Discord's attachment link expires.
  const files = [];
  if (image) {
    try {
      const res = await fetch(image.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const name = (image.name || 'proof.png').replace(/[^\w.-]/g, '_');
      files.push(new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name }));
      embed.setImage(`attachment://${name}`);
    } catch (err) {
      console.warn('[TESTIMONIAL] Could not copy the image:', err.message);
    }
  }

  let posted;
  try {
    posted = await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
  } catch (err) {
    console.warn('[TESTIMONIAL] Could not post:', err.message);
    return interaction.editReply({ embeds: [embeds.error('I could not post in the testimonial channel. Please tell an admin to check my permissions there.')] });
  }

  await Testimonial.create({ guildId: interaction.guildId, number, userId: interaction.user.id, product, message, messageId: posted.id, channelId: channel.id });
  await posted.react('💛').catch(() => {});
  return interaction.editReply({ embeds: [embeds.success(`Thank you! Your testimonial was posted in ${channel}.`)] });
}

module.exports = { data, execute, autocomplete };
