const { SlashCommandBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const embeds = require('../utils/embeds');
const { getGuildConfig } = require('../services/guildConfig');
const { findOpenTicket, closeWithCountdown, canManage, claimTicket } = require('../services/tickets');
const { requireStaff } = require('../utils/permissions');
const { slug } = require('../utils/format');

const MEMBER_PERMS = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  AttachFiles: true,
  EmbedLinks: true,
};

const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Manage the ticket you are in')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('close')
      .setDescription('Close this ticket and save the transcript')
      .addStringOption((o) => o.setName('reason').setDescription('Why the ticket is being closed').setMaxLength(300))
  )
  .addSubcommand((s) => s.setName('claim').setDescription('Claim this ticket (staff)'))
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Add a member to this ticket (staff)')
      .addUserOption((o) => o.setName('user').setDescription('Member to add').setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Remove a member from this ticket (staff)')
      .addUserOption((o) => o.setName('user').setDescription('Member to remove').setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('rename')
      .setDescription('Rename this ticket channel (staff)')
      .addStringOption((o) => o.setName('name').setDescription('New channel name').setRequired(true).setMaxLength(80))
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const fail = (text) => interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });

  const ticket = await findOpenTicket(interaction.channelId);
  if (!ticket) return fail('This command only works inside an open ticket channel.');

  if (sub === 'close') {
    if (!(await canManage(interaction, ticket))) return fail('Only staff or the ticket owner can close this ticket.');
    return closeWithCountdown(interaction, ticket, interaction.options.getString('reason'));
  }

  const cfg = await getGuildConfig(interaction.guildId);
  if (!(await requireStaff(interaction, cfg))) return;

  if (sub === 'claim') {
    const problem = await claimTicket(interaction, ticket);
    if (problem) return fail(problem);
    return interaction.reply({ embeds: [embeds.info(`🙋 <@${interaction.user.id}> has claimed this ticket and will help you.`)] });
  }

  if (sub === 'add') {
    const user = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return fail('That user is not in this server.');
    await interaction.channel.permissionOverwrites.edit(member, MEMBER_PERMS);
    return interaction.reply({ embeds: [embeds.success(`${member} was added to this ticket.`)] });
  }

  if (sub === 'remove') {
    const user = interaction.options.getUser('user');
    if (user.id === ticket.userId) return fail('You cannot remove the ticket owner. Close the ticket instead.');
    if (user.id === interaction.client.user.id) return fail('I cannot remove myself.');
    await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
    return interaction.reply({ embeds: [embeds.success(`<@${user.id}> was removed from this ticket.`)] });
  }

  if (sub === 'rename') {
    const name = slug(interaction.options.getString('name'), 80);
    if (!name) return fail('Please use letters or numbers in the name.');
    await interaction.deferReply();
    // Channel renames are rate limited by Discord (2 per 10 minutes), so do not wait forever.
    const done = await Promise.race([
      interaction.channel.setName(name).then(() => true),
      new Promise((r) => setTimeout(() => r(false), 8000)),
    ]).catch(() => false);
    return interaction.editReply({ embeds: [done ? embeds.success(`Ticket renamed to **${name}**.`) : embeds.error('Discord is rate limiting channel renames. Try again in a few minutes.')] });
  }
}

module.exports = { data, execute };
