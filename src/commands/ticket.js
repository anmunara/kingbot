import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';

export const data = new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management commands')
    .addSubcommand(sub =>
        sub.setName('close')
            .setDescription('Close the current ticket')
            .addStringOption(opt =>
                opt.setName('reason')
                    .setDescription('Reason for closing')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Add a user to the ticket')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('User to add')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Remove a user from the ticket')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('User to remove')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('rename')
            .setDescription('Rename the ticket channel')
            .addStringOption(opt =>
                opt.setName('name')
                    .setDescription('New channel name')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('info')
            .setDescription('View ticket information')
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const ticket = db.getTicketByChannel.get(interaction.channelId);

    if (!ticket) {
        return interaction.reply({
            content: '❌ This command can only be used in a ticket channel.',
            ephemeral: true
        });
    }

    switch (subcommand) {
        case 'close': {
            const reason = interaction.options.getString('reason') || 'No reason provided';

            await interaction.deferReply();

            const guildConfig = db.getGuild.get(interaction.guildId, interaction.client.botId);

            // Update database
            db.closeTicket.run(interaction.user.id, reason, ticket.id);

            // Generate transcript if enabled
            let transcriptUrl = null;
            if (config.ticket.transcriptEnabled && guildConfig?.transcript_channel_id) {
                try {
                    const discordTranscripts = await import('discord-html-transcripts');
                    const transcript = await discordTranscripts.createTranscript(interaction.channel, {
                        limit: -1,
                        returnBuffer: false,
                        filename: `ticket-${ticket.ticket_number}.html`,
                    });

                    const transcriptChannel = await interaction.guild.channels.fetch(guildConfig.transcript_channel_id);
                    if (transcriptChannel) {
                        const msg = await transcriptChannel.send({
                            content: `📋 Transcript for Ticket #${ticket.ticket_number}`,
                            files: [transcript],
                        });
                        // Get the actual attachment URL (the .html file), not the message URL
                        transcriptUrl = msg.attachments.first()?.url || msg.url;
                        db.updateTicketTranscript.run(transcriptUrl, ticket.id);
                    }
                } catch (error) {
                    console.error('Error generating transcript:', error);
                }
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('🔒 Ticket Closed')
                .setDescription(`This ticket has been closed.`)
                .addFields(
                    { name: 'Closed By', value: `${interaction.user}`, inline: true },
                    { name: 'Reason', value: reason, inline: true },
                )
                .setTimestamp();

            if (transcriptUrl) {
                embed.addFields({ name: 'Transcript', value: `[View Transcript](${transcriptUrl})`, inline: false });
            }

            await interaction.editReply({ embeds: [embed], components: [] });

            // Delete channel after 5 seconds
            // Delete channel after 5 seconds
            setTimeout(async () => {
                try {
                    // Save messages before deletion
                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    const serializedMessages = Array.from(messages.values()).reverse().map(m => ({
                        id: m.id,
                        content: m.content,
                        author: {
                            username: m.author.username,
                            avatar: m.author.displayAvatarURL(),
                            bot: m.author.bot,
                            color: m.member?.displayHexColor
                        },
                        createdTimestamp: m.createdTimestamp,
                        attachments: m.attachments.map(a => ({
                            url: a.url,
                            name: a.name,
                            contentType: a.contentType
                        })),
                        embeds: m.embeds,
                        mentions: {
                            users: m.mentions.users ? Array.from(m.mentions.users.values()).map(u => ({ id: u.id, username: u.username })) : [],
                            roles: m.mentions.roles ? Array.from(m.mentions.roles.values()).map(r => ({ id: r.id, name: r.name, color: r.hexColor })) : [],
                            channels: m.mentions.channels ? Array.from(m.mentions.channels.values()).map(c => ({ id: c.id, name: c.name })) : []
                        },
                        components: m.components
                    }));

                    db.saveTicketMessages.run(JSON.stringify(serializedMessages), ticket.id);

                    await interaction.channel.delete();
                } catch (error) {
                    console.error('Error deleting channel:', error);
                }
            }, 5000);
            break;
        }

        case 'add': {
            const user = interaction.options.getUser('user');

            // Add permission to channel
            try {
                await interaction.channel.permissionOverwrites.edit(user.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true,
                });

                db.addParticipant.run(ticket.id, user.id, interaction.user.id);

                const embed = new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setDescription(`✅ ${user} has been added to this ticket.`)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                await interaction.reply({ content: '❌ Failed to add user.', ephemeral: true });
            }
            break;
        }

        case 'remove': {
            const user = interaction.options.getUser('user');

            // Check if trying to remove ticket owner
            if (user.id === ticket.user_id) {
                return interaction.reply({
                    content: '❌ Cannot remove the ticket owner.',
                    ephemeral: true
                });
            }

            try {
                await interaction.channel.permissionOverwrites.delete(user.id);
                db.removeParticipant.run(ticket.id, user.id);

                const embed = new EmbedBuilder()
                    .setColor(config.colors.warning)
                    .setDescription(`❌ ${user} has been removed from this ticket.`)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                await interaction.reply({ content: '❌ Failed to remove user.', ephemeral: true });
            }
            break;
        }

        case 'rename': {
            const name = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-]/g, '-');

            try {
                await interaction.channel.setName(name);

                const embed = new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setDescription(`✅ Ticket renamed to **${name}**`)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                await interaction.reply({ content: '❌ Failed to rename ticket.', ephemeral: true });
            }
            break;
        }

        case 'info': {
            const option = ticket.option_id ? db.getPanelOption.get(ticket.option_id) : null;
            const responses = db.getTicketResponses.all(ticket.id);
            const participants = db.getParticipants.all(ticket.id);

            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle(`🎫 Ticket #${ticket.ticket_number}`)
                .addFields(
                    { name: 'Created By', value: `<@${ticket.user_id}>`, inline: true },
                    { name: 'Category', value: option?.label || 'Unknown', inline: true },
                    { name: 'Status', value: ticket.status === 'open' ? '🟢 Open' : '🔴 Closed', inline: true },
                    { name: 'Claimed By', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : '*Unclaimed*', inline: true },
                    { name: 'Created At', value: `<t:${Math.floor(new Date(ticket.opened_at).getTime() / 1000)}:F>`, inline: true },
                )
                .setTimestamp();

            if (participants.length > 0) {
                embed.addFields({
                    name: 'Added Users',
                    value: participants.map(p => `<@${p.user_id}>`).join(', '),
                    inline: false
                });
            }

            if (responses.length > 0) {
                embed.addFields({ name: '\u200b', value: '**📝 Form Responses**', inline: false });
                for (const r of responses) {
                    embed.addFields({
                        name: r.question,
                        value: r.response?.substring(0, 1000) || '*No response*',
                        inline: false,
                    });
                }
            }

            await interaction.reply({ embeds: [embed] });
            break;
        }
    }
}
