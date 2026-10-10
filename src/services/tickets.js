const {
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Ticket = require('../database/models/Ticket');
const Product = require('../database/models/Product');
const { getGuildConfig, nextCounter } = require('./guildConfig');
const { isStaff } = require('../utils/permissions');
const { ephemeral } = require('../utils/reply');
const { truncate, pad, slug, money, ts } = require('../utils/format');
const { fetchMessages, buildHtmlTranscript } = require('../utils/transcript');
const { sendRatingRequest } = require('./ratings');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEMBER_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];
const BOT_PERMS = [...MEMBER_PERMS, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages];

class TicketError extends Error {}

/* ------------------------------------------------------------------ UI */

function controls(claimedTag = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tk:close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('tk:claim')
      .setLabel(claimedTag ? `Claimed by ${truncate(claimedTag, 40)}` : 'Claim')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!!claimedTag)
  );
}

function ticketEmbed(ticket, cfg, product, claimedTag) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.brand)
    .setTitle(`🎫 Ticket #${pad(ticket.number)}`)
    .setDescription(
      `Hello <@${ticket.userId}>, thanks for contacting **${cfg.storeName || config.storeName}**!\n` +
        'A staff member will be with you shortly. Please share any extra details while you wait.'
    )
    .addFields({ name: 'Subject', value: truncate(ticket.subject, 1000), inline: true });
  if (ticket.sellerId) embed.addFields({ name: 'Seller', value: `<@${ticket.sellerId}>`, inline: true });

  if (product) {
    embed.addFields(
      { name: 'Product', value: `**${truncate(product.name, 200)}** (#${product.number})`, inline: true },
      { name: 'Price', value: money(cfg, product.price), inline: true }
    );
    if (product.imageUrl && /^https?:\/\//.test(product.imageUrl)) embed.setThumbnail(product.imageUrl);
  }
  if (ticket.details) embed.addFields({ name: 'Details', value: truncate(ticket.details, 1000) });
  embed.addFields({ name: 'Status', value: claimedTag ? `🙋 Claimed by ${claimedTag}` : '🟢 Waiting for staff', inline: true });
  return embed.setFooter({ text: 'Use the buttons below to claim or close this ticket.' }).setTimestamp();
}

/* ------------------------------------------------------------ open flow */

function openModal() {
  return new ModalBuilder()
    .setCustomId('tk:modal')
    .setTitle('Open a ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('What do you need? (product or topic)')
          .setPlaceholder('Example: I want to order Netflix Premium')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('details')
          .setLabel('Details (optional)')
          .setPlaceholder('Anything staff should know: quantity, payment method, questions...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(800)
      )
    );
}

async function createTicket(interaction, { subject, details = null, product = null }) {
  const guild = interaction.guild;
  const cfg = await getGuildConfig(guild.id);

  if (!cfg.ticketCategoryId || !cfg.staffRoleId) {
    throw new TicketError('The ticket system is not set up yet. Ask an admin to run `/setup ticket`.');
  }
  const category = await guild.channels.fetch(cfg.ticketCategoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new TicketError('The ticket category no longer exists. Ask an admin to run `/setup ticket` again.');
  }
  if (product && product.stock === 0) throw new TicketError(`**${product.name}** is out of stock right now.`);

  const open = await Ticket.find({ guildId: guild.id, userId: interaction.user.id, status: 'open' }).lean();
  const stillOpen = [];
  for (const t of open) {
    if (guild.channels.cache.has(t.channelId) || (await guild.channels.fetch(t.channelId).catch(() => null))) stillOpen.push(t);
    else await Ticket.updateOne({ _id: t._id }, { status: 'closed', closedAt: new Date(), closeReason: 'Channel missing' });
  }
  if (stillOpen.length >= (cfg.maxTickets || 1)) {
    throw new TicketError(`You already have an open ticket: <#${stillOpen[0].channelId}>. Please use it or close it first.`);
  }

  // The seller of the product can see and handle the ticket (not when they are the buyer themselves).
  let sellerId = null;
  if (product && product.sellerId && product.sellerId !== interaction.user.id) {
    const sellerMember = await guild.members.fetch(product.sellerId).catch(() => null);
    if (sellerMember) sellerId = sellerMember.id;
  }

  const number = await nextCounter(guild.id, 'ticketCounter');
  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${pad(number)}-${slug(interaction.user.username, 20) || 'user'}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Ticket #${pad(number)} | Owner: ${interaction.user.tag} (${interaction.user.id})`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: MEMBER_PERMS },
        { id: cfg.staffRoleId, allow: [...MEMBER_PERMS, PermissionFlagsBits.ManageMessages] },
        ...(sellerId ? [{ id: sellerId, allow: [...MEMBER_PERMS, PermissionFlagsBits.ManageMessages] }] : []),
        { id: guild.members.me.id, allow: BOT_PERMS },
      ],
    });
  } catch (err) {
    console.error('[TICKETS] Could not create the channel:', err.message);
    throw new TicketError('I could not create the ticket channel. Please make sure I have **Manage Channels** and **Manage Roles**.');
  }

  const ticket = await Ticket.create({
    guildId: guild.id,
    channelId: channel.id,
    number,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    sellerId,
    subject,
    details,
    productId: product ? String(product._id) : null,
    productName: product ? product.name : null,
  });

  const welcome = await channel.send({
    content: `<@${interaction.user.id}>${sellerId ? ` <@${sellerId}>` : ''} <@&${cfg.staffRoleId}>`,
    embeds: [ticketEmbed(ticket, cfg, product, null)],
    components: [controls()],
    allowedMentions: { users: sellerId ? [interaction.user.id, sellerId] : [interaction.user.id], roles: [cfg.staffRoleId] },
  });
  ticket.controlMessageId = welcome.id;
  await ticket.save();

  return channel;
}

