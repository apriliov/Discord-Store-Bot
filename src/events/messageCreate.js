const { Events } = require('discord.js');
const config = require('../config');
const { runPrefixCommand } = require('../core/prefix');

module.exports = {
  name: Events.MessageCreate,
  async execute(client, message) {
    if (message.author.bot || !message.guild || !message.content) return;

    const prefix = config.prefixes.find((p) => message.content.startsWith(p));
    if (!prefix) return;

    const match = message.content.slice(prefix.length).match(/^\s*(\S+)([\s\S]*)$/);
    if (!match) return;
    const command = client.commands.get(match[1].toLowerCase());
    if (!command) return;

    if (!message.member) await message.guild.members.fetch(message.author.id).catch(() => null);
    await runPrefixCommand(client, message, command, match[2].trimStart()).catch((err) => console.error('[PREFIX]', err));
  },
};
