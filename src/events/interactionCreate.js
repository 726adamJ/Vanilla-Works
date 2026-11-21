const { MessageFlags } = require('discord.js');
const { canUseSlashCommands } = require('../utils/permissions');
const { handleButton, handleModal } = require('../handlers/interactions');

const tempData = new Map();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!client.tempData) client.tempData = tempData;
    try {
      if (interaction.isChatInputCommand()) {
        if (!canUseSlashCommands(interaction.member)) {
          return interaction.reply({
            content: 'Only management can use slash commands. Staff should use the panel buttons.',
            flags: MessageFlags.Ephemeral
          });
        }
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }
      if (interaction.isButton()) return handleButton(interaction, client);
      if (interaction.isModalSubmit()) return handleModal(interaction, client);
    } catch (error) {
      console.error('Interaction error:', error);
      const payload = {
        content: 'An unexpected error occurred. Please try again or contact management.',
        flags: MessageFlags.Ephemeral
      };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
};
