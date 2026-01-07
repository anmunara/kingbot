import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';
import { t } from '../utils/i18n.js';

/**
 * Check for inactive tickets and auto-close them
 * @param {Client} client - Discord.js client
 */
export async function checkAutoClose(client) {
    try {
        // Get tickets that need warning
        const ticketsToWarn = db.getTicketsToWarn.all();

        for (const ticket of ticketsToWarn) {
            try {
                const guild = await client.guilds.fetch(ticket.guild_id);
                const channel = await guild.channels.fetch(ticket.channel_id);

                if (channel) {
                    const embed = new EmbedBuilder()
                        .setColor(config.colors.warning)
                        .setDescription(t(ticket.guild_id, 'ticket.auto_close_warning', {
                            hours: ticket.auto_close_warning_hours
                        }))
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                    db.markTicketWarned.run(ticket.id);
                }
            } catch (error) {
                console.error(`Failed to warn ticket ${ticket.id}:`, error.message);
            }
        }

        // Get tickets to close
        const ticketsToClose = db.getInactiveTickets.all();

        for (const ticket of ticketsToClose) {
            try {
                const guild = await client.guilds.fetch(ticket.guild_id);
                const channel = await guild.channels.fetch(ticket.channel_id);
                const guildConfig = db.getGuild.get(ticket.guild_id, client.botId);

                if (channel) {
                    // Generate transcript if enabled
                    let transcriptUrl = null;
                    if (config.ticket.transcriptEnabled && guildConfig?.transcript_channel_id) {
                        try {
                            const discordTranscripts = await import('discord-html-transcripts');
                            const transcript = await discordTranscripts.createTranscript(channel, {
                                limit: -1,
                                returnBuffer: false,
                                filename: `ticket-${ticket.ticket_number}.html`,
                            });

                            const transcriptChannel = await guild.channels.fetch(guildConfig.transcript_channel_id);
                            if (transcriptChannel) {
                                const msg = await transcriptChannel.send({
                                    content: `📋 Transcript for Ticket #${ticket.ticket_number} (Auto-closed)`,
                                    files: [transcript],
                                });
                                // Get the actual attachment URL (the .html file), not the message URL
                                transcriptUrl = msg.attachments.first()?.url || msg.url;
                                db.updateTicketTranscript.run(transcriptUrl, ticket.id);
                            }
                        } catch (e) {
                            console.error('Error generating transcript:', e);
                        }
                    }

                    // Update database
                    db.closeTicket.run('Auto-Close', 'Ticket closed due to inactivity', ticket.id);

                    // Send close message
                    const embed = new EmbedBuilder()
                        .setColor(config.colors.error)
                        .setTitle('🔒 Ticket Auto-Closed')
                        .setDescription(t(ticket.guild_id, 'ticket.auto_closed'))
                        .setTimestamp();

                    if (transcriptUrl) {
                        embed.addFields({ name: 'Transcript', value: `[View Transcript](${transcriptUrl})`, inline: false });
                    }

                    await channel.send({ embeds: [embed] });

                    // Log ticket closure
                    if (guildConfig?.log_channel_id) {
                        try {
                            const logChannel = await guild.channels.fetch(guildConfig.log_channel_id);
                            const logEmbed = new EmbedBuilder()
                                .setColor(config.colors.error)
                                .setTitle('🔒 Ticket Auto-Closed')
                                .addFields(
                                    { name: 'Ticket', value: `#${ticket.ticket_number}`, inline: true },
                                    { name: 'Reason', value: 'Inactivity', inline: true },
                                )
                                .setTimestamp();

                            if (transcriptUrl) {
                                logEmbed.addFields({ name: 'Transcript', value: `[View](${transcriptUrl})`, inline: true });
                            }

                            await logChannel.send({ embeds: [logEmbed] });
                        } catch (e) { }
                    }

                    // Delete channel after 5 seconds
                    setTimeout(async () => {
                        try {
                            await channel.delete();
                        } catch (e) { }
                    }, 5000);
                }
            } catch (error) {
                console.error(`Failed to auto-close ticket ${ticket.id}:`, error.message);
            }
        }
    } catch (error) {
        console.error('Auto-close check error:', error);
    }
}

/**
 * Start the auto-close scheduler
 * @param {Client} client - Discord.js client
 */
export function startAutoCloseScheduler(client) {
    // Check every 5 minutes
    setInterval(() => {
        checkAutoClose(client);
    }, 5 * 60 * 1000);

    console.log('✓ Auto-close scheduler started (checking every 5 minutes)');
}
