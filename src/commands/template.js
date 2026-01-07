import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';
import { t } from '../utils/i18n.js';

export const data = new SlashCommandBuilder()
    .setName('template')
    .setDescription('Manage panel templates')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('save')
            .setDescription('Save a panel as a template')
            .addIntegerOption(opt =>
                opt.setName('panel-id')
                    .setDescription('Panel ID to save')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(opt =>
                opt.setName('name')
                    .setDescription('Template name')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('load')
            .setDescription('Create a panel from a template')
            .addIntegerOption(opt =>
                opt.setName('template-id')
                    .setDescription('Template ID to load')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addChannelOption(opt =>
                opt.setName('channel')
                    .setDescription('Channel to send the panel')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('List all templates')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Delete a template')
            .addIntegerOption(opt =>
                opt.setName('template-id')
                    .setDescription('Template ID to delete')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    switch (subcommand) {
        case 'save': {
            const panelId = interaction.options.getInteger('panel-id');
            const name = interaction.options.getString('name');

            const panel = db.getPanel.get(panelId);
            if (!panel || panel.guild_id !== guildId) {
                return interaction.reply({ content: t(guildId, 'panel.not_found'), ephemeral: true });
            }

            const options = db.getPanelOptions.all(panelId);
            const questions = {};

            for (const opt of options) {
                questions[opt.id] = db.getQuestionsByOption.all(opt.id);
            }

            const panelData = JSON.stringify({
                panel: {
                    name: panel.name,
                    embed_title: panel.embed_title,
                    embed_description: panel.embed_description,
                    embed_color: panel.embed_color,
                    embed_image: panel.embed_image,
                    embed_thumbnail: panel.embed_thumbnail,
                    embed_footer: panel.embed_footer,
                },
                options: options.map(opt => ({
                    label: opt.label,
                    emoji: opt.emoji,
                    style: opt.style,
                    category_name: opt.category_name,
                    ticket_prefix: opt.ticket_prefix,
                    welcome_message: opt.welcome_message,
                    questions: questions[opt.id] || [],
                })),
            });

            db.createTemplate.run(guildId, name, panelData);

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle(t(guildId, 'template.saved', { name }))
                .setDescription(`Template saved from panel **${panel.name}**`)
                .addFields(
                    { name: 'Buttons', value: `${options.length}`, inline: true },
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'load': {
            const templateId = interaction.options.getInteger('template-id');
            const channel = interaction.options.getChannel('channel');

            const template = db.getTemplate.get(templateId);
            if (!template || template.guild_id !== guildId) {
                return interaction.reply({ content: t(guildId, 'template.not_found'), ephemeral: true });
            }

            const data = JSON.parse(template.panel_data);

            // Create new panel
            const panelResult = db.createPanel.run(
                guildId,
                data.panel.name + ' (from template)',
                data.panel.embed_title,
                data.panel.embed_description,
                data.panel.embed_color,
                data.panel.embed_image,
                data.panel.embed_thumbnail,
                data.panel.embed_footer,
                null,
                null
            );
            const newPanelId = panelResult.lastInsertRowid;

            // Create options and questions
            for (const opt of data.options) {
                const optResult = db.createPanelOption.run(
                    newPanelId,
                    opt.label,
                    opt.emoji,
                    opt.style || 'Primary',
                    opt.category_name,
                    opt.ticket_prefix,
                    '[]',
                    opt.welcome_message
                );
                const newOptionId = optResult.lastInsertRowid;

                // Create questions
                if (opt.questions) {
                    for (let i = 0; i < opt.questions.length; i++) {
                        const q = opt.questions[i];
                        db.createQuestion.run(
                            newOptionId,
                            q.question,
                            q.placeholder,
                            q.required ? 1 : 0,
                            q.min_length || 1,
                            q.max_length || 1000,
                            q.style || 'Paragraph',
                            i
                        );
                    }
                }
            }

            // Build and send panel
            const options = db.getPanelOptions.all(newPanelId);

            const embed = new EmbedBuilder()
                .setTitle(data.panel.embed_title)
                .setDescription(data.panel.embed_description)
                .setColor(data.panel.embed_color || config.colors.primary);

            if (data.panel.embed_image) embed.setImage(data.panel.embed_image);
            if (data.panel.embed_footer) embed.setFooter({ text: data.panel.embed_footer });

            const rows = [];
            let currentRow = new ActionRowBuilder();

            for (let i = 0; i < options.length; i++) {
                const opt = options[i];
                const button = new ButtonBuilder()
                    .setCustomId(`ticket_open_${opt.id}`)
                    .setLabel(opt.label)
                    .setStyle(ButtonStyle.Primary);

                if (opt.emoji) button.setEmoji(opt.emoji);
                currentRow.addComponents(button);

                if ((i + 1) % 5 === 0 || i === options.length - 1) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
            }

            const message = await channel.send({ embeds: [embed], components: rows });
            db.updatePanelMessage.run(channel.id, message.id, newPanelId);

            const successEmbed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle(t(guildId, 'template.loaded', { name: template.name }))
                .setDescription(`Panel sent to ${channel}`)
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
            break;
        }

        case 'list': {
            const templates = db.getTemplatesByGuild.all(guildId);

            if (templates.length === 0) {
                return interaction.reply({ content: t(guildId, 'template.list_empty'), ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle('📋 Panel Templates')
                .setDescription(templates.map(t => {
                    const data = JSON.parse(t.panel_data);
                    return `**${t.id}.** ${t.name} - ${data.options?.length || 0} buttons`;
                }).join('\n'))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'delete': {
            const templateId = interaction.options.getInteger('template-id');

            const template = db.getTemplate.get(templateId);
            if (!template || template.guild_id !== guildId) {
                return interaction.reply({ content: t(guildId, 'template.not_found'), ephemeral: true });
            }

            db.deleteTemplate.run(templateId);

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle(t(guildId, 'template.deleted', { name: template.name }))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }
    }
}

// Autocomplete
export async function autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'panel-id') {
        const panels = db.getPanelsByGuild.all(interaction.guildId);
        const filtered = panels
            .filter(p => p.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(p => ({ name: `${p.id} - ${p.name}`, value: p.id }))
        );
    }

    if (focusedOption.name === 'template-id') {
        const templates = db.getTemplatesByGuild.all(interaction.guildId);
        const filtered = templates
            .filter(t => t.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(t => ({ name: `${t.id} - ${t.name}`, value: t.id }))
        );
    }
}
