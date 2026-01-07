import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';
import { t, getLanguages, getLanguageName } from '../utils/i18n.js';

export const data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the ticket bot settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
        sub.setName('logs')
            .setDescription('Set the log channel for ticket actions')
            .addChannelOption(opt =>
                opt.setName('channel')
                    .setDescription('The channel for ticket logs')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('transcripts')
            .setDescription('Set the channel for ticket transcripts')
            .addChannelOption(opt =>
                opt.setName('channel')
                    .setDescription('The channel for transcripts')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('category')
            .setDescription('Set the category for new ticket channels')
            .addChannelOption(opt =>
                opt.setName('category')
                    .setDescription('The category for tickets')
                    .addChannelTypes(ChannelType.GuildCategory)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('support-role')
            .setDescription('Add a support team role')
            .addRoleOption(opt =>
                opt.setName('role')
                    .setDescription('The support team role')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('language')
            .setDescription('Set the bot language')
            .addStringOption(opt =>
                opt.setName('lang')
                    .setDescription('Language to use')
                    .setRequired(true)
                    .addChoices(
                        { name: 'English', value: 'en' },
                        { name: 'Bahasa Indonesia', value: 'id' }
                    )
            )
    )
    .addSubcommand(sub =>
        sub.setName('auto-close')
            .setDescription('Configure auto-close for inactive tickets')
            .addIntegerOption(opt =>
                opt.setName('hours')
                    .setDescription('Hours of inactivity before closing (0 to disable)')
                    .setRequired(true)
                    .setMinValue(0)
                    .setMaxValue(168)
            )
            .addIntegerOption(opt =>
                opt.setName('warning-hours')
                    .setDescription('Hours before close to send warning (0 for no warning)')
                    .setRequired(false)
                    .setMinValue(0)
                    .setMaxValue(48)
            )
    )
    .addSubcommand(sub =>
        sub.setName('view')
            .setDescription('View current configuration')
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // Ensure guild exists in database
    const botId = interaction.client.botId;
    db.upsertGuild.run(guildId, botId);

    switch (subcommand) {
        case 'logs': {
            const channel = interaction.options.getChannel('channel');
            db.updateGuildSetting(guildId, botId, 'log_channel_id', channel.id);

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Log Channel Set')
                .setDescription(t(guildId, 'setup.log_channel_set', { channel: `${channel}` }))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'transcripts': {
            const channel = interaction.options.getChannel('channel');
            db.updateGuildSetting(guildId, 'transcript_channel_id', channel.id);

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Transcript Channel Set')
                .setDescription(t(guildId, 'setup.transcript_channel_set', { channel: `${channel}` }))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'category': {
            const category = interaction.options.getChannel('category');
            db.updateGuildSetting(guildId, 'ticket_category_id', category.id);

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Ticket Category Set')
                .setDescription(t(guildId, 'setup.category_set', { name: category.name }))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'support-role': {
            const role = interaction.options.getRole('role');
            const guildConfig = db.getGuild.get(guildId, botId);

            let supportRoles = [];
            try {
                supportRoles = JSON.parse(guildConfig?.support_role_ids || '[]');
            } catch (e) { }

            if (!supportRoles.includes(role.id)) {
                supportRoles.push(role.id);
                db.updateGuildSetting(guildId, botId, 'support_role_ids', JSON.stringify(supportRoles));
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Support Role Added')
                .setDescription(t(guildId, 'setup.support_role_added', { role: `${role}` }))
                .addFields({
                    name: 'Current Support Roles',
                    value: supportRoles.map(r => `<@&${r}>`).join(', ') || 'None',
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'language': {
            const lang = interaction.options.getString('lang');
            db.updateGuildSetting(guildId, botId, 'language', lang);

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Language Updated')
                .setDescription(t(guildId, 'setup.language_set', { language: getLanguageName(lang) }))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'auto-close': {
            const hours = interaction.options.getInteger('hours');
            const warningHours = interaction.options.getInteger('warning-hours') || 0;

            db.updateGuildSetting(guildId, botId, 'auto_close_hours', hours);
            db.updateGuildSetting(guildId, botId, 'auto_close_warning_hours', warningHours);

            let description;
            if (hours === 0) {
                description = t(guildId, 'setup.auto_close_disabled');
            } else {
                description = t(guildId, 'setup.auto_close_set', { hours: hours });
                if (warningHours > 0) {
                    description += `\n⚠️ Warning will be sent ${warningHours} hour(s) before closing.`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Auto-Close Updated')
                .setDescription(description)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'view': {
            const guildConfig = db.getGuild.get(guildId, botId);

            let supportRoles = [];
            try {
                supportRoles = JSON.parse(guildConfig?.support_role_ids || '[]');
            } catch (e) { }

            const autoCloseStatus = guildConfig?.auto_close_hours > 0
                ? `${guildConfig.auto_close_hours} hours`
                : 'Disabled';

            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle('⚙️ Ticket Bot Configuration')
                .addFields(
                    {
                        name: '📁 Ticket Category',
                        value: guildConfig?.ticket_category_id ? `<#${guildConfig.ticket_category_id}>` : '*Not set*',
                        inline: true
                    },
                    {
                        name: '📋 Log Channel',
                        value: guildConfig?.log_channel_id ? `<#${guildConfig.log_channel_id}>` : '*Not set*',
                        inline: true
                    },
                    {
                        name: '📝 Transcript Channel',
                        value: guildConfig?.transcript_channel_id ? `<#${guildConfig.transcript_channel_id}>` : '*Not set*',
                        inline: true
                    },
                    {
                        name: '👥 Support Roles',
                        value: supportRoles.length > 0 ? supportRoles.map(r => `<@&${r}>`).join(', ') : '*None*',
                        inline: false
                    },
                    {
                        name: '🌐 Language',
                        value: getLanguageName(guildConfig?.language || 'en'),
                        inline: true
                    },
                    {
                        name: '⏰ Auto-Close',
                        value: autoCloseStatus,
                        inline: true
                    },
                    {
                        name: '🎫 Total Tickets',
                        value: `${guildConfig?.ticket_counter || 0}`,
                        inline: true
                    },
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }
    }
}

