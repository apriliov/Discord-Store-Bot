const { Schema, model } = require('mongoose');

const ratingSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  sellerId: { type: String, default: null, index: true }, // seller the rating is about, null = the store
  stars: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  product: { type: String, default: null }, // product name, or null for the store in general
  ticketId: { type: String, default: null },
  source: { type: String, enum: ['command', 'ticket'], default: 'command' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model('Rating', ratingSchema);
