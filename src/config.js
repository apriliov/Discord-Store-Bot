require('dotenv').config();

const prefixes = (process.env.PREFIX || '!')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);
if (!prefixes.length) prefixes.push('!');

module.exports = {
  prefixes,
  prefix: prefixes[0],
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  mongoUri: process.env.MONGO_URI,
  autoDeploy: String(process.env.AUTO_DEPLOY).toLowerCase() !== 'false',
  defaultStatus: process.env.DEFAULT_STATUS || 'your orders | /help',
  storeName: process.env.STORE_NAME || 'Our Store',
  colors: {
    brand: 0x5865f2,
    success: 0x57f287,
    error: 0xed4245,
    warn: 0xfee75c,
    gold: 0xf1c40f,
    neutral: 0x2b2d31,
  },
};
