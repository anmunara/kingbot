import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands');

export async function execute(interaction) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🎫 Ticket Bot Commands')
        .setDescription('Here are all the available commands:')
        .addFields(
            {
                name: '📋 Panel Commands',
                value: [
                    '`/panel create` - Create a new ticket panel',
                    '`/panel add-button` - Add a button to a panel',
                    '`/panel add-question` - Add a form question',
                    '`/panel send` - Send panel to a channel',
                    '`/panel list` - List all panels',
                    '`/panel info` - View panel details',
                    '`/panel delete` - Delete a panel',
                ].join('\n'),
                inline: false
            },
            {
                name: '🎫 Ticket Commands',
                value: [
                    '`/ticket close` - Close the current ticket',
                    '`/ticket add` - Add a user to the ticket',
                    '`/ticket remove` - Remove a user',
                    '`/ticket rename` - Rename the ticket channel',
                    '`/ticket info` - View ticket information',
                ].join('\n'),
                inline: false
            },
            {
                name: '⚙️ Setup Commands',
                value: [
                    '`/setup logs` - Set the log channel',
                    '`/setup transcripts` - Set transcript channel',
                    '`/setup category` - Set ticket category',
                    '`/setup support-role` - Add support role',
                    '`/setup language` - Set bot language',
                    '`/setup auto-close` - Configure auto-close',
                    '`/setup view` - View configuration',
                ].join('\n'),
                inline: false
            },
            {
                name: '🔧 Other Commands',
                value: [
                    '`/steam link/unlink/check` - Steam ID integration',
                    '`/template save/load/list` - Panel templates',
                    '`/customcmd add/remove/list` - Custom commands',
                    '`/stats` - View detailed statistics',
                ].join('\n'),
                inline: false
            },
            {
                name: '📖 Quick Start',
                value: [
                    '1. `/setup category` - Set ticket category',
                    '2. `/setup support-role` - Add support role',
                    '3. `/panel create` - Create a panel',
                    '4. `/panel add-button` - Add buttons',
                    '5. `/panel send` - Send to channel',
                ].join('\n'),
                inline: false
            }
        )
        .setFooter({ text: 'Ticket Bot • Similar to TicketKing' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}
