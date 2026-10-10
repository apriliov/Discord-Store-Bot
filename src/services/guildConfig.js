const GuildConfig = require('../database/models/GuildConfig');

async function getGuildConfig(guildId) {
  const run = () =>
    GuildConfig.findOneAndUpdate(
      { guildId },
      { $setOnInsert: { guildId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  try {
    return await run();
  } catch (err) {
    if (err && err.code === 11000) return run();
    throw err;
  }
}

async function updateGuildConfig(guildId, update) {
  await getGuildConfig(guildId);
  return GuildConfig.findOneAndUpdate({ guildId }, update, { new: true }).lean();
}

// Atomically increments a counter field and returns the new value.
async function nextCounter(guildId, field) {
  await getGuildConfig(guildId);
  const doc = await GuildConfig.findOneAndUpdate({ guildId }, { $inc: { [field]: 1 } }, { new: true }).lean();
  return doc[field];
}

module.exports = { getGuildConfig, updateGuildConfig, nextCounter };
