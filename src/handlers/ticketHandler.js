import {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../database/db.js';

// ===================
// Open Ticket Button
// ===================

export async function handleTicketButton(interaction) {
    const optionId = parseInt(interaction.customId.replace('ticket_open_', ''));
    const option = db.getPanelOption.get(optionId);

    if (!option) {
        return interaction.reply({ content: '❌ This ticket option no longer exists.', ephemeral: true });
    }

    // Check if option is disabled
    if (option.is_disabled) {
        return interaction.reply({ content: '❌ This ticket option is currently disabled.', ephemeral: true });
    }

    // Check for required roles
    let requiredRoles = [];
    try { requiredRoles = JSON.parse(option.required_roles || '[]'); } catch (e) { }

    if (requiredRoles.length > 0) {
        if (!interaction.member.roles.cache.hasAny(...requiredRoles)) {
            return interaction.reply({
                content: `❌ You need one of the following roles to open this ticket: ${requiredRoles.map(r => `<@&${r}>`).join(', ')}`,
                ephemeral: true
            });
        }
    }

    // Check Steam Requirement
    if (option.steam_required === 1) {
        // TODO: Implement actual Steam Link check against database
        const hasSteam = true; // Stub - defaulting to true for testing UI
        if (!hasSteam) {
            return interaction.reply({
                content: `❌ **Steam Integration Required**\nYou must link your Steam account to open this ticket.\nUse \`/link\` or visit the dashboard.`,
                ephemeral: true
            });
        }
    }

    // Check if user already has an open ticket for this option
    const existingTicket = db.getOpenTicketByUser.get(interaction.guildId, interaction.user.id, optionId);
    if (existingTicket) {
        return interaction.reply({
            content: `❌ You already have an open ticket: <#${existingTicket.channel_id}>`,
            ephemeral: true
        });
    }

    // Check for questions - if exists, show modal
    const questions = db.getQuestionsByOption.all(optionId);

    if (questions && questions.length > 0) {
        const modal = new ModalBuilder()
            .setCustomId(`ticket_form_${optionId}`)
            .setTitle(`${option.label} - Ticket Form`);

        // Add up to 5 questions (Discord modal limit)
        const limitedQuestions = questions.slice(0, 5);

        for (const q of limitedQuestions) {
            const input = new TextInputBuilder()
                .setCustomId(`q_${q.id}`)
                .setLabel(q.question.substring(0, 45))
                .setPlaceholder(q.placeholder || 'Enter your answer...')
                .setRequired(q.required === 1)
                .setMinLength(q.min_length || 1)
                .setMaxLength(q.max_length || 1000)
                .setStyle(q.style === 'Short' ? TextInputStyle.Short : TextInputStyle.Paragraph);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
        }

        return interaction.showModal(modal);
    }

    // No questions - create ticket directly
    await interaction.deferReply({ ephemeral: true });
    await createTicketChannel(interaction, option, null);
}

// ===================
// Modal Submit
// ===================

export async function handleTicketModal(interaction) {
    const optionId = parseInt(interaction.customId.replace('ticket_form_', ''));
    const option = db.getPanelOption.get(optionId);

    if (!option) {
        return interaction.reply({ content: '❌ This ticket option no longer exists.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // Collect responses
    const responses = [];
    const questions = db.getQuestionsByOption.all(optionId);

    for (const q of questions.slice(0, 5)) {
        const answer = interaction.fields.getTextInputValue(`q_${q.id}`);
        responses.push({ question: q.question, response: answer });
    }

    await createTicketChannel(interaction, option, responses);
}

// ===================
// Create Ticket Channel
// ===================

async function createTicketChannel(interaction, option, responses) {
    const guild = interaction.guild;
    const user = interaction.user;
    const botId = interaction.client.botId;
    const guildConfig = db.getGuild.get(guild.id, botId);

    // Get next ticket number
    const ticketNumber = db.getNextTicketNumber(guild.id, botId);

    // Generate channel name
    let namePattern = option.ticket_prefix || option.category_name || 'ticket';

    // If pattern doesn't have variables, use legacy format: prefix-username-number
    if (!namePattern.includes('{') && !namePattern.includes('}')) {
        namePattern = `${namePattern}-{USER}-{TICKET_NUMBER}`;
    }

    // Fetch Steam ID if needed
    const steamLink = db.getSteamLink.get(user.id);
    const steamId = steamLink ? steamLink.steam_id : 'no-steam'; // Default if not linked

    // Replace Variables
    let rawName = namePattern
        // User Info
        .replace(/{USER}/gi, user.username)
        .replace(/{USER_NAME}/gi, user.username)
        .replace(/{USERNAME}/gi, user.username)
        .replace(/{USER_ID}/gi, user.id)
        .replace(/{USER_DISCRIMINATOR}/gi, user.discriminator || '0')

        // Ticket Info
        .replace(/{TICKET_NUMBER}/gi, ticketNumber)
        .replace(/{TYPE}/gi, option.label)

        // Guild/External Info
        .replace(/{GUILD_NAME}/gi, guild.name)
        .replace(/{STEAM_ID}/gi, steamId);


    let channelName;

    if (option.ticket_style === 'thread') {
        // Threads allow mixed case, spaces, emojis, and special chars
        channelName = rawName.substring(0, 100);
    } else {
        // Text Channels are strict: lowercase, no spaces, alphanumeric + dashes/underscores
        channelName = rawName
            .toLowerCase()
            .replace(/\s+/g, '-') // Replace spaces with dashes
            .replace(/[^a-z0-9-_]/g, '') // Keep only valid channel chars (removes emojis/brackets)
            .substring(0, 100);
    }

    // Build permission overwrites
    const permissionOverwrites = [
        {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        },
    ];

    // Add support roles
    let supportRoles = [];
    try {
        supportRoles = JSON.parse(option.support_role_ids || '[]');
    } catch (e) { }

    // Also add global support roles from guild config
    let globalSupportRoles = [];
    try {
        globalSupportRoles = JSON.parse(guildConfig?.support_role_ids || '[]');
    } catch (e) { }

    const allSupportRoles = [...new Set([...supportRoles, ...globalSupportRoles])];

    for (const roleId of allSupportRoles) {
        permissionOverwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ManageMessages,
            ],
        });
    }

    try {
        let channel;

        if (option.ticket_style === 'thread') {
            // Create Private Thread
            // Threads must be created in a text channel. We use the interaction channel.
            // If interaction channel is a thread, we can't create a sub-thread? (Discord limitation)
            // Assuming panel is in a text channel.

            // Note: Private threads require 'SendMessages' and 'CreatePrivateThreads' permissions or be in a forum?
            // Standard Private Thread in Text Channel:
            channel = await interaction.channel.threads.create({
                name: channelName,
                type: ChannelType.PrivateThread,
                reason: `Ticket created by ${user.tag}`,
                invitable: false
            });
            // Add user to thread
            await channel.members.add(user.id);
            // Add support roles (manually or just mention them in welcome message? Threads permissions are weird)
            // Private threads inherit permissions from parent but restricted to members.
            // We just add the user. Logic below mentions roles, they might see it if they have Manage Threads?
            // Better to add them if possible, but bots can't add roles to threads directly easily without them pinging?
            // We'll rely on the ping in welcome message for support team.

        } else {
            // Create Text Channel (Default)
            channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: option.ticket_category_id || guildConfig?.ticket_category_id || null,
                permissionOverwrites,
                topic: `Ticket #${ticketNumber} | Created by ${user.tag} | ${option.label}`,
            });
        }

        // Save ticket to database
        const result = db.createTicket.run(
            botId,
            guild.id,
            channel.id,
            user.id,
            option.panel_id,
            option.id,
            ticketNumber
        );
        const ticketId = result.lastInsertRowid;

        // Save responses if any
        if (responses) {
            for (const r of responses) {
                db.saveTicketResponse.run(ticketId, r.question, r.response);
            }
        }

        // Build welcome embed
        const embed = new EmbedBuilder()
            .setColor(config.colors.ticket)
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription(option.welcome_message || `Welcome ${user}! Support will be with you shortly.\n\nPlease describe your issue in detail.`)
            .addFields(
                { name: 'Created By', value: `${user}`, inline: true },
                { name: 'Category', value: option.label, inline: true },
                { name: 'Status', value: '🟢 Open', inline: true },
            )
            .setTimestamp()
            .setFooter({ text: `Ticket ID: ${ticketId}` });

        // Add form responses to embed
        if (responses && responses.length > 0) {
            embed.addFields({ name: '\u200b', value: '**📝 Form Responses**', inline: false });
            for (const r of responses) {
                embed.addFields({
                    name: r.question,
                    value: r.response || '*No response*',
                    inline: false,
                });
            }
        }

        // Create action buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Close Ticket')
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_claim')
                .setLabel('Claim')
                .setEmoji('✋')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_transcript')
                .setLabel('Transcript')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary),
        );

        // Prepare Content (Pings + Custom Message)
        let content = `${user}`; // Always mention user at least

        // Add Role Pings if enabled
        if (option.pings_enabled === 1) {
            const roleMentions = allSupportRoles.map(r => `<@&${r}>`).join(' ');
            if (roleMentions) content += ` ${roleMentions}`;
        }

        // Prepend Custom Message if set
        if (option.ticket_message) {
            let msg = option.ticket_message
                .replace(/{USER}/g, user.toString())
                .replace(/{TICKET_NUMBER}/g, ticketNumber);
            content = `${msg}\n\n${content}`;
        }

        // Send welcome message
        const welcomeMsg = await channel.send({
            content: content,
            embeds: [embed],
            components: [row],
        });

        // Send Staff Thread Message if set
        if (option.staff_thread_message) {
            // In a thread, this is just a second message. In text channel, same.
            // We format it mostly for staff info
            const staffMsg = option.staff_thread_message
                .replace(/{USER}/g, user.username)
                .replace(/{USER_ID}/g, user.id)
                .replace(/{TICKET_NUMBER}/g, ticketNumber);

            await channel.send({ content: `**Staff Info:**\n${staffMsg}` });
        }

        // Reply to user
        await interaction.editReply({
            content: `✅ Your ticket has been created: ${channel}`,
        });

        // Log ticket creation
        await logTicketAction(guild, 'create', {
            ticketId,
            ticketNumber,
            channel,
            user,
            category: option.label,
        }, botId);

    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.editReply({
            content: '❌ Failed to create ticket. Please contact an administrator.',
        });
    }
}

