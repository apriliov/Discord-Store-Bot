const { SlashCommandBuilder, EmbedBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Product = require('../database/models/Product');
const { getGuildConfig, nextCounter } = require('../services/guildConfig');
const { getActor, canManageProduct, productScope, denyUnlessSellerOrAdmin, getSeller } = require('../services/sellers');
const { money, stockText, truncate } = require('../utils/format');
const { buildProductDetail } = require('../services/catalog');

const numberOption = (o) => o.setName('id').setDescription('Product number (see /product list)').setRequired(true).setAutocomplete(true);

const data = new SlashCommandBuilder()
  .setName('product')
  .setDescription('Manage the product catalog (admins: all products, sellers: their own)')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Add a product to the catalog')
      .addStringOption((o) => o.setName('name').setDescription('Product name').setRequired(true).setMaxLength(80))
      .addNumberOption((o) => o.setName('price').setDescription('Price (numbers only)').setRequired(true).setMinValue(0))
      .addStringOption((o) => o.setName('description').setDescription('Short description').setMaxLength(500))
      .addStringOption((o) => o.setName('category').setDescription('Category, e.g. Games, Accounts, Services').setMaxLength(30).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('stock').setDescription('Stock amount (leave empty for unlimited)').setMinValue(0).setMaxValue(1000000))
      .addStringOption((o) => o.setName('image-url').setDescription('Permanent image link (https://...), e.g. from Imgur').setMaxLength(500))
      .addUserOption((o) => o.setName('seller').setDescription('Admin only: give this product to a seller'))
  )
  .addSubcommand((s) =>
    s
      .setName('edit')
      .setDescription('Edit a product')
      .addIntegerOption(numberOption)
      .addStringOption((o) => o.setName('name').setDescription('New name').setMaxLength(80))
      .addNumberOption((o) => o.setName('price').setDescription('New price').setMinValue(0))
      .addStringOption((o) => o.setName('description').setDescription('New description').setMaxLength(500))
      .addStringOption((o) => o.setName('category').setDescription('New category').setMaxLength(30).setAutocomplete(true))
      .addStringOption((o) => o.setName('image-url').setDescription('New permanent image link (https://...)').setMaxLength(500))
      .addUserOption((o) => o.setName('seller').setDescription('Admin only: move this product to another seller'))
  )
  .addSubcommand((s) =>
    s
      .setName('stock')
      .setDescription('Set the stock of a product')
      .addIntegerOption(numberOption)
      .addIntegerOption((o) => o.setName('amount').setDescription('New stock amount, or -1 for unlimited').setRequired(true).setMinValue(-1).setMaxValue(1000000))
  )
  .addSubcommand((s) => s.setName('remove').setDescription('Remove a product').addIntegerOption(numberOption))
  .addSubcommand((s) => s.setName('info').setDescription('Show one product').addIntegerOption(numberOption))
  .addSubcommand((s) => s.setName('list').setDescription('List all products (admin view)'));

// Discord attachment links expire, so product images are given as permanent links instead.
const validImage = (url) => !url || embeds.isHttpUrl(url);

