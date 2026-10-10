const { Schema, model } = require('mongoose');

const customerSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  purchases: { type: Number, default: 0 },
  lastProduct: { type: String, default: null },
  firstPurchaseAt: { type: Date, default: Date.now },
  lastPurchaseAt: { type: Date, default: Date.now },
  addedBy: { type: String, default: null },
});

customerSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model('Customer', customerSchema);
