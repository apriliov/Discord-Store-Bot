const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const crypto = require('node:crypto');
const embeds = require('../utils/embeds');
const { getGuildConfig } = require('./guildConfig');
const { ephemeral } = require('../utils/reply');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL = 2 * 60 * 1000;
const MAX_TRIES = 3;
const pending = new Map(); // `${guildId}:${userId}` -> { code, expires, tries }

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pending) if (value.expires < now) pending.delete(key);
}, 60 * 1000).unref();

const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');

async function grant(interaction, cfg) {
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id);
  const role = await interaction.guild.roles.fetch(cfg.verifiedRoleId).catch(() => null);
  if (!role) return ephemeral(interaction, { embeds: [embeds.error('The verified role no longer exists. Please tell an admin.')] });

  try {
    await member.roles.add(role, 'Passed verification');
    if (cfg.unverifiedRoleId && member.roles.cache.has(cfg.unverifiedRoleId)) {
      await member.roles.remove(cfg.unverifiedRoleId, 'Passed verification').catch(() => {});
    }
  } catch (err) {
    console.warn('[VERIFY] Could not give the role:', err.message);
    return ephemeral(interaction, {
      embeds: [embeds.error('I could not give you the role. Please tell an admin to move my role **above** the verified role.')],
    });
  }
  return ephemeral(interaction, { embeds: [embeds.success(`You are verified! Welcome to **${interaction.guild.name}** 🎉`)], components: [] });
}

async function handleInteraction(client, interaction) {
  if (!interaction.inGuild()) return;
  const cfg = await getGuildConfig(interaction.guildId);
  const id = interaction.customId;
  const key = `${interaction.guildId}:${interaction.user.id}`;

  if (!cfg.verifiedRoleId) {
    return ephemeral(interaction, { embeds: [embeds.error('Verification is not set up yet. Please tell an admin to run `/setup verification`.')] });
  }

  if (id === 'vf:verify') {
    const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(cfg.verifiedRoleId)) {
      return ephemeral(interaction, { embeds: [embeds.info('You are already verified. ✅')] });
    }
    if (cfg.verifyMode !== 'captcha') {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return grant(interaction, cfg);
    }

    const code = makeCode();
    pending.set(key, { code, expires: Date.now() + CODE_TTL, tries: 0 });
    return ephemeral(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🔐 Captcha')
          .setDescription(`Press **Enter code** and type this code:\n\n# \`${code.split('').join(' ')}\`\n\nThe code expires in 2 minutes.`),
      ],
      components: [
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('vf:enter').setLabel('Enter code').setEmoji('⌨️').setStyle(ButtonStyle.Primary)),
      ],
    });
  }

  if (id === 'vf:enter') {
    if (!pending.has(key)) return interaction.update({ embeds: [embeds.error('This captcha expired. Press **Verify** again.')], components: [] });
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('vf:modal')
        .setTitle('Verification')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('code').setLabel('Type the code you were shown').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(5).setMaxLength(5)
          )
        )
    );
  }

  if (id === 'vf:modal' && interaction.isModalSubmit()) {
    const entry = pending.get(key);
    if (!entry || entry.expires < Date.now()) {
      pending.delete(key);
      return ephemeral(interaction, { embeds: [embeds.error('This captcha expired. Press **Verify** again.')] });
    }
    const typed = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    if (typed !== entry.code) {
      entry.tries += 1;
      if (entry.tries >= MAX_TRIES) {
        pending.delete(key);
        return ephemeral(interaction, { embeds: [embeds.error('Too many wrong attempts. Press **Verify** to get a new code.')] });
      }
      return ephemeral(interaction, { embeds: [embeds.error(`Wrong code. You have ${MAX_TRIES - entry.tries} attempt(s) left.`)] });
    }
    pending.delete(key);
    return grant(interaction, cfg);
  }
}

module.exports = { handleInteraction };
