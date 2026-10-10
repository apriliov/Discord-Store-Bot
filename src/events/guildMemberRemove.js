const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getGuildConfig } = require('../services/guildConfig');
const { ts, truncate } = require('../utils/format');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(client, member) {
    const cfg = await getGuildConfig(member.guild.id);
    if (!cfg.joinLeaveChannelId) return;
    const channel = await member.guild.channels.fetch(cfg.joinLeaveChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const roles = member.roles && member.roles.cache ? [...member.roles.cache.values()].filter((r) => r.id !== member.guild.id) : [];
    const embed = new EmbedBuilder()
      .setColor(config.colors.error)
      .setAuthor({ name: 'Member left', iconURL: member.user.displayAvatarURL() })
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(`**${member.user.tag}** left the server.`)
      .addFields(
        { name: 'Joined', value: member.joinedAt ? `${ts(member.joinedAt, 'D')} (${ts(member.joinedAt, 'R')})` : 'Unknown', inline: true },
        { name: 'Member count', value: `**${member.guild.memberCount}**`, inline: true },
        { name: 'User ID', value: `\`${member.id}\``, inline: true }
      )
      .setTimestamp();
    if (roles.length) embed.addFields({ name: `Roles (${roles.length})`, value: truncate(roles.map((r) => `<@&${r.id}>`).join(' '), 1000) });

    await channel.send({ embeds: [embed] }).catch((err) => console.warn('[LEAVE] Could not post the log:', err.message));
  },
};
