const { PermissionFlagsBits, ChannelType } = require('discord.js');

function isAdmin(member) {
  if (!member) return false;
  return (
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function isStaff(member, cfg) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  return !!(cfg && cfg.staffRoleId && member.roles.cache.has(cfg.staffRoleId));
}

// Returns an error string when the bot cannot post in the channel, otherwise null.
function checkCanPost(guild, channel) {
  if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased() || channel.isDMBased()) {
    return 'That is not a text channel I can post in.';
  }
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
  if (!channel.permissionsFor(guild.members.me)?.has(needed)) {
    return `I need **View Channel**, **Send Messages** and **Embed Links** in ${channel}.`;
  }
  return null;
}

const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const { MessageFlags } = require('discord.js');
const { error } = require('./embeds');

async function requireAdmin(interaction) {
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (isAdmin(member)) return true;
  await interaction.reply({ embeds: [error('You need the **Manage Server** permission to use this command.')], flags: MessageFlags.Ephemeral });
  return false;
}

async function requireStaff(interaction, cfg) {
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (isStaff(member, cfg)) return true;
  await interaction.reply({ embeds: [error('Only store staff can use this command.')], flags: MessageFlags.Ephemeral });
  return false;
}

module.exports = { isAdmin, isStaff, checkCanPost, requireAdmin, requireStaff, TEXT_CHANNEL_TYPES };
