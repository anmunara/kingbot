import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';

export const data = new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a user from the current ticket')
    .addUserOption(opt =>
        opt.setName('user')
            .setDescription('User to remove')
            .setRequired(true)
    );

export async function execute(interaction) {
    const ticket = db.getTicketByChannel.get(interaction.channelId);

    if (!ticket) {
        return interaction.reply({
            content: '❌ This command can only be used in a ticket channel.',
            ephemeral: true
        });
    }

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
}
