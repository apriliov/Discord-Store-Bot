const { Schema, model } = require('mongoose');

const productSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  sellerId: { type: String, default: null, index: true }, // Discord user ID of the seller, null = sold by the store itself
  number: { type: Number, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' },
  stock: { type: Number, default: -1 }, // -1 = unlimited
  imageUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

productSchema.index({ guildId: 1, number: 1 }, { unique: true });

module.exports = model('Product', productSchema);