async function startTicket(interaction, opts) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const channel = await createTicket(interaction, opts);
    await interaction.editReply({ embeds: [embeds.success(`Your ticket has been created: ${channel}`)] });
  } catch (err) {
    if (err instanceof TicketError) return interaction.editReply({ embeds: [embeds.error(err.message)] });
    throw err;
  }
}

/* ------------------------------------------------------------- closing */

async function findOpenTicket(channelId) {
  return Ticket.findOne({ channelId, status: 'open' });
}

async function closeTicket(client, guild, channel, ticket, { closedBy, reason = null }) {
  const cfg = await getGuildConfig(guild.id);

  ticket.status = 'closed';
  ticket.closedAt = new Date();
  ticket.closedBy = closedBy.id;
  ticket.closeReason = reason;
  await ticket.save();

  let claimedTag = null;
  if (ticket.claimedBy) {
    const m = await guild.members.fetch(ticket.claimedBy).catch(() => null);
    claimedTag = m ? m.user.tag : ticket.claimedBy;
  }

  const messages = await fetchMessages(channel);
  const html = buildHtmlTranscript({
    guildName: guild.name,
    ticket: { ...ticket.toObject(), claimedTag },
    messages,
    closedBy,
    reason,
  });
  const fileName = `transcript-ticket-${pad(ticket.number)}.html`;
  const makeFile = () => new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: fileName });

  const summary = new EmbedBuilder()
    .setColor(config.colors.neutral)
    .setTitle(`🔒 Ticket #${pad(ticket.number)} closed`)
    .addFields(
      { name: 'Opened by', value: `<@${ticket.userId}> (${ticket.userTag})`, inline: true },
      { name: 'Closed by', value: `<@${closedBy.id}>`, inline: true },
      { name: 'Claimed by', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Nobody', inline: true },
      { name: 'Seller', value: ticket.sellerId ? `<@${ticket.sellerId}>` : '—', inline: true },
      { name: 'Subject', value: truncate(ticket.subject, 500), inline: true },
      { name: 'Product', value: ticket.productName ? truncate(ticket.productName, 200) : '—', inline: true },
      { name: 'Opened', value: ts(ticket.createdAt, 'f'), inline: true },
      { name: 'Reason', value: truncate(reason || 'No reason given', 1000) }
    )
    .setTimestamp();

  if (cfg.ticketLogChannelId) {
    const logChannel = await guild.channels.fetch(cfg.ticketLogChannelId).catch(() => null);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send({ embeds: [summary], files: [makeFile()] }).catch((err) => console.warn('[TICKETS] Could not post the transcript:', err.message));
    }
  }

  const owner = await client.users.fetch(ticket.userId).catch(() => null);
  if (owner) {
    const dmOk = await owner
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.neutral)
            .setTitle(`Your ticket in ${guild.name} was closed`)
            .setDescription(`Ticket **#${pad(ticket.number)}** has been closed.\n**Reason:** ${truncate(reason || 'No reason given', 500)}\n\nA copy of the conversation is attached.`)
            .setTimestamp(),
        ],
        files: [makeFile()],
      })
      .then(() => true)
      .catch(() => false);
    if (dmOk) await sendRatingRequest(owner, ticket, guild).catch(() => {});
  }

  await channel.delete(`Ticket #${pad(ticket.number)} closed by ${closedBy.tag}`).catch((err) => console.warn('[TICKETS] Could not delete the channel:', err.message));
}

