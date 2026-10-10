const { SlashCommandBuilder, EmbedBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Seller = require('../database/models/Seller');
const Product = require('../database/models/Product');
const { getGuildConfig } = require('../services/guildConfig');
const { getSeller, sellerStats, allSellerStats } = require('../services/sellers');
const { requireAdmin } = require('../utils/permissions');
const { ts, truncate, stars, money, stockText } = require('../utils/format');

const data = new SlashCommandBuilder()
  .setName('seller')
  .setDescription('Manage and view the sellers of this store')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Make a member a seller (admin)')
      .addUserOption((o) => o.setName('user').setDescription('The new seller').setRequired(true))
      .addStringOption((o) => o.setName('name').setDescription('Shop name shown to buyers (default: their server name)').setMaxLength(40))
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Remove a seller (admin)')
      .addUserOption((o) => o.setName('user').setDescription('The seller').setRequired(true))
      .addBooleanOption((o) => o.setName('delete-products').setDescription('Also delete their products (default: they become store products)'))
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show all sellers with their testimonials and ratings'))
  .addSubcommand((s) =>
    s
      .setName('info')
      .setDescription('Show the profile of a seller: testimonials, rating and products')
      .addUserOption((o) => o.setName('user').setDescription('The seller (default: you)'))
  );

const ratingText = (avg, count) => (count ? `${stars(avg)} **${avg.toFixed(2)}** / 5 (${count})` : 'No ratings yet');

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;
  const fail = (text) => interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });

  if (sub === 'add' || sub === 'remove') {
    if (!(await requireAdmin(interaction))) return;
    const user = interaction.options.getUser('user');

    if (sub === 'add') {
      if (user.bot) return fail('Bots cannot be sellers.');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return fail('That user is not in this server.');
      const name = (interaction.options.getString('name') || '').trim();
      const existing = await getSeller(gid, user.id);
      const update = { $setOnInsert: { addedBy: interaction.user.id, createdAt: new Date() } };
      if (name || !existing) update.$set = { displayName: name || member.displayName };
      await Seller.findOneAndUpdate({ guildId: gid, userId: user.id }, update, { upsert: true });
      return interaction.reply({
        embeds: [
          embeds.success(
            existing
              ? `${user} is already a seller. Their shop name is now **${truncate(name || existing.displayName || member.displayName, 40)}**.`
              : `${user} is now a seller! They can use \`/product\`, \`/post\` and \`/customer add\` for their own products.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const existing = await getSeller(gid, user.id);
    if (!existing) return fail(`${user} is not a seller.`);
    const deleteProducts = interaction.options.getBoolean('delete-products') === true;
    let note;
    if (deleteProducts) {
      const res = await Product.deleteMany({ guildId: gid, sellerId: user.id });
      note = `${res.deletedCount || 0} product(s) were deleted.`;
    } else {
      const res = await Product.updateMany({ guildId: gid, sellerId: user.id }, { $set: { sellerId: null } });
      note = `${res.modifiedCount || 0} product(s) now belong to the store.`;
    }
    await Seller.deleteOne({ guildId: gid, userId: user.id });
    return interaction.reply({ embeds: [embeds.success(`${user} is no longer a seller. ${note}\nTheir past testimonials and ratings are kept.`)], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'list') {
    const rows = await allSellerStats(gid);
    if (!rows.length) return interaction.reply({ embeds: [embeds.info('There are no sellers yet. An admin can add one with `/seller add`.')], flags: MessageFlags.Ephemeral });
    rows.sort((a, b) => b.testimonials - a.testimonials || b.ratingAvg - a.ratingAvg);
    const shown = rows.slice(0, 20);
    const lines = shown.map(
      (s, i) =>
        `**${i + 1}.** <@${s.userId}> - **${truncate(s.displayName || 'Seller', 40)}**\n` +
        `💬 ${s.testimonials} testimonial${s.testimonials === 1 ? '' : 's'}  •  ${ratingText(s.ratingAvg, s.ratingCount)}  •  📦 ${s.products}`
    );
    const embed = new EmbedBuilder()
      .setColor(config.colors.brand)
      .setTitle(`🧑‍💼 Sellers (${rows.length})`)
      .setDescription(lines.join('\n\n') + (rows.length > shown.length ? `\n\n…and ${rows.length - shown.length} more` : ''))
      .setFooter({ text: 'Use /seller info to see one seller in detail' });
    return interaction.reply({ embeds: [embed] });
  }

  // info: the profile of one seller
  const user = interaction.options.getUser('user') || interaction.user;
  const seller = await getSeller(gid, user.id);
  if (!seller) return fail(`${user} is not a seller of this store.`);

  const cfg = await getGuildConfig(gid);
  const [st, products] = await Promise.all([
    sellerStats(gid, user.id),
    Product.find({ guildId: gid, sellerId: user.id }).sort({ category: 1, number: 1 }).lean(),
  ]);

  let list = '';
  let shown = 0;
  for (const p of products) {
    const line = `**#${p.number}** ${truncate(p.name, 40)} • ${money(cfg, p.price)} • ${stockText(p.stock)}\n`;
    if ((list + line).length > 900) break;
    list += line;
    shown += 1;
  }
  if (shown < products.length) list += `…and ${products.length - shown} more`;

  const embed = new EmbedBuilder()
    .setColor(config.colors.gold)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(`🧑‍💼 ${truncate(seller.displayName || user.username, 60)}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: '💬 Testimonials', value: String(st.testimonials), inline: true },
      { name: '⭐ Rating', value: ratingText(st.ratingAvg, st.ratingCount), inline: true },
      { name: '📦 Products', value: String(st.products), inline: true },
      { name: '🛒 Sales recorded', value: String(seller.sales || 0), inline: true },
      { name: '📅 Seller since', value: ts(seller.createdAt, 'D'), inline: true },
      { name: '👤 Contact', value: `${user}`, inline: true },
      { name: '🛍️ Product list', value: list || 'No products yet.' }
    )
    .setFooter({ text: 'Order from /catalog' });
  return interaction.reply({ embeds: [embed] });
}

module.exports = { data, execute };
