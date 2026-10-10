const fs = require('node:fs');
const path = require('node:path');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

function loadCommands() {
  const commands = new Map();
  for (const file of fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'))) {
    const cmd = require(path.join(COMMANDS_DIR, file));
    if (!cmd.data || typeof cmd.execute !== 'function') {
      throw new Error(`Command file ${file} needs "data" (SlashCommandBuilder) and "execute".`);
    }
    const name = cmd.data.name;
    if (commands.has(name)) throw new Error(`Duplicate command name "${name}" (${file}).`);
    commands.set(name, cmd);
  }
  return commands;
}

module.exports = { loadCommands };