async function closeWithCountdown(interaction, ticket, reason) {
  await ephemeral(interaction, { embeds: [embeds.info('🔒 Closing this ticket in 5 seconds. The transcript will be saved.')] });
  await sleep(5000);
  await closeTicket(interaction.client, interaction.guild, interaction.channel, ticket, { closedBy: interaction.user, reason });
}

// Staff and the seller of the ticket can handle it (claim, add/remove members, rename).
async function canHandle(interaction, ticket) {
  if (ticket.sellerId && ticket.sellerId === interaction.user.id) return true;
  const cfg = await getGuildConfig(interaction.guildId);
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return isStaff(member, cfg);
}

async function canManage(interaction, ticket) {
  if (ticket.userId === interaction.user.id) return true;
  if (ticket.sellerId && ticket.sellerId === interaction.user.id) return true;
  const cfg = await getGuildConfig(interaction.guildId);
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return isStaff(member, cfg);
}

// Marks the ticket as claimed and refreshes the welcome message. Returns an error string or null.
async function claimTicket(interaction, ticket) {
  const cfg = await getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isStaff(member, cfg) && ticket.sellerId !== interaction.user.id) return 'Only staff or the seller of this ticket can claim it.';
  if (ticket.claimedBy) return `This ticket is already claimed by <@${ticket.claimedBy}>.`;

  ticket.claimedBy = interaction.user.id;
  await ticket.save();

  if (ticket.controlMessageId) {
    const product = ticket.productId ? await Product.findById(ticket.productId).lean().catch(() => null) : null;
    const msg = await interaction.channel.messages.fetch(ticket.controlMessageId).catch(() => null);
    if (msg) {
      await msg
        .edit({ embeds: [ticketEmbed(ticket, cfg, product, interaction.user.tag)], components: [controls(interaction.user.tag)] })
        .catch(() => {});
    }
  }
  return null;
}

/* ------------------------------------------------------- interactions */

async function handleInteraction(client, interaction) {
  const id = interaction.customId;

  if (id === 'tk:open') {
    if (!interaction.inGuild()) return;
    return interaction.showModal(openModal());
  }

  if (id === 'tk:modal' && interaction.isModalSubmit()) {
    const subject = interaction.fields.getTextInputValue('subject').trim();
    const details = interaction.fields.getTextInputValue('details').trim() || null;
    return startTicket(interaction, { subject, details });
  }

  if (!interaction.inGuild()) return;

  if (id === 'tk:claim') {
    const ticket = await findOpenTicket(interaction.channelId);
    if (!ticket) return ephemeral(interaction, { embeds: [embeds.error('This ticket is already closed.')] });
    const problem = await claimTicket(interaction, ticket);
    if (problem) return ephemeral(interaction, { embeds: [embeds.error(problem)] });
    return interaction.reply({ embeds: [embeds.info(`🙋 <@${interaction.user.id}> has claimed this ticket and will help you.`)] });
  }

  if (id === 'tk:close') {
    const ticket = await findOpenTicket(interaction.channelId);
    if (!ticket) return ephemeral(interaction, { embeds: [embeds.error('This ticket is already closed.')] });
    if (!(await canManage(interaction, ticket))) return ephemeral(interaction, { embeds: [embeds.error('Only staff or the ticket owner can close this ticket.')] });
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('tk:closemodal')
        .setTitle('Close ticket')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)
          )
        )
    );
  }

  if (id === 'tk:closemodal' && interaction.isModalSubmit()) {
    const ticket = await findOpenTicket(interaction.channelId);
    if (!ticket) return ephemeral(interaction, { embeds: [embeds.error('This ticket is already closed.')] });
    if (!(await canManage(interaction, ticket))) return ephemeral(interaction, { embeds: [embeds.error('Only staff or the ticket owner can close this ticket.')] });
    const reason = interaction.fields.getTextInputValue('reason').trim() || null;
    return closeWithCountdown(interaction, ticket, reason);
  }
}

module.exports = {
  handleInteraction,
  startTicket,
  findOpenTicket,
  closeWithCountdown,
  canManage,
  canHandle,
  claimTicket,
  controls,
  ticketEmbed,
};
