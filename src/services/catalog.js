const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');
const Product = require('../database/models/Product');
const { getGuildConfig } = require('./guildConfig');
const { truncate, money, stockText } = require('../utils/format');
const { startTicket } = require('./tickets');
const { ephemeral } = require('../utils/reply');

const PER_PAGE = 5;
const ALL = '*';

async function listProducts(guildId, category) {
  const query = { guildId };
  if (category && category !== ALL) query.category = category;
  return Product.find(query).sort({ category: 1, number: 1 }).lean();
}

// Builds one page of the catalog: embed + product select menu + paging buttons.
async function buildCatalogPage(guildId, page = 0, category = ALL) {
  const cfg = await getGuildConfig(guildId);
  const products = await listProducts(guildId, category);
  const pages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = products.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(config.colors.brand)
    .setTitle(`🛍️ ${cfg.storeName || config.storeName} - Product Catalog`)
    .setFooter({ text: `Page ${current + 1}/${pages} • ${products.length} product${products.length === 1 ? '' : 's'}${category !== ALL ? ` • Category: ${category}` : ''}` });

  if (!slice.length) {
    embed.setDescription('There are no products here yet. Please check back soon!');
    return { embeds: [embed], components: [] };
  }

  embed.setDescription('Pick a product from the menu below to see the details and order it.');
  for (const p of slice) {
    embed.addFields({
      name: `#${p.number} • ${truncate(p.name, 200)}`,
      value:
        `💰 **${money(cfg, p.price)}**  •  📦 ${stockText(p.stock)}\n` +
        `🏷️ ${truncate(p.category, 50)}` +
        (p.sellerId ? `  •  🧑‍💼 <@${p.sellerId}>` : '') +
        (p.description ? `\n${truncate(p.description, 120)}` : ''),
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('ct:view')
    .setPlaceholder('Select a product to view')
    .addOptions(
      slice.map((p) => ({
        label: truncate(`#${p.number} ${p.name}`, 100),
        description: truncate(`${money(cfg, p.price)} • ${stockText(p.stock).replace('❌ ', '')}`, 100),
        value: String(p.number),
        emoji: p.stock === 0 ? '❌' : '🛒',
      }))
    );

  const rows = [new ActionRowBuilder().addComponents(select)];
  if (pages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ct:page:${current - 1}:${category}`).setEmoji('◀️').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
        new ButtonBuilder().setCustomId('ct:noop').setLabel(`${current + 1} / ${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`ct:page:${current + 1}:${category}`).setLabel('Next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages - 1)
      )
    );
  }
  return { embeds: [embed], components: rows };
}

async function buildProductDetail(guildId, number) {
  const cfg = await getGuildConfig(guildId);
  const p = await Product.findOne({ guildId, number }).lean();
  if (!p) return null;
  const embed = new EmbedBuilder()
    .setColor(p.stock === 0 ? config.colors.error : config.colors.success)
    .setTitle(`${p.name}`)
    .setDescription(p.description || '*No description.*')
    .addFields(
      { name: '💰 Price', value: money(cfg, p.price), inline: true },
      { name: '📦 Stock', value: stockText(p.stock), inline: true },
      { name: '🏷️ Category', value: truncate(p.category, 100), inline: true }
    )
    .setFooter({ text: `Product #${p.number}` });
  if (p.sellerId) embed.addFields({ name: '🧑‍💼 Seller', value: `<@${p.sellerId}>  •  \`/seller info\``, inline: true });
  if (p.imageUrl && embeds.isHttpUrl(p.imageUrl)) embed.setImage(p.imageUrl);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ct:order:${p.number}`).setLabel('Order Now').setEmoji('🛒').setStyle(ButtonStyle.Success).setDisabled(p.stock === 0)
  );
  return { embeds: [embed], components: [row] };
}

async function handleInteraction(client, interaction) {
  const parts = interaction.customId.split(':');
  const kind = parts[1];
  if (!interaction.inGuild()) return;

  if (kind === 'noop') return interaction.deferUpdate();

  if (kind === 'open' && interaction.isButton()) {
    const payload = await buildCatalogPage(interaction.guildId, 0, ALL);
    return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }

  if (kind === 'page' && interaction.isButton()) {
    const page = Number(parts[2]) || 0;
    const category = parts.slice(3).join(':') || ALL;
    return interaction.update(await buildCatalogPage(interaction.guildId, page, category));
  }

  if (kind === 'view' && interaction.isStringSelectMenu()) {
    const detail = await buildProductDetail(interaction.guildId, Number(interaction.values[0]));
    if (!detail) return ephemeral(interaction, { embeds: [embeds.error('That product no longer exists.')] });
    return interaction.reply({ ...detail, flags: MessageFlags.Ephemeral });
  }

  if (kind === 'order' && interaction.isButton()) {
    const product = await Product.findOne({ guildId: interaction.guildId, number: Number(parts[2]) });
    if (!product) return ephemeral(interaction, { embeds: [embeds.error('That product no longer exists.')] });
    return startTicket(interaction, { subject: `Order: ${truncate(product.name, 90)}`, product });
  }
}

module.exports = { handleInteraction, buildCatalogPage, buildProductDetail, listProducts, ALL, PER_PAGE };
