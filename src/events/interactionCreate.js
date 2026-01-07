import { Events } from 'discord.js';
import { handleTicketButton, handleTicketModal, handleTicketAction } from '../handlers/ticketHandler.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);

            const reply = {
                content: '❌ There was an error executing this command!',
                ephemeral: true,
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
        return;
    }

    // Handle Button Interactions
    if (interaction.isButton()) {
        const customId = interaction.customId;

        // Ticket panel button (open ticket)
        if (customId.startsWith('ticket_open_')) {
            console.log(`[DEBUG] Handling Ticket Open: ${customId}`);
            await handleTicketButton(interaction);
            return;
        }

        // Ticket action buttons (close, claim, etc.)
        if (customId.startsWith('ticket_')) {
            console.log(`[DEBUG] Handling Ticket Action: ${customId}`);
            await handleTicketAction(interaction);
            return;
        }
    }

    // Handle Modal Submissions
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('ticket_form_')) {
            await handleTicketModal(interaction);
            return;
        }
    }

    // Handle Autocomplete
    if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command || !command.autocomplete) return;

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error('Autocomplete error:', error);
        }
    }
}
