import { Events } from 'discord.js';
import * as db from '../database/db.js';

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message) {
    // Ignore bot messages
    if (message.author.bot) return;

    // Update ticket activity
    const ticket = db.getTicketByChannel.get(message.channel.id);
    if (ticket && ticket.status === 'open') {
        // Update last activity
        db.updateTicketActivity.run(message.channel.id);

        // Track first response from staff (not ticket owner)
        if (message.author.id !== ticket.user_id && !ticket.first_response_at) {
            db.setFirstResponse.run(ticket.id);
        }
    }

    // Handle custom commands (prefix: !)
    if (message.content.startsWith('!')) {
        const trigger = message.content.slice(1).split(' ')[0].toLowerCase();
        const cmd = db.getCustomCommand.get(message.guildId, trigger);

        if (cmd) {
            // Build response
            if (cmd.embed_title || cmd.embed_description) {
                const { EmbedBuilder } = await import('discord.js');
                const { config } = await import('../config.js');

                const embed = new EmbedBuilder()
                    .setColor(cmd.embed_color || config.colors.primary);

                if (cmd.embed_title) embed.setTitle(cmd.embed_title);
                if (cmd.embed_description) embed.setDescription(cmd.embed_description);

                await message.reply({
                    content: cmd.response || null,
                    embeds: [embed],
                });
            } else if (cmd.response) {
                await message.reply({ content: cmd.response });
            }
        }
    }
}
