const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const { getGuildConfig } = require('../services/guildConfig');
const { requireAdmin, checkCanPost, TEXT_CHANNEL_TYPES } = require('../utils/permissions');

const common = (s, what) =>
  s
    .addChannelOption((o) => o.setName('channel').setDescription(`Channel to post the ${what} panel in`).addChannelTypes(...TEXT_CHANNEL_TYPES).setRequired(true))
    .addStringOption((o) => o.setName('title').setDescription('Custom panel title').setMaxLength(100))
    .addStringOption((o) => o.setName('description').setDescription('Custom panel text').setMaxLength(1500))
    .addStringOption((o) => o.setName('color').setDescription('Embed color as hex, e.g. #5865F2').setMaxLength(7))
    .addStringOption((o) => o.setName('image').setDescription('Banner image URL (https://...)').setMaxLength(500));

const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Post a store panel in a channel')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => common(s.setName('ticket').setDescription('Post the ticket panel'), 'ticket'))
  .addSubcommand((s) => common(s.setName('verify').setDescription('Post the verification panel'), 'verification'))
  .addSubcommand((s) => common(s.setName('catalog').setDescription('Post the product catalog panel'), 'catalog'));

async function execute(interaction) {
  if (!(await requireAdmin(interaction))) return;
  const sub = interaction.options.getSubcommand();
  const cfg = await getGuildConfig(interaction.guildId);
  const channel = interaction.options.getChannel('channel');
  const fail = (text) => interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });

  const problem = checkCanPost(interaction.guild, channel);
  if (problem) return fail(problem);

  const store = cfg.storeName || config.storeName;
  const presets = {
    ticket: {
      needs: !cfg.ticketCategoryId || !cfg.staffRoleId ? 'Run `/setup ticket` first.' : null,
      title: '🎫 Open a Ticket',
      description: `Want to order something or need help from **${store}**?\nPress the button below and our team will be with you shortly.\n\n> 🛒 Orders & purchases\n> ❓ Questions & support\n> 💳 Payment help`,
      button: new ButtonBuilder().setCustomId('tk:open').setLabel('Open Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
      color: config.colors.brand,
    },
    verify: {
      needs: !cfg.verifiedRoleId ? 'Run `/setup verification` first.' : null,
      title: '✅ Verification',
      description: `Welcome to **${interaction.guild.name}**!\nPress the button below to verify yourself and unlock the rest of the server.`,
      button: new ButtonBuilder().setCustomId('vf:verify').setLabel('Verify').setEmoji('✅').setStyle(ButtonStyle.Success),
      color: config.colors.success,
    },
    catalog: {
      needs: null,
      title: `🛍️ ${store} - Product Catalog`,
      description: 'Browse everything we sell. Press the button below to see our products, prices and stock, then order with one click.',
      button: new ButtonBuilder().setCustomId('ct:open').setLabel('View Catalog').setEmoji('🛍️').setStyle(ButtonStyle.Primary),
      color: config.colors.gold,
    },
  };
  const preset = presets[sub];
  if (preset.needs) return fail(preset.needs);

  const embed = new EmbedBuilder()
    .setColor(embeds.parseColor(interaction.options.getString('color'), preset.color))
    .setTitle(interaction.options.getString('title') || preset.title)
    .setDescription(interaction.options.getString('description') || preset.description)
    .setFooter({ text: store });
  const image = interaction.options.getString('image');
  if (image && embeds.isHttpUrl(image)) embed.setImage(image);

  await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(preset.button)] });
  return interaction.reply({ embeds: [embeds.success(`The ${sub} panel was posted in ${channel}.`)], flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute };
