import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as DB from '../../web/database.js';

export const data = new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Request a vouch/rating from a user for a transaction.')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The user to request vouch from')
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
    const user = interaction.options.getUser('user');
    const guildIcon = interaction.guild.iconURL({ forceStatic: false }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const config = DB.getGuild.get(interaction.guildId, interaction.botId);
    const vouchData = config?.vouch_data ? JSON.parse(config.vouch_data) : {};

    // Defaults
    const title = vouchData.title || '⭐ BERI VOUCH KE SERVER KAMI ⭐';
    let description = vouchData.description || 'Halo {user}, terima kasih telah menggunakan layanan kami!\n\n**Mohon berikan penilaian Anda dengan menekan tombol angka di bawah ini:**\n\n1️⃣ : Sangat Buruk\n2️⃣ : Buruk\n3️⃣ : Cukup\n4️⃣ : Baik\n5️⃣ : Sangat Baik';

    // Replace placeholders
    description = description.replace(/{user}/gi, user.toString()).replace(/{guild}/gi, interaction.guild.name);

    // Embed
    const embed = new EmbedBuilder()
        .setColor('#FFD700') // Gold color
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: 'Terima kasih atas kepercayaan Anda!', iconURL: guildIcon })
        .setTimestamp();

    // Create Buttons
    const row = new ActionRowBuilder();
    const btnStyles = [ButtonStyle.Secondary, ButtonStyle.Secondary, ButtonStyle.Primary, ButtonStyle.Primary, ButtonStyle.Success];

    // Use custom buttons if defined (and has 5 items)
    if (vouchData.buttons && Array.isArray(vouchData.buttons) && vouchData.buttons.length === 5) {
        vouchData.buttons.forEach((btn, index) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`vouch_${index + 1}`)
                    .setLabel(btn.label || (index + 1).toString())
                    .setEmoji(btn.emoji || '⭐')
                    .setStyle(btnStyles[index])
            );
        });
    } else {
        // Default Buttons
        for (let i = 1; i <= 5; i++) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`vouch_${i}`)
                    .setLabel(i.toString())
                    .setEmoji('⭐')
                    .setStyle(btnStyles[i - 1])
            );
        }
    }

    // Send the embed with buttons
    await interaction.reply({
        content: `Halo ${user}, silakan isi vouch di bawah!`,
        embeds: [embed],
        components: [row]
    });
}
