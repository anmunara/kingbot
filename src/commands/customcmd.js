import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';
import { t } from '../utils/i18n.js';

export const data = new SlashCommandBuilder()
    .setName('customcmd')
    .setDescription('Manage custom commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Add a custom command')
            .addStringOption(opt =>
                opt.setName('trigger')
                    .setDescription('Command trigger (e.g., "rules" for !rules)')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('response')
                    .setDescription('Text response')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('embed-title')
                    .setDescription('Embed title (optional)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('embed-description')
                    .setDescription('Embed description (optional)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('embed-color')
                    .setDescription('Embed color hex (e.g., #5865F2)')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Remove a custom command')
            .addStringOption(opt =>
                opt.setName('trigger')
                    .setDescription('Command trigger to remove')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('List all custom commands')
    )
    .addSubcommand(sub =>
        sub.setName('test')
            .setDescription('Test a custom command')
            .addStringOption(opt =>
                opt.setName('trigger')
                    .setDescription('Command trigger to test')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const botId = interaction.client.botId;

    switch (subcommand) {
        case 'add': {
            const trigger = interaction.options.getString('trigger').toLowerCase().replace(/[^a-z0-9]/g, '');
            const response = interaction.options.getString('response');
            const embedTitle = interaction.options.getString('embed-title');
            const embedDescription = interaction.options.getString('embed-description');
            const embedColor = interaction.options.getString('embed-color');

            if (!response && !embedTitle && !embedDescription) {
                return interaction.reply({
                    content: '❌ You must provide at least a response or embed content.',
                    ephemeral: true
                });
            }

            db.createCustomCommand.run(
                botId,
                guildId,
                trigger,
                response,
                embedTitle,
                embedDescription,
                embedColor,
                interaction.user.id
            );

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle(t(guildId, 'customcmd.added', { trigger }))
                .setDescription(`Users can now use \`!${trigger}\` to trigger this command.`)
                .setTimestamp();

            if (response) embed.addFields({ name: 'Response', value: response.substring(0, 1000), inline: false });
            if (embedTitle) embed.addFields({ name: 'Embed Title', value: embedTitle, inline: true });

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'remove': {
            const trigger = interaction.options.getString('trigger').toLowerCase();

            const existing = db.getCustomCommand.get(guildId, botId, trigger);
            if (!existing) {
                return interaction.reply({
                    content: t(guildId, 'customcmd.not_found', { trigger }),
                    ephemeral: true
                });
            }

            db.deleteCustomCommand.run(guildId, botId, trigger);

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle(t(guildId, 'customcmd.removed', { trigger }))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'list': {
            const commands = db.getCustomCommandsByGuild.all(guildId, botId);

            if (commands.length === 0) {
                return interaction.reply({
                    content: t(guildId, 'customcmd.list_empty'),
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle('📋 Custom Commands')
                .setDescription(commands.map(c => {
                    const hasEmbed = c.embed_title || c.embed_description;
                    return `\`!${c.trigger}\` - ${hasEmbed ? '📋 Embed' : c.response?.substring(0, 50) + '...'}`;
                }).join('\n'))
                .setFooter({ text: `${commands.length} command(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            break;
        }

        case 'test': {
            const trigger = interaction.options.getString('trigger').toLowerCase();

            const cmd = db.getCustomCommand.get(guildId, botId, trigger);
            if (!cmd) {
                return interaction.reply({
                    content: t(guildId, 'customcmd.not_found', { trigger }),
                    ephemeral: true
                });
            }

            // Build response
            if (cmd.embed_title || cmd.embed_description) {
                const embed = new EmbedBuilder()
                    .setColor(cmd.embed_color || config.colors.primary);

                if (cmd.embed_title) embed.setTitle(cmd.embed_title);
                if (cmd.embed_description) embed.setDescription(cmd.embed_description);

                await interaction.reply({
                    content: cmd.response || null,
                    embeds: [embed],
                });
            } else {
                await interaction.reply({ content: cmd.response });
            }
            break;
        }
    }
}

// Autocomplete
export async function autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'trigger') {
        const commands = db.getCustomCommandsByGuild.all(interaction.guildId, interaction.client.botId);
        const filtered = commands
            .filter(c => c.trigger.includes(focusedOption.value.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(c => ({ name: `!${c.trigger}`, value: c.trigger }))
        );
    }
}