// ===================
// Ticket Actions
// ===================

export async function handleTicketAction(interaction) {
    const action = interaction.customId.replace('ticket_', '');
    const ticket = db.getTicketByChannel.get(interaction.channelId);

    if (!ticket) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    }

    switch (action) {
        case 'close':
            await closeTicket(interaction, ticket);
            break;
        case 'claim':
            await claimTicket(interaction, ticket);
            break;
        case 'unclaim':
            await unclaimTicket(interaction, ticket);
            break;
        case 'transcript':
            await generateTranscript(interaction, ticket);
            break;
        default:
            await interaction.reply({ content: '❌ Unknown action.', ephemeral: true });
    }
}

// ===================
// Close Ticket
// ===================

async function closeTicket(interaction, ticket) {
    await interaction.deferReply();

    const guildConfig = db.getGuild.get(interaction.guildId, interaction.client.botId);

    // Update database
    db.closeTicket.run(interaction.user.id, 'Closed by user', ticket.id);

    // Generate transcript if enabled
    let transcriptUrl = null;
    if (config.ticket.transcriptEnabled && guildConfig?.transcript_channel_id) {
        try {
            const discordTranscripts = await import('discord-html-transcripts');
            const transcript = await discordTranscripts.createTranscript(interaction.channel, {
                limit: -1,
                returnBuffer: false,
                filename: `ticket-${ticket.ticket_number}.html`,
            });

            const transcriptChannel = await interaction.guild.channels.fetch(guildConfig.transcript_channel_id);
            if (transcriptChannel) {
                const msg = await transcriptChannel.send({
                    content: `📋 Transcript for Ticket #${ticket.ticket_number}`,
                    files: [transcript],
                });
                // Get the actual attachment URL (the .html file), not the message URL
                transcriptUrl = msg.attachments.first()?.url || msg.url;
                db.updateTicketTranscript.run(transcriptUrl, ticket.id);
            }
        } catch (error) {
            console.error('Error generating transcript:', error);
        }
    }

    // Send close message
    const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('🔒 Ticket Closed')
        .setDescription(`This ticket has been closed by ${interaction.user}`)
        .addFields(
            { name: 'Closed By', value: `${interaction.user}`, inline: true },
            { name: 'Ticket ID', value: `#${ticket.ticket_number}`, inline: true },
        )
        .setTimestamp();

    if (transcriptUrl) {
        embed.addFields({ name: 'Transcript', value: `[View Transcript](${transcriptUrl})`, inline: false });
    }

    await interaction.editReply({ embeds: [embed], components: [] });

    // Log ticket closure
    await logTicketAction(interaction.guild, 'close', {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        channel: interaction.channel,
        user: interaction.user,
        transcriptUrl,
    }, interaction.client.botId);

    // Delete channel after 5 seconds
    // Delete channel after 5 seconds
    setTimeout(async () => {
        try {
            // Save messages before deletion
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const serializedMessages = Array.from(messages.values()).reverse().map(m => ({
                id: m.id,
                content: m.content,
                author: {
                    username: m.author.username,
                    avatar: m.author.displayAvatarURL(),
                    bot: m.author.bot,
                    color: m.member?.displayHexColor
                },
                createdTimestamp: m.createdTimestamp,
                attachments: m.attachments.map(a => ({
                    url: a.url,
                    name: a.name,
                    contentType: a.contentType
                })),
                embeds: m.embeds,
                mentions: {
                    users: m.mentions.users ? Array.from(m.mentions.users.values()).map(u => ({ id: u.id, username: u.username })) : [],
                    roles: m.mentions.roles ? Array.from(m.mentions.roles.values()).map(r => ({ id: r.id, name: r.name, color: r.hexColor })) : [],
                    channels: m.mentions.channels ? Array.from(m.mentions.channels.values()).map(c => ({ id: c.id, name: c.name })) : []
                },
                components: m.components
            }));

            db.saveTicketMessages.run(JSON.stringify(serializedMessages), ticket.id);

            await interaction.channel.delete();
        } catch (error) {
            console.error('Error deleting channel:', error);
        }
    }, 5000);
}

