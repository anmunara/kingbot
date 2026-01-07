import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';

export const data = new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a user to the current ticket')
    .addUserOption(opt =>
        opt.setName('user')
            .setDescription('User to add')
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
}
