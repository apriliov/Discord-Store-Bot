const { Schema, model } = require('mongoose');

const testimonialSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  number: { type: Number, required: true },
  userId: { type: String, required: true },
  sellerId: { type: String, default: null, index: true }, // seller the testimonial is about, null = the store
  product: { type: String, required: true },
  message: { type: String, required: true },
  imageUrl: { type: String, default: null },
  messageId: { type: String, default: null },
  channelId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

testimonialSchema.index({ guildId: 1, number: 1 }, { unique: true });

module.exports = model('Testimonial', testimonialSchema);