// ===================
// Claim Ticket
// ===================

async function claimTicket(interaction, ticket) {
    if (ticket.claimed_by) {
        return interaction.reply({
            content: `❌ This ticket is already claimed by <@${ticket.claimed_by}>`,
            ephemeral: true
        });
    }

    db.claimTicket.run(interaction.user.id, ticket.id);

    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setDescription(`✋ **${interaction.user}** has claimed this ticket.`)
        .setTimestamp();

    // Update buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('ticket_unclaim')
            .setLabel('Unclaim')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_transcript')
            .setLabel('Transcript')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
}

// ===================
// Unclaim Ticket
// ===================

async function unclaimTicket(interaction, ticket) {
    if (ticket.claimed_by !== interaction.user.id) {
        return interaction.reply({
            content: '❌ Only the person who claimed this ticket can unclaim it.',
            ephemeral: true
        });
    }

    db.claimTicket.run(null, ticket.id);

    const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setDescription(`❌ **${interaction.user}** has unclaimed this ticket.`)
        .setTimestamp();

    // Reset buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('ticket_claim')
            .setLabel('Claim')
            .setEmoji('✋')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_transcript')
            .setLabel('Transcript')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
}

// ===================
// Generate Transcript
// ===================

async function generateTranscript(interaction, ticket) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const discordTranscripts = await import('discord-html-transcripts');
        const transcript = await discordTranscripts.createTranscript(interaction.channel, {
            limit: -1,
            returnBuffer: false,
            filename: `ticket-${ticket.ticket_number}.html`,
        });

        await interaction.editReply({
            content: '📋 Here is the transcript:',
            files: [transcript],
        });
    } catch (error) {
        console.error('Error generating transcript:', error);
        await interaction.editReply({
            content: '❌ Failed to generate transcript.',
        });
    }
}

