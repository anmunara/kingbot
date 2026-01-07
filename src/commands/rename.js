import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';

export const data = new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename the current ticket channel')
    .addStringOption(opt =>
        opt.setName('name')
            .setDescription('New channel name')
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
}
