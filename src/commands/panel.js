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

export const data = new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Manage ticket panels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('create')
            .setDescription('Create a new ticket panel')
            .addStringOption(opt =>
                opt.setName('name')
                    .setDescription('Panel name (internal use)')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('title')
                    .setDescription('Embed title')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('description')
                    .setDescription('Embed description')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('color')
                    .setDescription('Embed color (hex, e.g., #5865F2)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('image')
                    .setDescription('Embed image URL')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('footer')
                    .setDescription('Embed footer text')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('add-button')
            .setDescription('Add a button to a panel')
            .addIntegerOption(opt =>
                opt.setName('panel-id')
                    .setDescription('The panel ID')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(opt =>
                opt.setName('label')
                    .setDescription('Button label')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('emoji')
                    .setDescription('Button emoji (optional)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('prefix')
                    .setDescription('Ticket channel prefix (e.g., "support")')
                    .setRequired(false)
            )
            .addRoleOption(opt =>
                opt.setName('support-role')
                    .setDescription('Role with access to tickets')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('welcome-message')
                    .setDescription('Welcome message in ticket')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('add-question')
            .setDescription('Add a question to a button (shown in modal)')
            .addIntegerOption(opt =>
                opt.setName('button-id')
                    .setDescription('The button/option ID')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(opt =>
                opt.setName('question')
                    .setDescription('The question text')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('placeholder')
                    .setDescription('Placeholder text')
                    .setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName('required')
                    .setDescription('Is this question required?')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('send')
            .setDescription('Send a panel to a channel')
            .addIntegerOption(opt =>
                opt.setName('panel-id')
                    .setDescription('The panel ID')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addChannelOption(opt =>
                opt.setName('channel')
                    .setDescription('Target channel')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('List all panels')
    )
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('Delete a panel')
            .addIntegerOption(opt =>
                opt.setName('panel-id')
                    .setDescription('The panel ID to delete')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('info')
            .setDescription('View panel details')
            .addIntegerOption(opt =>
                opt.setName('panel-id')
                    .setDescription('The panel ID')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    db.upsertGuild.run(interaction.guildId, interaction.client.botId);

    switch (subcommand) {
        case 'create': {
            const name = interaction.options.getString('name');
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const color = interaction.options.getString('color') || '#5865F2';
            const image = interaction.options.getString('image');
            const footer = interaction.options.getString('footer');

            const result = db.createPanel.run(
                interaction.guildId,
                name,
                title,
                description,
                color,
                image,
                null, // thumbnail
                footer,
                null, // author name
                null  // author icon
            );

            const panelId = result.lastInsertRowid;

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Panel Created')
                .setDescription(`Panel **${name}** has been created!`)
                .addFields(
                    { name: 'Panel ID', value: `${panelId}`, inline: true },
                    { name: 'Next Steps', value: '1. Use `/panel add-button` to add buttons\n2. Use `/panel add-question` to add form questions\n3. Use `/panel send` to send to a channel', inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'add-button': {
            const panelId = interaction.options.getInteger('panel-id');
            const label = interaction.options.getString('label');
            const emoji = interaction.options.getString('emoji');
            const prefix = interaction.options.getString('prefix') || label.toLowerCase().replace(/\s+/g, '-');
            const supportRole = interaction.options.getRole('support-role');
            const welcomeMessage = interaction.options.getString('welcome-message');

            const panel = db.getPanel.get(panelId);
            if (!panel || panel.guild_id !== interaction.guildId) {
                return interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
            }

            const supportRoles = supportRole ? JSON.stringify([supportRole.id]) : '[]';

            const result = db.createPanelOption.run(
                panelId,
                label,
                emoji,
                'Primary',
                label,
                prefix,
                supportRoles,
                welcomeMessage
            );

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Button Added')
                .setDescription(`Button **${emoji || ''} ${label}** added to panel!`)
                .addFields(
                    { name: 'Button ID', value: `${result.lastInsertRowid}`, inline: true },
                    { name: 'Panel', value: panel.name, inline: true },
                    { name: 'Ticket Prefix', value: prefix, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'add-question': {
            const buttonId = interaction.options.getInteger('button-id');
            const question = interaction.options.getString('question');
            const placeholder = interaction.options.getString('placeholder');
            const required = interaction.options.getBoolean('required') ?? true;

            const option = db.getPanelOption.get(buttonId);
            if (!option) {
                return interaction.reply({ content: '❌ Button not found.', ephemeral: true });
            }

            // Check question count (Discord modal limit is 5)
            const existingQuestions = db.getQuestionsByOption.all(buttonId);
            if (existingQuestions.length >= 5) {
                return interaction.reply({ content: '❌ Maximum 5 questions per button (Discord limit).', ephemeral: true });
            }

            db.createQuestion.run(
                buttonId,
                question,
                placeholder,
                required ? 1 : 0,
                1,
                1000,
                'Paragraph',
                existingQuestions.length
            );

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Question Added')
                .setDescription(`Question added to **${option.label}** button.`)
                .addFields(
                    { name: 'Question', value: question, inline: false },
                    { name: 'Required', value: required ? 'Yes' : 'No', inline: true },
                    { name: 'Total Questions', value: `${existingQuestions.length + 1}/5`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'send': {
            const panelId = interaction.options.getInteger('panel-id');
            const channel = interaction.options.getChannel('channel');

            const panel = db.getPanel.get(panelId);
            if (!panel || panel.guild_id !== interaction.guildId) {
                return interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
            }

            const options = db.getPanelOptions.all(panelId);
            if (options.length === 0) {
                return interaction.reply({ content: '❌ Panel has no buttons. Add buttons first with `/panel add-button`.', ephemeral: true });
            }

            // Build embed
            const embed = new EmbedBuilder()
                .setTitle(panel.embed_title)
                .setDescription(panel.embed_description)
                .setColor(panel.embed_color || config.colors.primary);

            if (panel.embed_image) embed.setImage(panel.embed_image);
            if (panel.embed_thumbnail) embed.setThumbnail(panel.embed_thumbnail);
            if (panel.embed_footer) embed.setFooter({ text: panel.embed_footer });
            if (panel.embed_author_name) {
                embed.setAuthor({ name: panel.embed_author_name, iconURL: panel.embed_author_icon });
            }

            // Build buttons (max 5 per row, max 5 rows)
            const rows = [];
            let currentRow = new ActionRowBuilder();

            for (let i = 0; i < options.length; i++) {
                const opt = options[i];
                const button = new ButtonBuilder()
                    .setCustomId(`ticket_open_${opt.id}`)
                    .setLabel(opt.label)
                    .setStyle(ButtonStyle.Primary);

                if (opt.emoji) {
                    button.setEmoji(opt.emoji);
                }

                currentRow.addComponents(button);

                if ((i + 1) % 5 === 0 || i === options.length - 1) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
            }

            // Send panel
            const message = await channel.send({ embeds: [embed], components: rows });

            // Update panel with message info
            db.updatePanelMessage.run(channel.id, message.id, panelId);

            const successEmbed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Panel Sent')
                .setDescription(`Panel sent to ${channel}`)
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
            break;
        }

        case 'list': {
            const panels = db.getPanelsByGuild.all(interaction.guildId);

            if (panels.length === 0) {
                return interaction.reply({ content: '📋 No panels created yet. Use `/panel create` to create one.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle('📋 Ticket Panels')
                .setDescription(panels.map(p => {
                    const options = db.getPanelOptions.all(p.id);
                    const status = p.message_id ? '🟢 Active' : '⚫ Not sent';
                    return `**${p.id}.** ${p.name} - ${options.length} buttons - ${status}`;
                }).join('\n'))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'delete': {
            const panelId = interaction.options.getInteger('panel-id');

            const panel = db.getPanel.get(panelId);
            if (!panel || panel.guild_id !== interaction.guildId) {
                return interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
            }

            db.deletePanel.run(panelId);

            // Try to delete the panel message
            if (panel.channel_id && panel.message_id) {
                try {
                    const channel = await interaction.guild.channels.fetch(panel.channel_id);
                    const message = await channel.messages.fetch(panel.message_id);
                    await message.delete();
                } catch (e) { }
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('🗑️ Panel Deleted')
                .setDescription(`Panel **${panel.name}** has been deleted.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'info': {
            const panelId = interaction.options.getInteger('panel-id');

            const panel = db.getPanel.get(panelId);
            if (!panel || panel.guild_id !== interaction.guildId) {
                return interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
            }

            const options = db.getPanelOptions.all(panelId);

            let optionsList = '';
            for (const opt of options) {
                const questions = db.getQuestionsByOption.all(opt.id);
                optionsList += `**${opt.id}.** ${opt.emoji || ''} ${opt.label} (${questions.length} questions)\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(panel.embed_color || config.colors.primary)
                .setTitle(`📋 Panel: ${panel.name}`)
                .addFields(
                    { name: 'ID', value: `${panel.id}`, inline: true },
                    { name: 'Title', value: panel.embed_title || '*Not set*', inline: true },
                    { name: 'Status', value: panel.message_id ? '🟢 Active' : '⚫ Not sent', inline: true },
                    { name: 'Description', value: panel.embed_description?.substring(0, 200) || '*Not set*', inline: false },
                    { name: 'Buttons', value: optionsList || '*No buttons*', inline: false },
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }
    }
}

// Autocomplete handler
export async function autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'panel-id') {
        const panels = db.getPanelsByGuild.all(interaction.guildId);
        const filtered = panels
            .filter(p => p.name.toLowerCase().includes(focusedOption.value.toLowerCase()) ||
                p.id.toString().includes(focusedOption.value))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(p => ({ name: `${p.id} - ${p.name}`, value: p.id }))
        );
    }

    if (focusedOption.name === 'button-id') {
        const panels = db.getPanelsByGuild.all(interaction.guildId);
        const allOptions = [];

        for (const panel of panels) {
            const options = db.getPanelOptions.all(panel.id);
            for (const opt of options) {
                allOptions.push({ ...opt, panelName: panel.name });
            }
        }

        const filtered = allOptions
            .filter(o => o.label.toLowerCase().includes(focusedOption.value.toLowerCase()) ||
                o.id.toString().includes(focusedOption.value))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(o => ({ name: `${o.id} - ${o.label} (${o.panelName})`, value: o.id }))
        );
    }
}