// ===================
// Log Actions
// ===================

async function logTicketAction(guild, action, data, botId) {
    const guildConfig = db.getGuild.get(guild.id, botId);
    if (!guildConfig?.log_channel_id) return;

    try {
        const logChannel = await guild.channels.fetch(guildConfig.log_channel_id);
        if (!logChannel) return;

        let embed;

        switch (action) {
            case 'create':
                embed = new EmbedBuilder()
                    .setColor(config.colors.success)
                    .setTitle('🎫 Ticket Created')
                    .addFields(
                        { name: 'Ticket', value: `#${data.ticketNumber}`, inline: true },
                        { name: 'User', value: `${data.user}`, inline: true },
                        { name: 'Category', value: data.category, inline: true },
                        { name: 'Channel', value: `${data.channel}`, inline: false },
                    )
                    .setTimestamp();
                break;

            case 'close':
                embed = new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle('🔒 Ticket Closed')
                    .addFields(
                        { name: 'Ticket', value: `#${data.ticketNumber}`, inline: true },
                        { name: 'Closed By', value: `${data.user}`, inline: true },
                    )
                    .setTimestamp();

                if (data.transcriptUrl) {
                    embed.addFields({ name: 'Transcript', value: `[View](${data.transcriptUrl})`, inline: true });
                }
                break;
        }

        if (embed) {
            await logChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error logging ticket action:', error);
    }
}
