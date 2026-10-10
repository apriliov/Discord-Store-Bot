const { Schema, model } = require('mongoose');

// A post made with /post. Kept so the author can edit or delete it later.
const announcementSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  number: { type: Number, required: true },
  authorId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
  title: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

announcementSchema.index({ guildId: 1, number: 1 }, { unique: true });

module.exports = model('Announcement', announcementSchema);
