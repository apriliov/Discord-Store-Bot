const { MessageFlags } = require('discord.js');

// Replies (or follows up / edits) with an ephemeral message no matter what state the interaction is in.
async function ephemeral(interaction, payload) {
  const data = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (interaction.deferred && !interaction.replied) return interaction.editReply(data);
  data.flags = MessageFlags.Ephemeral;
  if (interaction.replied) return interaction.followUp(data);
  return interaction.reply(data);
}

module.exports = { ephemeral };
