const { Schema, model } = require('mongoose');

const ticketSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true, unique: true },
  number: { type: Number, required: true },
  userId: { type: String, required: true },
  userTag: { type: String, default: 'unknown' },
  subject: { type: String, default: 'Order' },
  productId: { type: String, default: null },
  productName: { type: String, default: null },
  details: { type: String, default: null },
  controlMessageId: { type: String, default: null },
  claimedBy: { type: String, default: null },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
  closedBy: { type: String, default: null },
  closeReason: { type: String, default: null },
  rated: { type: Boolean, default: false },
});

module.exports = model('Ticket', ticketSchema);
