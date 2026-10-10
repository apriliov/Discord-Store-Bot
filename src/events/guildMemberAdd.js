const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getGuildConfig } = require('../services/guildConfig');
const { ts } = require('../utils/format');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(client, member) {
    const cfg = await getGuildConfig(member.guild.id);

    if (cfg.unverifiedRoleId && !member.user.bot) {
      await member.roles.add(cfg.unverifiedRoleId, 'Unverified role on join').catch((err) => console.warn('[JOIN] Could not give the unverified role:', err.message));
    }

    if (!cfg.joinLeaveChannelId) return;
    const channel = await member.guild.channels.fetch(cfg.joinLeaveChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setAuthor({ name: 'Member joined', iconURL: member.user.displayAvatarURL() })
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(`${member} **${member.user.tag}** joined the server.`)
      .addFields(
        { name: 'Account created', value: `${ts(member.user.createdAt, 'D')} (${ts(member.user.createdAt, 'R')})`, inline: true },
        { name: 'Member count', value: `**${member.guild.memberCount}**`, inline: true },
        { name: 'User ID', value: `\`${member.id}\``, inline: true }
      )
      .setTimestamp();
    if (ageDays < 7) embed.addFields({ name: '⚠️ New account', value: `This account is only **${ageDays}** day(s) old.` });
    if (member.user.bot) embed.setFooter({ text: 'This is a bot account' });

    await channel.send({ embeds: [embed] }).catch((err) => console.warn('[JOIN] Could not post the log:', err.message));
  },
};
