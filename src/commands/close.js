import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';

export const data = new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket')
    .addStringOption(opt =>
        opt.setName('reason')
            .setDescription('Reason for closing')
            .setRequired(false)
    );

export async function execute(interaction) {
    const ticket = db.getTicketByChannel.get(interaction.channelId);

    if (!ticket) {
        return interaction.reply({
            content: '❌ This command can only be used in a ticket channel.',
            ephemeral: true
        });
    }

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
    setTimeout(async () => {
        try {
            await interaction.channel.delete();
        } catch (error) {
            console.error('Error deleting channel:', error);
        }
    }, 5000);
}
