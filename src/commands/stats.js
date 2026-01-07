import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';
import { t } from '../utils/i18n.js';

export const data = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View detailed ticket statistics for this server');

export async function execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    const guildConfig = db.getGuild.get(guildId, interaction.client.botId);

    // Get basic stats
    const stats = db.getTicketStats.get(guildId);

    // Get staff leaderboard
    const staffStats = db.getStaffStats.all(guildId);

    // Get tickets by category
    const categoryStats = db.getTicketsByCategory.all(guildId);

    // Format response time
    const formatTime = (seconds) => {
        if (!seconds) return 'N/A';
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${Math.round(seconds / 3600)}h`;
    };

    // Build main embed
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(t(guildId, 'stats.title'))
        .setDescription(`Statistics for **${interaction.guild.name}**`)
        .addFields(
            {
                name: `🎫 ${t(guildId, 'stats.total_tickets')}`,
                value: `${stats?.total_tickets || 0}`,
                inline: true
            },
            {
                name: `🟢 ${t(guildId, 'stats.open_tickets')}`,
                value: `${stats?.open_tickets || 0}`,
                inline: true
            },
            {
                name: `🔴 ${t(guildId, 'stats.closed_tickets')}`,
                value: `${stats?.closed_tickets || 0}`,
                inline: true
            },
            {
                name: `⏱️ ${t(guildId, 'stats.avg_response_time')}`,
                value: formatTime(stats?.avg_response_time),
                inline: true
            },
            {
                name: '📋 Panels',
                value: `${db.getPanelsByGuild.all(guildId).length}`,
                inline: true
            },
            {
                name: '👥 Staff Active',
                value: `${stats?.staff_count || 0}`,
                inline: true
            },
        )
        .setThumbnail(interaction.guild.iconURL())
        .setTimestamp();

    // Add staff leaderboard
    if (staffStats.length > 0) {
        const leaderboard = staffStats.map((s, i) => {
            const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
            return `${medal} <@${s.user_id}> - ${s.tickets_claimed} tickets (${formatTime(s.avg_response_time)} avg)`;
        }).join('\n');

        embed.addFields({
            name: `\n${t(guildId, 'stats.staff_leaderboard')}`,
            value: leaderboard,
            inline: false
        });
    }

    // Add category breakdown
    if (categoryStats.length > 0) {
        const categories = categoryStats
            .slice(0, 5)
            .map(c => `• ${c.category || 'Unknown'}: **${c.count}**`)
            .join('\n');

        embed.addFields({
            name: t(guildId, 'stats.tickets_by_category'),
            value: categories,
            inline: false
        });
    }

    await interaction.editReply({ embeds: [embed] });
}
