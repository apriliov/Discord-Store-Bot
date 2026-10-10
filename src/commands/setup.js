const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const { getGuildConfig, updateGuildConfig } = require('../services/guildConfig');
const { requireAdmin, TEXT_CHANNEL_TYPES } = require('../utils/permissions');

const textChannel = (o, name, desc, required = true) =>
  o.setName(name).setDescription(desc).addChannelTypes(...TEXT_CHANNEL_TYPES).setRequired(required);

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure the store bot for this server')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('ticket')
      .setDescription('Set up the ticket system')
      .addChannelOption((o) => o.setName('category').setDescription('Category where ticket channels are created').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addRoleOption((o) => o.setName('staff-role').setDescription('Role that can see and manage tickets').setRequired(true))
      .addChannelOption((o) => textChannel(o, 'transcript-channel', 'Channel where closed-ticket transcripts are sent', false))
      .addIntegerOption((o) => o.setName('max-tickets').setDescription('Max open tickets per member (default 1)').setMinValue(1).setMaxValue(5))
  )
  .addSubcommand((s) =>
    s
      .setName('verification')
      .setDescription('Set up member verification')
      .addRoleOption((o) => o.setName('verified-role').setDescription('Role given after verifying').setRequired(true))
      .addRoleOption((o) => o.setName('unverified-role').setDescription('Role given on join and removed after verifying'))
      .addStringOption((o) =>
        o.setName('mode').setDescription('How members verify (default: button)').addChoices({ name: 'Button (one click)', value: 'button' }, { name: 'Captcha (type a code)', value: 'captcha' })
      )
  )
  .addSubcommand((s) =>
    s
      .setName('joinleave')
      .setDescription('Set the join/leave log channel')
      .addChannelOption((o) => textChannel(o, 'channel', 'Channel for join and leave logs'))
  )
  .addSubcommand((s) =>
    s
      .setName('customer')
      .setDescription('Set the customer role')
      .addRoleOption((o) => o.setName('role').setDescription('Role given to customers').setRequired(true))
      .addChannelOption((o) => textChannel(o, 'log-channel', 'Channel that announces new customers', false))
  )
  .addSubcommand((s) =>
    s
      .setName('testimonial')
      .setDescription('Set up testimonials')
      .addChannelOption((o) => textChannel(o, 'channel', 'Channel where testimonials are posted'))
      .addBooleanOption((o) => o.setName('customers-only').setDescription('Only members with the customer role can post (default: true)'))
  )
  .addSubcommand((s) =>
    s
      .setName('rating')
      .setDescription('Set the channel where ratings are posted')
      .addChannelOption((o) => textChannel(o, 'channel', 'Channel for ratings'))
  )
  .addSubcommand((s) =>
    s
      .setName('store')
      .setDescription('Set the store name and currency')
      .addStringOption((o) => o.setName('name').setDescription('Store name shown on embeds').setMaxLength(60))
      .addStringOption((o) => o.setName('currency').setDescription('Currency symbol or code, e.g. Rp, $, USD').setMaxLength(8))
  )
  .addSubcommand((s) => s.setName('view').setDescription('Show the current configuration'));

const mention = (kind, id) => (id ? (kind === 'role' ? `<@&${id}>` : `<#${id}>`) : '`Not set`');

