// Multi-seller helpers: who is a seller, what a seller may touch, and per-seller statistics.
const embeds = require('../utils/embeds');
const Seller = require('../database/models/Seller');
const Product = require('../database/models/Product');
const Testimonial = require('../database/models/Testimonial');
const Rating = require('../database/models/Rating');
const { isAdmin, isStaff } = require('../utils/permissions');
const { truncate } = require('../utils/format');
const { MessageFlags } = require('discord.js');

const getSeller = (guildId, userId) => (userId ? Seller.findOne({ guildId, userId }).lean() : null);

// Who is running a command: member, admin, staff (needs cfg), and the seller record if any.
async function getActor(interaction, cfg = null) {
  const member = interaction.member?.roles?.cache
    ? interaction.member
    : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const seller = await getSeller(interaction.guildId, interaction.user.id);
  return {
    member,
    userId: interaction.user.id,
    admin: isAdmin(member),
    staff: cfg ? isStaff(member, cfg) : isAdmin(member),
    seller,
  };
}

// Admins can manage every product, a seller only their own.
const canManageProduct = (actor, product) => !!product && (actor.admin || (!!actor.seller && product.sellerId === actor.userId));

// Restricts a product query to what the actor may see/manage. Returns null when they may manage nothing.
function productScope(actor, guildId) {
  if (actor.admin) return { guildId };
  if (actor.seller) return { guildId, sellerId: actor.userId };
  return null;
}

async function denyUnlessSellerOrAdmin(interaction, actor, text = 'Only admins and sellers can use this command.') {
  if (actor.admin || actor.seller) return false;
  await interaction.reply({ embeds: [embeds.error(text)], flags: MessageFlags.Ephemeral });
  return true;
}

// Works out which seller a testimonial or rating is about.
// Priority: the seller option, then the seller of the named product. Returns { sellerId } or { error }.
async function resolveSellerForItem(guildId, productName, sellerUser) {
  if (sellerUser) {
    if (sellerUser.bot) return { error: 'Bots cannot be sellers.' };
    const seller = await getSeller(guildId, sellerUser.id);
    if (!seller) return { error: `${sellerUser} is not a seller of this store.` };
    return { sellerId: seller.userId };
  }
  if (!productName) return { sellerId: null };
  const matches = await Product.find({ guildId, name: productName }).select('sellerId').limit(10).lean();
  const owners = [...new Set(matches.map((p) => p.sellerId || ''))];
  if (owners.length > 1) {
    return { error: `Several sellers sell a product called **${truncate(productName, 60)}**. Pick the right one with the \`seller\` option.` };
  }
  return { sellerId: owners[0] || null };
}

// Autocomplete choices for a product name: "Name • Seller". The value stays the plain product name.
async function productChoices(guildId, typed, { sellerId } = {}) {
  const query = { guildId };
  if (sellerId) query.sellerId = sellerId;
  const [products, sellers] = await Promise.all([
    Product.find(query).sort({ number: 1 }).limit(200).lean(),
    Seller.find({ guildId }).lean(),
  ]);
  const names = new Map(sellers.map((s) => [s.userId, s.displayName || 'Seller']));
  const lower = String(typed || '').toLowerCase();
  const out = [];
  const seen = new Set();
  for (const p of products) {
    const label = p.sellerId && names.has(p.sellerId) ? `${p.name} • ${names.get(p.sellerId)}` : p.name;
    if (!label.toLowerCase().includes(lower) || seen.has(label)) continue;
    seen.add(label);
    out.push({ name: truncate(label, 100), value: truncate(p.name, 80) });
    if (out.length >= 25) break;
  }
  return out;
}

// Finds a product from user input: "#12" (product number) or an exact name.
async function findProductByInput(guildId, input, sellerId = null) {
  const text = String(input || '').trim();
  const base = { guildId, ...(sellerId ? { sellerId } : {}) };
  const byNumber = text.match(/^#(\d+)$/);
  if (byNumber) return { product: await Product.findOne({ ...base, number: Number(byNumber[1]) }), ambiguous: false };
  const found = await Product.find({ ...base, name: text }).limit(5);
  if (found.length > 1) return { product: null, ambiguous: true };
  return { product: found[0] || null, ambiguous: false };
}

async function sellerStats(guildId, userId) {
  const [products, testimonials, ratingRows] = await Promise.all([
    Product.countDocuments({ guildId, sellerId: userId }),
    Testimonial.countDocuments({ guildId, sellerId: userId }),
    Rating.aggregate([{ $match: { guildId, sellerId: userId } }, { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$stars' } } }]),
  ]);
  const r = ratingRows[0] || { count: 0, avg: 0 };
  return { products, testimonials, ratingCount: r.count, ratingAvg: r.avg };
}

// Statistics for every seller of a guild in three queries.
async function allSellerStats(guildId) {
  const [sellers, prod, testi, rate] = await Promise.all([
    Seller.find({ guildId }).sort({ createdAt: 1 }).lean(),
    Product.aggregate([{ $match: { guildId, sellerId: { $ne: null } } }, { $group: { _id: '$sellerId', n: { $sum: 1 } } }]),
    Testimonial.aggregate([{ $match: { guildId, sellerId: { $ne: null } } }, { $group: { _id: '$sellerId', n: { $sum: 1 } } }]),
    Rating.aggregate([{ $match: { guildId, sellerId: { $ne: null } } }, { $group: { _id: '$sellerId', n: { $sum: 1 }, avg: { $avg: '$stars' } } }]),
  ]);
  const toMap = (rows) => new Map(rows.map((r) => [r._id, r]));
  const p = toMap(prod);
  const t = toMap(testi);
  const r = toMap(rate);
  return sellers.map((s) => ({
    ...s,
    products: p.get(s.userId)?.n || 0,
    testimonials: t.get(s.userId)?.n || 0,
    ratingCount: r.get(s.userId)?.n || 0,
    ratingAvg: r.get(s.userId)?.avg || 0,
  }));
}

// Seller that should get credit for a ticket: the seller of the product, or the seller who claimed it.
async function sellerForTicket(ticket) {
  if (ticket.sellerId) return ticket.sellerId;
  if (!ticket.claimedBy) return null;
  const s = await getSeller(ticket.guildId, ticket.claimedBy);
  return s ? s.userId : null;
}

module.exports = {
  getSeller,
  getActor,
  canManageProduct,
  productScope,
  denyUnlessSellerOrAdmin,
  resolveSellerForItem,
  productChoices,
  findProductByInput,
  sellerStats,
  allSellerStats,
  sellerForTicket,
};
