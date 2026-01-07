import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';
import { t } from '../utils/i18n.js';

export const data = new SlashCommandBuilder()
    .setName('steam')
    .setDescription('Link your Steam account')
    .addSubcommand(sub =>
        sub.setName('link')
            .setDescription('Link your Steam ID')
            .addStringOption(opt =>
                opt.setName('steamid')
                    .setDescription('Your Steam ID (e.g., 76561198012345678)')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('unlink')
            .setDescription('Unlink your Steam account')
    )
    .addSubcommand(sub =>
        sub.setName('check')
            .setDescription('Check a user\'s Steam ID')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('User to check')
                    .setRequired(false)
            )
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    switch (subcommand) {
        case 'link': {
            const steamId = interaction.options.getString('steamid');

            // Basic Steam ID validation (17 digits starting with 7656)
            if (!/^7656\d{13}$/.test(steamId)) {
                return interaction.reply({
                    content: '❌ Invalid Steam ID format. Please use your Steam64 ID (17 digits starting with 7656).\n\nYou can find it at: https://steamid.io/',
                    ephemeral: true
                });
            }

            db.linkSteam.run(interaction.user.id, steamId, null);

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setDescription(t(guildId, 'steam.linked', { steamId }))
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
        }

        case 'unlink': {
            const existing = db.getSteamLink.get(interaction.user.id);

            if (!existing) {
                return interaction.reply({
                    content: t(guildId, 'steam.not_linked'),
                    ephemeral: true
                });
            }

            db.unlinkSteam.run(interaction.user.id);

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setDescription(t(guildId, 'steam.unlinked'))
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
        }

        case 'check': {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const steamLink = db.getSteamLink.get(targetUser.id);

            if (!steamLink) {
                const msg = targetUser.id === interaction.user.id
                    ? t(guildId, 'steam.not_linked')
                    : t(guildId, 'steam.user_not_linked');
                return interaction.reply({ content: msg, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setDescription(t(guildId, 'steam.user_steam', {
                    user: targetUser.username,
                    steamId: steamLink.steam_id
                }))
                .addFields(
                    { name: 'Steam Profile', value: `[Open Profile](https://steamcommunity.com/profiles/${steamLink.steam_id})`, inline: true },
                    { name: 'Linked At', value: `<t:${Math.floor(new Date(steamLink.linked_at).getTime() / 1000)}:R>`, inline: true }
                )
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }
    }
}