async function execute(interaction) {
  if (!(await requireAdmin(interaction))) return;
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;
  const reply = (embed) => interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  switch (sub) {
    case 'ticket': {
      const category = interaction.options.getChannel('category');
      const role = interaction.options.getRole('staff-role');
      const transcript = interaction.options.getChannel('transcript-channel');
      const max = interaction.options.getInteger('max-tickets');
      await updateGuildConfig(gid, {
        ticketCategoryId: category.id,
        staffRoleId: role.id,
        ...(transcript ? { ticketLogChannelId: transcript.id } : {}),
        ...(max ? { maxTickets: max } : {}),
      });
      return reply(embeds.success(`Tickets will be created in **${category.name}** and managed by ${role}.${transcript ? `\nTranscripts go to ${transcript}.` : ''}\nNext: \`/panel ticket\` to post the ticket panel.`));
    }
    case 'verification': {
      const role = interaction.options.getRole('verified-role');
      const unverified = interaction.options.getRole('unverified-role');
      const mode = interaction.options.getString('mode') || 'button';
      if (role.managed || role.id === interaction.guild.id) return reply(embeds.error('That role cannot be given to members.'));
      await updateGuildConfig(gid, { verifiedRoleId: role.id, unverifiedRoleId: unverified ? unverified.id : null, verifyMode: mode });
      return reply(embeds.success(`Members get ${role} after verifying (${mode} mode).${unverified ? `\nNew members get ${unverified} on join.` : ''}\nNext: \`/panel verify\` to post the verification panel.`));
    }
    case 'joinleave': {
      const channel = interaction.options.getChannel('channel');
      await updateGuildConfig(gid, { joinLeaveChannelId: channel.id });
      return reply(embeds.success(`Join and leave logs will be sent to ${channel}.`));
    }
    case 'customer': {
      const role = interaction.options.getRole('role');
      const log = interaction.options.getChannel('log-channel');
      if (role.managed || role.id === interaction.guild.id) return reply(embeds.error('That role cannot be given to members.'));
      await updateGuildConfig(gid, { customerRoleId: role.id, ...(log ? { customerLogChannelId: log.id } : {}) });
      return reply(embeds.success(`Customers will receive ${role}.${log ? `\nNew customers are announced in ${log}.` : ''}`));
    }
    case 'testimonial': {
      const channel = interaction.options.getChannel('channel');
      const only = interaction.options.getBoolean('customers-only');
      await updateGuildConfig(gid, { testimonialChannelId: channel.id, ...(only !== null ? { testimonialCustomersOnly: only } : {}) });
      return reply(embeds.success(`Testimonials will be posted in ${channel}.${only === false ? '\nEveryone can post testimonials.' : '\nOnly customers can post testimonials.'}`));
    }
    case 'rating': {
      const channel = interaction.options.getChannel('channel');
      await updateGuildConfig(gid, { ratingChannelId: channel.id });
      return reply(embeds.success(`Ratings will be posted in ${channel}.`));
    }
    case 'store': {
      const name = interaction.options.getString('name');
      const currency = interaction.options.getString('currency');
      if (!name && !currency) return reply(embeds.error('Give at least a `name` or a `currency`.'));
      await updateGuildConfig(gid, { ...(name ? { storeName: name } : {}), ...(currency ? { currency } : {}) });
      return reply(embeds.success(`Store updated.${name ? `\nName: **${name}**` : ''}${currency ? `\nCurrency: **${currency}**` : ''}`));
    }
    case 'view': {
      const c = await getGuildConfig(gid);
      const embed = new EmbedBuilder()
        .setColor(config.colors.brand)
        .setTitle('⚙️ Store configuration')
        .addFields(
          { name: '🏪 Store', value: `Name: **${c.storeName || config.storeName}**\nCurrency: **${c.currency}**`, inline: true },
          { name: '🎫 Tickets', value: `Category: ${mention('channel', c.ticketCategoryId)}\nStaff role: ${mention('role', c.staffRoleId)}\nTranscripts: ${mention('channel', c.ticketLogChannelId)}\nMax per member: **${c.maxTickets}**`, inline: true },
          { name: '✅ Verification', value: `Verified role: ${mention('role', c.verifiedRoleId)}\nUnverified role: ${mention('role', c.unverifiedRoleId)}\nMode: **${c.verifyMode}**`, inline: true },
          { name: '📥 Join/Leave log', value: mention('channel', c.joinLeaveChannelId), inline: true },
          { name: '🛒 Customers', value: `Role: ${mention('role', c.customerRoleId)}\nAnnounce: ${mention('channel', c.customerLogChannelId)}`, inline: true },
          { name: '💬 Testimonials', value: `Channel: ${mention('channel', c.testimonialChannelId)}\nCustomers only: **${c.testimonialCustomersOnly ? 'yes' : 'no'}**`, inline: true },
          { name: '⭐ Ratings', value: mention('channel', c.ratingChannelId), inline: true }
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = { data, execute };
