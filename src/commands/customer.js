const { SlashCommandBuilder, EmbedBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Customer = require('../database/models/Customer');
const Product = require('../database/models/Product');
const { getGuildConfig } = require('../services/guildConfig');
const { requireStaff } = require('../utils/permissions');
const { ts, truncate } = require('../utils/format');

const productOption = (o) => o.setName('product').setDescription('Product that was bought').setAutocomplete(true).setMaxLength(80);

const data = new SlashCommandBuilder()
  .setName('customer')
  .setDescription('Manage customers and the customer role (staff)')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Give a member the customer role after a purchase')
      .addUserOption((o) => o.setName('user').setDescription('The buyer').setRequired(true))
      .addStringOption(productOption)
      .addStringOption((o) => o.setName('note').setDescription('Optional note, e.g. order ID').setMaxLength(200))
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Remove the customer role from a member')
      .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('info')
      .setDescription('Show the purchase history summary of a member')
      .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true))
  )
  .addSubcommand((s) => s.setName('top').setDescription('Show the top customers'));

async function autocomplete(interaction) {
  const typed = String(interaction.options.getFocused()).toLowerCase();
  const products = await Product.find({ guildId: interaction.guildId }).sort({ number: 1 }).limit(200).lean();
  return interaction.respond(
    products.filter((p) => p.name.toLowerCase().includes(typed)).slice(0, 25).map((p) => ({ name: truncate(p.name, 100), value: truncate(p.name, 80) }))
  );
}

async function execute(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  if (!(await requireStaff(interaction, cfg))) return;
  const sub = interaction.options.getSubcommand();
  const reply = (embed, extra = {}) => interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, ...extra });

  if (sub === 'top') {
    const top = await Customer.find({ guildId: interaction.guildId }).sort({ purchases: -1, lastPurchaseAt: -1 }).limit(10).lean();
    if (!top.length) return reply(embeds.info('No customers recorded yet. Use `/customer add` after a sale.'));
    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((c, i) => `${medals[i] || `**${i + 1}.**`} <@${c.userId}> - **${c.purchases}** purchase${c.purchases === 1 ? '' : 's'}`);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.gold).setTitle('🏆 Top customers').setDescription(lines.join('\n'))],
      flags: MessageFlags.Ephemeral,
    });
  }

  const user = interaction.options.getUser('user');

  if (sub === 'info') {
    const rec = await Customer.findOne({ guildId: interaction.guildId, userId: user.id }).lean();
    if (!rec) return reply(embeds.info(`${user} has no recorded purchases.`));
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.brand)
          .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
          .setTitle('🛒 Customer info')
          .addFields(
            { name: 'Purchases', value: String(rec.purchases), inline: true },
            { name: 'Last product', value: rec.lastProduct || '—', inline: true },
            { name: 'First purchase', value: ts(rec.firstPurchaseAt, 'D'), inline: true },
            { name: 'Last purchase', value: ts(rec.lastPurchaseAt, 'R'), inline: true }
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!cfg.customerRoleId) return reply(embeds.error('The customer role is not set. An admin must run `/setup customer` first.'));
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return reply(embeds.error('That user is not in this server.'));
  const role = await interaction.guild.roles.fetch(cfg.customerRoleId).catch(() => null);
  if (!role) return reply(embeds.error('The customer role no longer exists. An admin must run `/setup customer` again.'));

  if (sub === 'add') {
    if (member.user.bot) return reply(embeds.error('Bots cannot be customers.'));
    const productName = interaction.options.getString('product');
    const note = interaction.options.getString('note');
    try {
      await member.roles.add(role, `Customer added by ${interaction.user.tag}`);
    } catch {
      return reply(embeds.error(`I cannot give ${role}. Move my role **above** it in Server Settings → Roles.`));
    }

    await Customer.findOneAndUpdate(
      { guildId: interaction.guildId, userId: user.id },
      {
        $inc: { purchases: 1 },
        $set: { lastPurchaseAt: new Date(), addedBy: interaction.user.id, ...(productName ? { lastProduct: productName } : {}) },
      },
      { upsert: true }
    );
    const rec = await Customer.findOne({ guildId: interaction.guildId, userId: user.id }).lean();

    let stockNote = '';
    if (productName) {
      const dec = await Product.findOneAndUpdate({ guildId: interaction.guildId, name: productName, stock: { $gt: 0 } }, { $inc: { stock: -1 } }, { new: true });
      if (dec) stockNote = `\nStock of **${dec.name}** is now **${dec.stock}**.`;
    }

    if (cfg.customerLogChannelId) {
      const channel = await interaction.guild.channels.fetch(cfg.customerLogChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
          .setTitle('🛒 New purchase!')
          .setDescription(`Thank you for shopping with us, ${user}! 💛`)
          .addFields({ name: 'Product', value: productName || '—', inline: true }, { name: 'Total purchases', value: String(rec.purchases), inline: true })
          .setTimestamp();
        if (note) embed.addFields({ name: 'Note', value: truncate(note, 200) });
        await channel.send({ content: `${user}`, embeds: [embed], allowedMentions: { users: [user.id] } }).catch(() => {});
      }
    }

    return reply(embeds.success(`${user} now has ${role}. Total purchases: **${rec.purchases}**.${stockNote}`));
  }

  if (sub === 'remove') {
    if (!member.roles.cache.has(role.id)) return reply(embeds.error(`${user} does not have ${role}.`));
    try {
      await member.roles.remove(role, `Customer removed by ${interaction.user.tag}`);
    } catch {
      return reply(embeds.error(`I cannot remove ${role}. Move my role **above** it in Server Settings → Roles.`));
    }
    return reply(embeds.success(`${role} was removed from ${user}.`));
  }
}

module.exports = { data, execute, autocomplete };
