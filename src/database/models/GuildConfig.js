const { Schema, model } = require('mongoose');

const guildConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Store
  currency: { type: String, default: 'Rp' },
  storeName: { type: String, default: null },

  // Tickets
  ticketCategoryId: { type: String, default: null },
  staffRoleId: { type: String, default: null },
  ticketLogChannelId: { type: String, default: null },
  maxTickets: { type: Number, default: 1 },
  ticketCounter: { type: Number, default: 0 },

  // Verification
  verifiedRoleId: { type: String, default: null },
  unverifiedRoleId: { type: String, default: null },
  verifyMode: { type: String, enum: ['button', 'captcha'], default: 'button' },

  // Join / leave log
  joinLeaveChannelId: { type: String, default: null },

  // Customers
  customerRoleId: { type: String, default: null },
  customerLogChannelId: { type: String, default: null },

  // Testimonials and ratings
  testimonialChannelId: { type: String, default: null },
  testimonialCustomersOnly: { type: Boolean, default: true },
  ratingChannelId: { type: String, default: null },

  productCounter: { type: Number, default: 0 },
  testimonialCounter: { type: Number, default: 0 },
});

module.exports = model('GuildConfig', guildConfigSchema);
