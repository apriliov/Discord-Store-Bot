const { Events } = require('discord.js');
const Ticket = require('../database/models/Ticket');

// If a ticket channel is deleted by hand, mark the ticket as closed so the user can open a new one.
module.exports = {
  name: Events.ChannelDelete,
  async execute(client, channel) {
    if (!channel.guild) return;
    await Ticket.updateOne(
      { channelId: channel.id, status: 'open' },
      { status: 'closed', closedAt: new Date(), closeReason: 'Channel deleted' }
    ).catch(() => {});
  },
};
