const { Schema, model } = require('mongoose');

const sellerSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  displayName: { type: String, default: null },
  sales: { type: Number, default: 0 },
  addedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

sellerSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model('Seller', sellerSchema);