async function autocomplete(interaction) {
  const actor = await getActor(interaction);
  const scope = productScope(actor, interaction.guildId);
  if (!scope) return interaction.respond([]);
  const focused = interaction.options.getFocused(true);
  const typed = String(focused.value).toLowerCase();
  if (focused.name === 'category') {
    const cats = await Product.distinct('category', scope);
    return interaction.respond(cats.filter((c) => c.toLowerCase().includes(typed)).slice(0, 25).map((c) => ({ name: c, value: c })));
  }
  const products = await Product.find(scope).sort({ number: 1 }).limit(200).lean();
  return interaction.respond(
    products
      .filter((p) => `${p.number} ${p.name}`.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((p) => ({ name: truncate(`#${p.number} ${p.name}`, 100), value: p.number }))
  );
}

async function execute(interaction) {
  const actor = await getActor(interaction);
  if (await denyUnlessSellerOrAdmin(interaction, actor)) return;
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;
  const reply = (embed) => interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  const cfg = await getGuildConfig(gid);

  // Admins may hand a product to a seller; sellers can never touch other sellers' products.
  const pickSeller = async () => {
    const user = interaction.options.getUser('seller');
    if (!user) return { sellerId: undefined };
    if (!actor.admin) return { error: 'Only admins can assign a product to a seller.' };
    if (!(await getSeller(gid, user.id))) return { error: `${user} is not a seller. Add them first with \`/seller add\`.` };
    return { sellerId: user.id };
  };

  if (sub === 'add') {
    const picked = await pickSeller();
    if (picked.error) return reply(embeds.error(picked.error));
    const image = interaction.options.getString('image-url');
    if (!validImage(image)) return reply(embeds.error('`image-url` must be a link that starts with https://'));
    const stock = interaction.options.getInteger('stock');
    const number = await nextCounter(gid, 'productCounter');
    const product = await Product.create({
      guildId: gid,
      sellerId: picked.sellerId !== undefined ? picked.sellerId : actor.seller ? actor.userId : null,
      number,
      name: interaction.options.getString('name'),
      price: interaction.options.getNumber('price'),
      description: interaction.options.getString('description') || '',
      category: interaction.options.getString('category') || 'General',
      stock: stock === null ? -1 : stock,
      imageUrl: image || null,
    });
    const detail = await buildProductDetail(gid, product.number);
    return interaction.reply({ content: `✅ Product **#${product.number}** added.`, embeds: detail.embeds, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'list') {
    const products = await Product.find(productScope(actor, gid)).sort({ category: 1, number: 1 }).lean();
    if (!products.length) return reply(embeds.info('No products yet. Add one with `/product add`.'));
    const lines = products.map(
      (p) => `**#${p.number}** ${truncate(p.name, 40)} - ${money(cfg, p.price)} - ${stockText(p.stock)} - *${truncate(p.category, 20)}*${actor.admin && p.sellerId ? ` - <@${p.sellerId}>` : ''}`
    );
    const embed = new EmbedBuilder().setColor(config.colors.brand).setTitle(`📦 Products (${products.length})`);
    let text = '';
    let shown = 0;
    for (const line of lines) {
      if ((text + line + '\n').length > 3900) break;
      text += `${line}\n`;
      shown += 1;
    }
    embed.setDescription(text + (shown < lines.length ? `\n…and ${lines.length - shown} more` : ''));
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const number = interaction.options.getInteger('id');
  const product = await Product.findOne({ guildId: gid, number });
  if (!product) return reply(embeds.error(`Product **#${number}** was not found.`));
  if (!canManageProduct(actor, product)) return reply(embeds.error(`Product **#${number}** belongs to another seller. You can only manage your own products.`));

  if (sub === 'info') {
    const detail = await buildProductDetail(gid, number);
    return interaction.reply({ embeds: detail.embeds, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'remove') {
    await product.deleteOne();
    return reply(embeds.success(`Product **${product.name}** (#${number}) was removed.`));
  }

  if (sub === 'stock') {
    product.stock = interaction.options.getInteger('amount');
    await product.save();
    return reply(embeds.success(`Stock of **${product.name}** is now **${stockText(product.stock)}**.`));
  }

  if (sub === 'edit') {
    const o = interaction.options;
    const image = o.getString('image-url');
    if (!validImage(image)) return reply(embeds.error('`image-url` must be a link that starts with https://'));
    const changes = [];
    if (o.getString('name')) { product.name = o.getString('name'); changes.push('name'); }
    if (o.getNumber('price') !== null) { product.price = o.getNumber('price'); changes.push('price'); }
    if (o.getString('description')) { product.description = o.getString('description'); changes.push('description'); }
    if (o.getString('category')) { product.category = o.getString('category'); changes.push('category'); }
    if (image) { product.imageUrl = image; changes.push('image'); }
    const picked = await pickSeller();
    if (picked.error) return reply(embeds.error(picked.error));
    if (picked.sellerId) { product.sellerId = picked.sellerId; changes.push('seller'); }
    if (!changes.length) return reply(embeds.error('Nothing to change. Fill at least one option.'));
    await product.save();
    return reply(embeds.success(`Product **#${number}** updated (${changes.join(', ')}).`));
  }
}

module.exports = { data, execute, autocomplete };
