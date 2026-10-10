const { SlashCommandBuilder, EmbedBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Announcement = require('../database/models/Announcement');
const { getGuildConfig } = require('../services/guildConfig');
const { getActor } = require('../services/sellers');
const { truncate, ts } = require('../utils/format');

const numberOption = (o) => o.setName('id').setDescription('Post number (see /announcement list)').setRequired(true).setAutocomplete(true);

const data = new SlashCommandBuilder()
  .setName('announcement')
  .setDescription('Edit or delete posts made with /post (staff: all posts, sellers: their own)')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s.setName('list').setDescription('List your posts (staff see all posts)'))
  .addSubcommand((s) =>
    s
      .setName('edit')
      .setDescription('Edit a post')
      .addIntegerOption(numberOption)
      .addStringOption((o) => o.setName('message').setDescription('New text (write \\n for a new line)').setMaxLength(4000))
      .addStringOption((o) => o.setName('title').setDescription('New title').setMaxLength(256))
      .addStringOption((o) => o.setName('color').setDescription('New embed color as hex, e.g. #FF0000').setMaxLength(7))
      .addStringOption((o) => o.setName('image-url').setDescription('New image link (https://...)').setMaxLength(500))
  )
  .addSubcommand((s) => s.setName('delete').setDescription('Delete a post').addIntegerOption(numberOption));

// Staff and admins manage every post, a seller only the posts they made themselves.
const scopeFor = (actor, guildId) => (actor.staff ? { guildId } : actor.seller ? { guildId, authorId: actor.userId } : null);

async function autocomplete(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const actor = await getActor(interaction, cfg);
  const scope = scopeFor(actor, interaction.guildId);
  if (!scope) return interaction.respond([]);
  const typed = String(interaction.options.getFocused()).toLowerCase();
  const rows = await Announcement.find(scope).sort({ number: -1 }).limit(100).lean();
  return interaction.respond(
    rows
      .map((a) => ({ name: truncate(`#${a.number} ${a.title || 'Untitled'} (${new Date(a.createdAt).toISOString().slice(0, 10)})`, 100), value: a.number }))
      .filter((c) => c.name.toLowerCase().includes(typed))
      .slice(0, 25)
  );
}

async function execute(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const actor = await getActor(interaction, cfg);
  const gid = interaction.guildId;
  const fail = (text) => interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });
  const scope = scopeFor(actor, gid);
  if (!scope) return fail('Only store staff and sellers can use this command.');
  const sub = interaction.options.getSubcommand();

  if (sub === 'list') {
    const rows = await Announcement.find(scope).sort({ number: -1 }).limit(20).lean();
    if (!rows.length) return interaction.reply({ embeds: [embeds.info('No posts yet. Make one with `/post`.')], flags: MessageFlags.Ephemeral });
    const lines = rows.map((a) => `**#${a.number}** ${truncate(a.title || 'Untitled', 50)} in <#${a.channelId}> ${ts(a.createdAt, 'R')}${actor.staff ? ` by <@${a.authorId}>` : ''}`);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.brand).setTitle('📣 Posts').setDescription(lines.join('\n'))],
      flags: MessageFlags.Ephemeral,
    });
  }

  const number = interaction.options.getInteger('id');
  const doc = await Announcement.findOne({ guildId: gid, number });
  if (!doc) return fail(`Post **#${number}** was not found.`);
  if (!actor.staff && doc.authorId !== interaction.user.id) return fail(`Post **#${number}** was made by someone else. You can only manage your own posts.`);

  const channel = await interaction.guild.channels.fetch(doc.channelId).catch(() => null);
  const msg = channel && channel.isTextBased() ? await channel.messages.fetch(doc.messageId).catch(() => null) : null;

  if (sub === 'delete') {
    if (msg) await msg.delete().catch(() => {});
    await doc.deleteOne();
    return interaction.reply({ embeds: [embeds.success(`Post **#${number}** was deleted.`)], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'edit') {
    if (!msg) {
      await doc.deleteOne();
      return fail(`The message of post **#${number}** no longer exists, so it was removed from the list.`);
    }
    if (!msg.embeds[0]) return fail('That message has no embed to edit.');
    const o = interaction.options;
    const colorInput = o.getString('color');
    const imageUrl = o.getString('image-url');
    if (colorInput && !/^#?[0-9a-f]{6}$/i.test(colorInput.trim())) return fail('`color` must be a hex code like `#FF0000`.');
    if (imageUrl && !embeds.isHttpUrl(imageUrl)) return fail('`image-url` must be a link that starts with https://');

    const embed = EmbedBuilder.from(msg.embeds[0]);
    const changes = [];
    if (o.getString('message')) { embed.setDescription(o.getString('message').replace(/\\n/g, '\n')); changes.push('message'); }
    if (o.getString('title')) { embed.setTitle(o.getString('title')); doc.title = o.getString('title'); changes.push('title'); }
    if (colorInput) { embed.setColor(embeds.parseColor(colorInput)); changes.push('color'); }
    if (imageUrl) { embed.setImage(imageUrl); changes.push('image'); }
    if (!changes.length) return fail('Nothing to change. Fill at least one option.');

    try {
      await msg.edit({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (err) {
      console.warn('[ANNOUNCEMENT] Could not edit:', err.message);
      return fail('I could not edit that message. I can only edit posts that I sent.');
    }
    await doc.save();
    return interaction.reply({ embeds: [embeds.success(`Post **#${number}** updated (${changes.join(', ')}): ${msg.url}`)], flags: MessageFlags.Ephemeral });
  }
}

module.exports = { data, execute, autocomplete };
