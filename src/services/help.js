const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const embeds = require('../utils/embeds');

const P = config.prefix;

// [usage, description]
const CATEGORIES = {
  shopping: {
    emoji: '🛍️',
    label: 'Shopping',
    who: 'Everyone',
    blurb: 'Browse, order, rate and review.',
    commands: [
      ['catalog [category]', 'Browse the products and order with one click.'],
      ['rate <stars> [comment] [product]', 'Rate the store or one product (once per 24 hours).'],
      ['ratings [product]', 'Show the average rating and the star breakdown.'],
      ['testimonial submit <product> <message> [image]', 'Share your experience (customers only by default).'],
    ],
  },
  tickets: {
    emoji: '🎫',
    label: 'Tickets',
    who: 'Everyone / Staff',
    blurb: 'Press **Open Ticket** on the ticket panel to talk to the team.',
    commands: [
      ['ticket close [reason]', 'Close the current ticket (owner or staff).'],
      ['ticket claim', 'Claim the current ticket. Staff only.'],
      ['ticket add <user>', 'Add a member to the ticket. Staff only.'],
      ['ticket remove <user>', 'Remove a member from the ticket. Staff only.'],
      ['ticket rename <name>', 'Rename the ticket channel. Staff only.'],
    ],
  },
  customers: {
    emoji: '🛒',
    label: 'Customers',
    who: 'Staff',
    blurb: 'Give the customer role and track purchases.',
    commands: [
      ['customer add <user> [product] [note]', 'Give the customer role, count the sale and lower the stock.'],
      ['customer remove <user>', 'Remove the customer role.'],
      ['customer info <user>', 'Show the purchase summary of a member.'],
      ['customer top', 'Show the top 10 customers.'],
      ['testimonial delete <number>', 'Delete a testimonial.'],
    ],
  },
  products: {
    emoji: '📦',
    label: 'Products',
    who: 'Admin',
    blurb: 'Manage what the store sells.',
    commands: [
      ['product add <name> <price> [description] [category] [stock] [image-url]', 'Add a product.'],
      ['product edit <id> [name] [price] [description] [category] [image-url]', 'Edit a product.'],
      ['product stock <id> <amount>', 'Set the stock (-1 = unlimited).'],
      ['product remove <id>', 'Remove a product.'],
      ['product info <id>', 'Show one product.'],
      ['product list', 'List all products.'],
    ],
  },
  setup: {
    emoji: '⚙️',
    label: 'Setup & Panels',
    who: 'Admin',
    blurb: 'Configure the bot and post the panels.',
    commands: [
      ['setup ticket <category> <staff-role> [transcript-channel] [max-tickets]', 'Set up tickets.'],
      ['setup verification <verified-role> [unverified-role] [mode]', 'Set up verification.'],
      ['setup joinleave <channel>', 'Set the join/leave log channel.'],
      ['setup customer <role> [log-channel]', 'Set the customer role.'],
      ['setup testimonial <channel> [customers-only]', 'Set the testimonial channel.'],
      ['setup rating <channel>', 'Set the rating channel.'],
      ['setup store [name] [currency]', 'Set the store name and currency.'],
      ['setup view', 'Show the current configuration.'],
      ['panel <ticket|verify|catalog> <channel>', 'Post a panel with a button.'],
    ],
  },
  posting: {
    emoji: '📣',
    label: 'Posting',
    who: 'Staff',
    blurb: 'Send announcements as the bot.',
    commands: [['post <channel> <message> [title] [color] [image]', 'Post an embed in a channel with an optional title, hex color and image.']],
  },
};

const ORDER = Object.keys(CATEGORIES);

function overview(storeName) {
  return new EmbedBuilder()
    .setColor(config.colors.brand)
    .setTitle(`🛍️ ${storeName} - Help`)
    .setDescription(
      'Use the menu below to see the commands of each section.\n\n' +
        `**Two ways to run commands**\n• Slash: \`/rate 5\`\n• Prefix: \`${P}rate 5\`\n\n` +
        '`<value>` is required, `[value]` is optional.'
    )
    .addFields(
      ORDER.map((key) => {
        const c = CATEGORIES[key];
        return { name: `${c.emoji} ${c.label}`, value: `${c.blurb}\n-# ${c.who} • ${c.commands.length} command${c.commands.length === 1 ? '' : 's'}`, inline: true };
      })
    )
    .addFields({
      name: '💡 Prefix tips',
      value:
        `• Put "quotes" around values with spaces: \`${P}product add "Netflix Premium" 25000\`\n` +
        `• Give any value by name: \`${P}post #news color:#ff0000 title:"Sale" Big sale today!\`\n` +
        '• Attach a file to your message for image options.',
    })
    .setFooter({ text: `Prefix: ${config.prefixes.join('  ')}` });
}

function categoryEmbed(key, storeName) {
  const c = CATEGORIES[key];
  const lines = c.commands.map(([usage, desc]) => `**/${usage.split(' ')[0]}${usage.includes(' ') ? ' ' + usage.split(' ').slice(1).join(' ') : ''}**\n${desc}`);
  return new EmbedBuilder()
    .setColor(config.colors.brand)
    .setTitle(`${c.emoji} ${c.label}`)
    .setDescription(`${c.blurb}\n-# Who can use it: ${c.who}\n\n${lines.join('\n\n')}`)
    .setFooter({ text: `${storeName} • Prefix version: ${P}${c.commands[0][0].split(' ')[0]} ...` });
}

function menu(userId, selected = 'overview') {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`hp:${userId}`)
      .setPlaceholder('Choose a section')
      .addOptions([
        { label: 'Overview', value: 'overview', emoji: '📖', default: selected === 'overview' },
        ...ORDER.map((key) => ({ label: CATEGORIES[key].label, description: `${CATEGORIES[key].who} • ${CATEGORIES[key].blurb}`.slice(0, 100), value: key, emoji: CATEGORIES[key].emoji, default: selected === key })),
      ])
  );
}

function buildHelp(userId, storeName, key = 'overview') {
  const embed = key !== 'overview' && CATEGORIES[key] ? categoryEmbed(key, storeName) : overview(storeName);
  return { embeds: [embed], components: [menu(userId, CATEGORIES[key] ? key : 'overview')] };
}

async function handleInteraction(client, interaction) {
  const [, ownerId] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) {
    return interaction.reply({ embeds: [embeds.error(`That menu belongs to someone else. Run \`/help\` to get your own.`)], flags: MessageFlags.Ephemeral });
  }
  const { getGuildConfig } = require('./guildConfig');
  const cfg = await getGuildConfig(interaction.guildId);
  return interaction.update(buildHelp(ownerId, cfg.storeName || config.storeName, interaction.values[0]));
}

module.exports = { buildHelp, handleInteraction, CATEGORIES, ORDER };
