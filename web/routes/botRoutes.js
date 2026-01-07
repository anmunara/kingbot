import { Router } from 'express';
import { authenticateToken } from './userAuth.js';
import * as db from '../database.js';
import { botManager } from '../botManager.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../../src/config.js';
import { encrypt } from '../utils/crypto.js';
import { body, validationResult } from 'express-validator';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { AuditLog } from '../utils/auditLog.js';

const router = Router();

// Bot token validation rules (relaxed - Discord validates the actual token)
const botTokenValidation = [
    body('token')
        .notEmpty().withMessage('Bot token is required')
        .isLength({ min: 50, max: 120 }).withMessage('Invalid token length')
        .trim()
];

// Get all user's bots
router.get('/', authenticateToken, (req, res) => {
    try {
        const bots = db.getBotsByUser.all(req.userId);
        res.json(bots);
    } catch (error) {
        console.error('Get bots error:', error);
        res.status(500).json({ error: 'Failed to get bots' });
    }
});

// Get Tickets for Stats (Moved to top priority)
router.get('/:id/guild/:guildId/tickets', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;

        console.log(`[Stats] Route Hit! Guild ${guildId}, Bot ${botId}`);

        // Get all tickets for this guild (up to 1000)
        const tickets = db.getTicketsByGuild.all(guildId, botId, 1000, 0);
        console.log(`[Stats] Found ${tickets?.length} tickets`);

        res.json(tickets || []);
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ error: 'Failed to get tickets', details: error.message });
    }
});

// Add new bot - with validation and token encryption
router.post('/', authenticateToken, apiLimiter, botTokenValidation, async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        const { token } = req.body;

        // Validate token by fetching bot info from Discord
        const botInfo = await validateBotToken(token);
        if (!botInfo.valid) {
            return res.status(400).json({ error: botInfo.error || 'Invalid bot token' });
        }

        // Encrypt token before saving to database
        const encryptedToken = encrypt(token);

        // Save bot to database with encrypted token
        const result = db.createBot.run(
            req.userId,
            encryptedToken,
            botInfo.id,
            botInfo.username,
            botInfo.avatar
        );

        res.json({
            success: true,
            bot: {
                id: result.lastInsertRowid,
                client_id: botInfo.id,
                bot_name: botInfo.username,
                bot_avatar: botInfo.avatar,
                status: 'stopped',
            },
        });

        // Audit log
        const user = db.getUserById.get(req.userId);
        AuditLog.botCreated(req.userId, user?.username || 'Unknown', botInfo.username);
    } catch (error) {
        console.error('Add bot error:', error);
        res.status(500).json({ error: 'Failed to add bot' });
    }
});

// Delete bot
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);

        // Stop bot if running
        botManager.stopBot(botId);

        // Delete from database
        const result = db.deleteBot.run(botId, req.userId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        // Audit log
        const user = db.getUserById.get(req.userId);
        AuditLog.botDeleted(req.userId, user?.username || 'Unknown', `Bot #${botId}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete bot error:', error);
        res.status(500).json({ error: 'Failed to delete bot' });
    }
});

// Update Bot Status (Presence)
router.put('/:id/status', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const { activity_type, activity_name, status_presence } = req.body;

        // Verify key ownership
        const bot = db.getBot.get(botId);
        if (!bot || bot.user_id !== req.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Update DB
        db.updateBotPresence.run(activity_type, activity_name, status_presence, botId);

        // Update Runtime
        botManager.updatePresence(botId, {
            type: activity_type,
            name: activity_name,
            status: status_presence
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Start bot
router.post('/:id/start', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);

        // Get bot with token
        const bot = db.getBotWithToken.get(botId, req.userId);
        if (!bot) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        // Start bot
        const result = await botManager.startBot(bot);

        if (result.success) {
            db.updateBotStatus.run('running', null, botId);

            // Audit log
            const user = db.getUserById.get(req.userId);
            AuditLog.botStarted(req.userId, user?.username || 'Unknown', bot.bot_name || `Bot #${botId}`);

            res.json({ success: true, status: 'running' });
        } else {
            db.updateBotStatus.run('error', result.error, botId);
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        console.error('Start bot error:', error);
        res.status(500).json({ error: 'Failed to start bot' });
    }
});

// Stop bot
router.post('/:id/stop', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);

        const bot = db.getBot.get(botId);
        botManager.stopBot(botId);
        db.updateBotStatus.run('stopped', null, botId);

        // Audit log
        const user = db.getUserById.get(req.userId);
        AuditLog.botStopped(req.userId, user?.username || 'Unknown', bot?.bot_name || `Bot #${botId}`);

        res.json({ success: true, status: 'stopped' });
    } catch (error) {
        console.error('Stop bot error:', error);
        res.status(500).json({ error: 'Failed to stop bot' });
    }
});

// Get bot guilds
router.get('/:id/guilds', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const client = botManager.getClient(botId);

        if (!client) {
            return res.status(400).json({ error: 'Bot is not running' });
        }

        const guilds = client.guilds.cache.map(g => {
            return {
                id: g.id,
                name: g.name,
                icon: g.iconURL(),
                memberCount: g.memberCount,
                channelCount: g.channels.cache.size,
                roleCount: g.roles.cache.size
            };
        });

        res.json(guilds);
    } catch (error) {
        console.error('Get guilds error:', error);
        res.status(500).json({ error: 'Failed to get guilds' });
    }
});

// Get single guild info (Basic)
router.get('/:id/guild/:guildId', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const client = botManager.getClient(botId);

        if (!client) {
            return res.status(400).json({ error: 'Bot is not running' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        res.json({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            memberCount: guild.memberCount
        });
    } catch (error) {
        console.error('Get guild info error:', error);
        res.status(500).json({ error: 'Failed to get guild info' });
    }
});

// Get single guild details (channels/roles) for Welcome page
router.get('/:id/guilds/:guildId', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const client = botManager.getClient(botId);

        if (!client) {
            return res.status(400).json({ error: 'Bot is not running' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        // Fetch channels and roles
        const channels = await guild.channels.fetch();
        const roles = await guild.roles.fetch();

        res.json({
            channels: channels.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name, type: c.type })),
            roles: roles.filter(r => r.id !== guildId).map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
        });
    } catch (error) {
        console.error('Get guild details error:', error);
        res.status(500).json({ error: 'Failed to get guild details' });
    }
});

// Get guild panels
router.get('/:id/guild/:guildId/panels', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;

        const panels = db.getPanelsByGuild.all(guildId, botId);

        // Attach options to each panel
        const panelsWithOptions = panels.map(p => {
            const options = db.getPanelOptions.all(p.id);
            return { ...p, options };
        });

        res.json(panelsWithOptions);
    } catch (error) {
        console.error('Get panels error:', error);
        res.status(500).json({ error: 'Failed to get panels' });
    }
});

// Get bot stats
router.get('/:id/stats', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const stats = db.getTicketStats.get(botId);
        res.json(stats || {});
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Get guild channels
router.get('/:id/guild/:guildId/channels', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const client = botManager.getClient(botId);

        if (!client) {
            return res.status(400).json({ error: 'Bot is not running' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const channelsCollection = await guild.channels.fetch();
        const channels = channelsCollection
            .filter(c => c.type === 0 || c.type === 5 || c.type === 4) // Text (0), Announcement (5), Category (4)
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type,
                parentId: c.parentId,
            }));

        res.json(channels);
    } catch (error) {
        console.error('Get channels error:', error);
        res.status(500).json({ error: 'Failed to get channels' });
    }
});

// Get guild roles
router.get('/:id/guild/:guildId/roles', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const client = botManager.getClient(botId);

        if (!client) {
            return res.status(400).json({ error: 'Bot is not running' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const rolesCollection = await guild.roles.fetch();
        const roles = rolesCollection
            .filter(r => r.id !== guildId) // Exclude @everyone
            .map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor,
                position: r.position
            }))
            .sort((a, b) => b.position - a.position);

        res.json(roles);
    } catch (error) {
        console.error('Get roles error:', error);
        res.status(500).json({ error: 'Failed to get roles' });
    }
});

// Get guild config
router.get('/:id/guild/:guildId/config', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;

        const config = db.getGuild.get(guildId, botId);
        res.json(config || {});
    } catch (error) {
        console.error('Get config error:', error);
        res.status(500).json({ error: 'Failed to get config' });
    }
});

// Update guild settings
router.put('/:id/guild/:guildId/settings', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const { logChannel, vouchChannel, vouchData, transcriptChannel, ticketCategory, language, timezone, autoCloseHours } = req.body;

        db.upsertGuild.run(guildId, botId);

        if (logChannel !== undefined) {
            db.updateGuildSetting(guildId, botId, 'log_channel_id', logChannel);
        }
        if (vouchChannel !== undefined) {
            db.updateGuildSetting(guildId, botId, 'vouch_channel_id', vouchChannel);
        }
        if (vouchData !== undefined) {
            // Store as JSON string
            const dataStr = typeof vouchData === 'string' ? vouchData : JSON.stringify(vouchData);
            db.updateGuildSetting(guildId, botId, 'vouch_data', dataStr);
        }

        if (transcriptChannel !== undefined) {
            db.updateGuildSetting(guildId, botId, 'transcript_channel_id', transcriptChannel);
        }
        if (ticketCategory !== undefined) {
            db.updateGuildSetting(guildId, botId, 'ticket_category_id', ticketCategory);
        }
        if (language !== undefined) {
            db.updateGuildSetting(guildId, botId, 'language', language);
        }
        if (timezone !== undefined) {
            db.updateGuildSetting(guildId, botId, 'timezone', timezone);
        }
        if (autoCloseHours !== undefined) {
            db.updateGuildSetting(guildId, botId, 'auto_close_hours', autoCloseHours);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Get single ticket details + messages
router.get('/:id/guild/:guildId/ticket/:ticketId', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const ticketId = req.params.ticketId; // Can be ID or Number

        // Try to find ticket by number first (since URL uses number usually), then ID
        // We need a specific DB query for this or allow getTicketsByGuild to filter? 
        // Let's assume we can fetch all and filter for now (not efficient but works for MVP without DB mod)
        // OR better: use existing getTicket if it takes ID, or add a specific query.
        // Let's rely on getTicketsByGuild and find it. 
        // IMPROVEMENT: Add db.getTicketByNumber(guildId, ticketNumber) later.

        // Temporarily fetching all (limit 1000) to find the right one.
        // Ideally we need: db.getTicketByNumber.get(guildId, botId, ticketNumber);

        let ticket;
        // Check if ticketId is a number
        if (!isNaN(ticketId)) {
            // It's likely a ticket number
            const allTickets = db.getTicketsByGuild.all(guildId, botId, 1000, 0); // Temporary brute force
            ticket = allTickets.find(t => t.ticket_number == ticketId);
        }

        if (!ticket) {
            // Try as valid ID? Or maybe the frontend passed the ID not number.
            // Let's assume frontend passes number as per my plan.
            return res.status(404).json({ error: 'Ticket not found' });
        }

        let serializedMessages = [];
        let channelName = ticket.channel_id; // Default fallback

        // If ticket is closed, try to load from DB
        if (ticket.status === 'closed' && ticket.messages) {
            try {
                serializedMessages = JSON.parse(ticket.messages);
                channelName = 'Closed Ticket';
            } catch (e) {
                console.error('Failed to parse ticket messages:', e);
            }
        }
        // If ticket is open (or no DB messages), try fetch from Discord
        else if (ticket.channel_id) {
            const client = botManager.getClient(botId);
            if (client) {
                const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
                if (channel && channel.isTextBased()) {
                    channelName = channel.name;
                    const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => []);
                    const messages = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                    // Serialize
                    serializedMessages = messages.map(m => ({
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
                }
            }
        }

        res.json({
            ticket,
            channelName,
            messages: serializedMessages
        });

    } catch (error) {
        console.error('Get ticket details error:', error);
        res.status(500).json({ error: 'Failed to get ticket details' });
    }
});

// Close ticket
router.post('/:id/guild/:guildId/ticket/:ticketId/close', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const ticketId = req.params.ticketId;

        // 1. Find the ticket
        let ticket;
        if (!isNaN(ticketId)) {
            const allTickets = db.getTicketsByGuild.all(guildId, botId, 1000, 0);
            ticket = allTickets.find(t => t.ticket_number == ticketId);
        }

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.status === 'closed') {
            return res.status(400).json({ error: 'Ticket is already closed' });
        }

        // 2. Save Messages & Delete Channel
        const client = botManager.getClient(botId);
        if (client) {
            try {
                const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
                if (channel) {
                    // Fetch last 100 messages for transcript
                    const messages = await channel.messages.fetch({ limit: 100 });

                    // Serialize messages (same format as GET route)
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

                    // Save to DB
                    db.saveTicketMessages.run(JSON.stringify(serializedMessages), ticket.id);

                    // --- NEW: Generate Discord Transcript & Log ---
                    const guildConfig = db.getGuild.get(guildId, botId);
                    let transcriptUrl = null;

                    // 1. Generate & Send Transcript
                    if (config.ticket.transcriptEnabled && guildConfig?.transcript_channel_id) {
                        try {
                            const discordTranscripts = await import('discord-html-transcripts');
                            // Create transcript attachment
                            const transcript = await discordTranscripts.createTranscript(channel, {
                                limit: -1,
                                returnBuffer: false,
                                filename: `ticket-${ticket.ticket_number}.html`,
                            });

                            const transcriptChannel = await client.channels.fetch(guildConfig.transcript_channel_id).catch(() => null);
                            if (transcriptChannel) {
                                const msg = await transcriptChannel.send({
                                    content: `📋 Transcript for Ticket #${ticket.ticket_number} (Closed via Dashboard)`,
                                    files: [transcript],
                                });
                                transcriptUrl = msg.attachments.first()?.url || msg.url;
                                db.updateTicketTranscript.run(transcriptUrl, ticket.id);
                            }
                        } catch (err) {
                            console.error('Error generating/sending transcript to Discord:', err);
                        }
                    }

                    // 2. Log to Log Channel
                    if (guildConfig?.log_channel_id) {
                        try {
                            const logChannel = await client.channels.fetch(guildConfig.log_channel_id).catch(() => null);
                            if (logChannel) {
                                const embed = new EmbedBuilder()
                                    .setColor(config.colors.error)
                                    .setTitle('🔒 Ticket Closed')
                                    .setDescription(`This ticket has been closed via **Web Dashboard** by users.`)
                                    .addFields(
                                        { name: 'Ticket', value: `#${ticket.ticket_number}`, inline: true },
                                        { name: 'Closed By', value: `Web Dashboard`, inline: true }, // We could fetch user name if we had it easily
                                    )
                                    .setTimestamp();

                                if (transcriptUrl) {
                                    embed.addFields({ name: 'Transcript', value: `[View Transcript](${transcriptUrl})`, inline: false });
                                }

                                await logChannel.send({ embeds: [embed] });
                            }
                        } catch (err) {
                            console.error('Error sending closure log:', err);
                        }
                    }

                    // Delete channel
                    await channel.delete('Ticket closed by web dashboard');
                }
            } catch (e) {
                console.error('Failed to handle ticket close (fetch/save/delete):', e);
                // Continue to close in DB even if channel operations fail
            }
        }

        // 3. Update DB
        db.closeTicket.run(req.userId, 'Web Dashboard', ticket.id);

        res.json({ success: true });

    } catch (error) {
        console.error('Close ticket error:', error);
        res.status(500).json({ error: 'Failed to close ticket' });
    }
});

// Get guild tickets
router.get('/:id/guild/:guildId/tickets', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const tickets = db.getTicketsByGuild.all(guildId, botId, limit, offset);

        // Get total count for pagination (optional but good)
        // Since we don't have a specific count query exposed here easily without adding to DB,
        // we might just return the array. Frontend handles "Next" if array length == limit.
        // Actually, db.getTicketsByGuildCount might exist? 
        // Let's assume for now we just return the slice. But to do proper pagination with numbers we need count.
        // I will check if I can add count later. For now, basic Prev/Next.

        // Try to fetch usernames from Discord
        const client = botManager.getClient(botId);
        if (client) {
            const ticketsWithUsers = await Promise.all(
                (tickets || []).map(async (ticket) => {
                    try {
                        const user = await client.users.fetch(ticket.user_id).catch(() => null);
                        return {
                            ...ticket,
                            username: user ? user.username : `User ${ticket.user_id.slice(-4)}`,
                            avatar: user ? user.displayAvatarURL({ size: 32 }) : null
                        };
                    } catch {
                        return { ...ticket, username: `User ${ticket.user_id.slice(-4)}`, avatar: null };
                    }
                })
            );
            return res.json(ticketsWithUsers);
        }

        res.json(tickets || []);
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ error: 'Failed to get tickets' });
    }
});

// Get guild stats
router.get('/:id/guild/:guildId/stats', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;

        const stats = db.getGuildStats.get(guildId, botId);

        // Get activity for last 7 days
        const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
        const activity = db.getTicketActivity.all(guildId, botId, sevenDaysAgo);

        // Fill in missing days
        const chartData = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const found = activity.find(a => a.date === dateStr);
            chartData.push({
                date: dateStr,
                count: found ? found.count : 0
            });
        }

        res.json({ ...stats, activity: chartData } || {});
    } catch (error) {
        console.error('Get guild stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Get guild commands
router.get('/:id/guild/:guildId/commands', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;

        const commands = db.getCustomCommandsByGuild?.all(guildId, botId) || [];
        res.json(commands);
    } catch (error) {
        console.error('Get commands error:', error);
        res.status(500).json({ error: 'Failed to get commands' });
    }
});

// Get guild channels
router.get('/:id/guild/:guildId/channels', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;

        const client = botManager.getClient(botId);
        if (!client) return res.status(503).json({ error: 'Bot not ready' });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const channels = guild.channels.cache
            .filter(c => c.type === 0) // 0 is GuildText
            .map(c => ({
                id: c.id,
                name: c.name,
                position: c.position
            }))
            .sort((a, b) => a.position - b.position);

        res.json(channels);
    } catch (error) {
        console.error('Get channels error:', error);
        res.status(500).json({ error: 'Failed to get channels' });
    }
});

// Create custom command
router.post('/:id/guild/:guildId/commands', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const { trigger, response } = req.body;

        if (!trigger || !response) {
            return res.status(400).json({ error: 'Trigger and response are required' });
        }

        const result = db.createCustomCommand.run(botId, guildId, trigger.toLowerCase(), response, null, null, null, null);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Create command error:', error);
        res.status(500).json({ error: 'Failed to create command' });
    }
});

// Update custom command
router.put('/:id/guild/:guildId/commands/:cmdId', authenticateToken, (req, res) => {
    try {
        const cmdId = parseInt(req.params.cmdId);
        const { trigger, response, embedTitle, embedDescription, embedColor } = req.body;

        if (!trigger || !response) {
            return res.status(400).json({ error: 'Trigger and response are required' });
        }

        db.updateCustomCommand.run(
            trigger.toLowerCase(),
            response,
            embedTitle || null,
            embedDescription || null,
            embedColor || null,
            cmdId
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update command error:', error);
        res.status(500).json({ error: 'Failed to update command' });
    }
});

// Delete custom command
router.delete('/:id/guild/:guildId/commands/:cmdId', authenticateToken, (req, res) => {
    try {
        const cmdId = parseInt(req.params.cmdId);

        db.deleteCustomCommand.run(cmdId);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete command error:', error);
        res.status(500).json({ error: 'Failed to delete command' });
    }
});

// Create panel via API
router.post('/:id/guild/:guildId/panels', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const { name, title, description, color, imageUrl, thumbnailUrl, footerText, authorName, authorIcon, messageContent, titleUrl, authorUrl, footerIcon, channelId } = req.body;

        // Check subscription (limit panels)
        const existingPanels = db.getPanelsByGuild.all(guildId, parseInt(botId));
        if (existingPanels.length >= 25) { // Increase limit
            return res.status(403).json({ error: 'Panel limit reached (max 25)' });
        }

        db.upsertGuild.run(guildId, botId);

        const result = db.createPanel.run(
            parseInt(botId),
            guildId,
            name,
            title,
            description,
            color,
            imageUrl || null,
            thumbnailUrl || null,
            footerText || null,
            authorName || null,
            authorIcon || null, // embed_author_icon
            messageContent || null, // message_content
            titleUrl || null, // embed_title_url
            authorUrl || null, // embed_author_url
            footerIcon || null // embed_footer_icon
        );

        const panelId = result.lastInsertRowid;

        // Save buttons
        const buttons = req.body.buttons || [];
        // If no buttons provided (and not explicitly empty), add default
        if (buttons.length === 0 && !req.body.buttons) {
            buttons.push({ label: 'Open Ticket', emoji: '🎫', color: '#5865F2' });
        }

        const buttonOptions = []; // Store for sending message

        for (const btn of buttons) {
            let style = 'Primary';
            if (btn.color && (btn.color.includes('4f545c') || btn.color === 'grey')) style = 'Secondary';
            if (btn.color && (btn.color.includes('3BA55C') || btn.color === 'green')) style = 'Success';
            if (btn.color && (btn.color.includes('ED4245') || btn.color === 'red')) style = 'Danger';
            if (btn.color && (btn.color.includes('5865F2') || btn.color === 'blurple')) style = 'Primary';

            const result = db.createPanelOption.run(
                panelId,
                btn.label,
                btn.emoji || null,
                style,
                btn.categoryName || null,
                btn.ticketPrefix || 'ticket',
                JSON.stringify(btn.supportRoleIds || []),
                btn.welcomeMessage || null,
                btn.isDisabled ? 1 : 0,
                btn.ticketStyle || 'channel',
                JSON.stringify(btn.requiredRoles || []),
                btn.ticketMessage || null,
                btn.staffThreadMessage || null,
                btn.steamRequired ? 1 : 0,
                btn.pingsEnabled !== undefined ? (btn.pingsEnabled ? 1 : 0) : 1,
                btn.ticketCategoryId || null
            );
            const optionId = result.lastInsertRowid;

            // Save Questions
            if (btn.questions && Array.isArray(btn.questions)) {
                btn.questions.forEach((q, qIndex) => {
                    db.createQuestion.run(
                        optionId,
                        q.question,
                        q.placeholder || null,
                        q.required ? 1 : 0,
                        q.minLength || 1,
                        q.maxLength || 1000,
                        q.style || 'Paragraph',
                        qIndex
                    );
                });
            }

            buttonOptions.push({ ...btn, style, id: optionId });
        }

        // If channelId provided, send the panel embed
        console.log(`[DEBUG] POST Panel. Attempting Discord Send. ChannelID: '${channelId}'`);
        if (channelId) {
            const client = botManager.getClient(botId);
            console.log(`[DEBUG] POST Panel. Client found: ${!!client}`);
            if (client) {
                try {
                    let guild = client.guilds.cache.get(guildId);
                    if (!guild) {
                        console.log(`[DEBUG] Guild ${guildId} not in cache, fetching...`);
                        guild = await client.guilds.fetch(guildId);
                    }
                    const channel = await guild?.channels.fetch(channelId);
                    if (channel) {
                        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

                        const embed = new EmbedBuilder()
                            .setTitle(title)
                            .setDescription(description || 'Click the button below to open a ticket.')
                            .setColor(color || '#5865F2');

                        // Add optional fields
                        if (titleUrl) embed.setURL(titleUrl);
                        if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
                        if (imageUrl) embed.setImage(imageUrl);
                        if (footerText) embed.setFooter({ text: footerText, iconURL: footerIcon || undefined });
                        if (authorName) embed.setAuthor({ name: authorName, iconURL: authorIcon || undefined, url: authorUrl || undefined });

                        const components = [];
                        if (buttonOptions.length > 0) {
                            const row = new ActionRowBuilder();
                            buttonOptions.forEach((btn, index) => {
                                const styleMap = {
                                    'Primary': ButtonStyle.Primary,
                                    'Secondary': ButtonStyle.Secondary,
                                    'Success': ButtonStyle.Success,
                                    'Danger': ButtonStyle.Danger
                                };

                                const button = new ButtonBuilder()
                                    .setCustomId(`ticket_open_${btn.id}`)
                                    .setLabel(btn.label)
                                    .setStyle(styleMap[btn.style] || ButtonStyle.Primary);

                                if (btn.emoji) button.setEmoji(btn.emoji);
                                row.addComponents(button);
                            });
                            components.push(row);
                        }

                        const msgOptions = { embeds: [embed], components };
                        if (messageContent) msgOptions.content = messageContent;

                        const msg = await channel.send(msgOptions);
                        db.updatePanelMessage.run(channelId, msg.id, panelId);
                    }
                } catch (e) {
                    console.error('Failed to send panel:', e);
                }
            }
        }

        res.json({ success: true, panelId });
    } catch (error) {
        console.error('Create panel error:', error);
        res.status(500).json({ error: 'Failed to create panel' });
    }
});

// Resend Panel
router.post('/:id/guild/:guildId/panels/:panelId/resend', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const panelId = parseInt(req.params.panelId);

        // 1. Get Panel & Options
        const panel = db.getPanel.get(panelId);
        if (!panel) return res.status(404).json({ error: 'Panel not found' });

        const options = db.getPanelOptions.all(panelId);

        // 2. Fetch Client
        const client = botManager.getClient(botId);
        if (!client) return res.status(503).json({ error: 'Bot not ready' });

        // 3. Send Message
        const channel = await client.channels.fetch(panel.channel_id).catch(() => null);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        // Helper to reconstruct message payload
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
        const embed = new EmbedBuilder()
            .setTitle(panel.embed_title)
            .setDescription(panel.embed_description || 'Open a ticket')
            .setColor(panel.embed_color || '#5865F2');

        if (panel.embed_title_url) embed.setURL(panel.embed_title_url);
        if (panel.embed_thumbnail) embed.setThumbnail(panel.embed_thumbnail);
        if (panel.embed_image) embed.setImage(panel.embed_image);
        if (panel.embed_footer) embed.setFooter({ text: panel.embed_footer, iconURL: panel.embed_footer_icon });
        if (panel.embed_author_name) embed.setAuthor({ name: panel.embed_author_name, iconURL: panel.embed_author_icon, url: panel.embed_author_url });

        const components = [];
        if (options.length > 0) {
            const row = new ActionRowBuilder();
            options.forEach(btn => {
                const styleMap = { 'Primary': ButtonStyle.Primary, 'Secondary': ButtonStyle.Secondary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger };
                const button = new ButtonBuilder()
                    .setCustomId(`ticket_open_${btn.id}`)
                    .setLabel(btn.label)
                    .setStyle(styleMap[btn.style] || ButtonStyle.Primary);
                if (btn.emoji) button.setEmoji(btn.emoji);
                row.addComponents(button);
            });
            components.push(row);
        }

        const msgOptions = { embeds: [embed], components };
        if (panel.message_content) msgOptions.content = panel.message_content;

        // Delete old message if known? (Optional, might fail)
        // Check DB for old message ID? We don't really track it reliably except maybe last update
        // We'll just send a new one.

        const msg = await channel.send(msgOptions);
        db.updatePanelMessage.run(panel.channel_id, msg.id, panelId);

        res.json({ success: true });

    } catch (error) {
        console.error('Resend panel error:', error);
        res.status(500).json({ error: 'Failed to resend panel' });
    }
});

// Move Panel
router.post('/:id/guild/:guildId/panels/:panelId/move', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const panelId = parseInt(req.params.panelId);
        const { channelId } = req.body;

        if (!channelId) return res.status(400).json({ error: 'Channel ID required' });

        // Update DB
        db.updatePanelMessage.run(channelId, null, panelId); // Clear message ID as we moved

        // Trigger Resend Logic (Reusing same code or just calling resend internally? API call easier for now)
        // Let's just do it inline to avoid overhead
        const panel = db.getPanel.get(panelId);
        const options = db.getPanelOptions.all(panelId);
        const client = botManager.getClient(botId);

        if (client) {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel) {
                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
                const embed = new EmbedBuilder()
                    .setTitle(panel.embed_title)
                    .setDescription(panel.embed_description || 'Open a ticket')
                    .setColor(panel.embed_color || '#5865F2');

                if (panel.embed_title_url) embed.setURL(panel.embed_title_url);
                if (panel.embed_thumbnail) embed.setThumbnail(panel.embed_thumbnail);
                if (panel.embed_image) embed.setImage(panel.embed_image);
                if (panel.embed_footer) embed.setFooter({ text: panel.embed_footer, iconURL: panel.embed_footer_icon });
                if (panel.embed_author_name) embed.setAuthor({ name: panel.embed_author_name, iconURL: panel.embed_author_icon, url: panel.embed_author_url });

                const components = [];
                if (options.length > 0) {
                    const row = new ActionRowBuilder();
                    options.forEach(btn => {
                        const styleMap = { 'Primary': ButtonStyle.Primary, 'Secondary': ButtonStyle.Secondary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger };
                        const button = new ButtonBuilder()
                            .setCustomId(`ticket_open_${btn.id}`)
                            .setLabel(btn.label)
                            .setStyle(styleMap[btn.style] || ButtonStyle.Primary);
                        if (btn.emoji) button.setEmoji(btn.emoji);
                        row.addComponents(button);
                    });
                    components.push(row);
                }

                const msgOptions = { embeds: [embed], components };
                if (panel.message_content) msgOptions.content = panel.message_content;

                const msg = await channel.send(msgOptions);
                db.updatePanelMessage.run(channelId, msg.id, panelId);
            }
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Move panel error:', error);
        res.status(500).json({ error: 'Failed to move panel' });
    }
});

// Get Tickets for Stats
router.get('/:id/guild/:guildId/tickets', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;

        console.log(`[Stats] Fetching tickets for Guild ${guildId}, Bot ${botId}`);

        // Get all tickets for this guild (up to 1000)
        const tickets = db.getTicketsByGuild.all(guildId, botId, 1000, 0);
        console.log(`[Stats] Found ${tickets?.length} tickets`);

        res.json(tickets || []);
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ error: 'Failed to get tickets', details: error.message });
    }
});

// Clone Panel (Save as Template)
router.post('/:id/guild/:guildId/panels/:panelId/clone', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const panelId = parseInt(req.params.panelId);

        const panel = db.getPanel.get(panelId);
        if (!panel) return res.status(404).json({ error: 'Panel not found' });

        const options = db.getPanelOptions.all(panelId);

        // Fetch questions for each option
        const optionsWithQuestions = [];
        for (const opt of options) {
            const questions = db.getQuestionsByOption.all(opt.id);
            optionsWithQuestions.push({ ...opt, questions });
        }

        const templateData = {
            panel: panel,
            options: optionsWithQuestions
        };

        const result = db.createTemplate.run(botId, guildId, `${panel.name} Template`, JSON.stringify(templateData));

        res.json({ success: true, templateId: result.lastInsertRowid });

    } catch (error) {
        console.error('Clone panel error:', error);
        res.status(500).json({ error: 'Failed to save template' });
    }
});

// Get templates
router.get('/:id/guild/:guildId/templates', authenticateToken, (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;

        const templates = db.getTemplatesByGuild.all(guildId, botId);
        res.json(templates || []);
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ error: 'Failed to get templates' });
    }
});

// Get single template
router.get('/:id/guild/:guildId/templates/:templateId', authenticateToken, (req, res) => {
    try {
        const templateId = parseInt(req.params.templateId);

        const template = db.getTemplate?.get(templateId);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json(template);
    } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Failed to get template' });
    }
});

// Delete template
router.delete('/:id/guild/:guildId/templates/:templateId', authenticateToken, (req, res) => {
    try {
        const templateId = parseInt(req.params.templateId);

        db.deleteTemplate.run(templateId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

// Delete panel
router.delete('/:id/guild/:guildId/panels/:panelId', authenticateToken, (req, res) => {
    try {
        const panelId = parseInt(req.params.panelId);
        const { guildId } = req.params;

        // Get panel name before deletion for audit log
        const panel = db.getPanel.get(panelId);
        db.deletePanel.run(panelId);

        // Audit log
        const user = db.getUserById.get(req.userId);
        AuditLog.panelDeleted(req.userId, user?.username || 'Unknown', panel?.name || `Panel #${panelId}`, guildId);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete panel error:', error);
        res.status(500).json({ error: 'Failed to delete panel' });
    }
});

// Get single panel
router.get('/:id/guild/:guildId/panels/:panelId', authenticateToken, (req, res) => {
    try {
        const panelId = parseInt(req.params.panelId);
        const panel = db.getPanel.get(panelId);

        if (!panel) {
            return res.status(404).json({ error: 'Panel not found' });
        }

        // Get panel options/buttons
        const options = db.getPanelOptions?.all(panelId) || [];

        res.json({ ...panel, options });
    } catch (error) {
        console.error('Get panel error:', error);
        res.status(500).json({ error: 'Failed to get panel' });
    }
});

// Update panel
router.put('/:id/guild/:guildId/panels/:panelId', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const panelId = parseInt(req.params.panelId);
        const { name, title, description, color, messageContent, authorName, authorIcon, footerText, footerIcon, imageUrl, thumbnailUrl, titleUrl, authorUrl, channelId } = req.body;

        // Get current panel data first
        const oldPanel = db.getPanel.get(panelId);

        db.updatePanel.run(
            name,
            title,
            description,
            color,
            messageContent || null,
            authorName || null,
            footerText || null,
            imageUrl || null,
            thumbnailUrl || null,
            authorIcon || null,
            titleUrl || null,
            authorUrl || null,
            footerIcon || null,
            panelId
        );

        // Update Buttons/Options
        db.deletePanelOptions.run(panelId);

        const buttons = req.body.buttons || [];
        // If no buttons provided (and not explicitly empty), add default if it was a new panel... but here we update.
        // If user sends empty buttons array, we effectively delete all buttons.

        const buttonOptions = []; // Store for sending message

        for (const btn of buttons) {
            let style = 'Primary';
            if (btn.color && (btn.color.includes('4f545c') || btn.color === 'grey')) style = 'Secondary';
            if (btn.color && (btn.color.includes('3BA55C') || btn.color === 'green')) style = 'Success';
            if (btn.color && (btn.color.includes('ED4245') || btn.color === 'red')) style = 'Danger';
            if (btn.color && (btn.color.includes('5865F2') || btn.color === 'blurple')) style = 'Primary';

            const result = db.createPanelOption.run(
                panelId,
                btn.label,
                btn.emoji || null,
                style,
                btn.categoryName || null,
                btn.ticketPrefix || 'ticket',
                JSON.stringify(btn.supportRoleIds || []),
                btn.welcomeMessage || null,
                btn.isDisabled ? 1 : 0,
                btn.ticketStyle || 'channel',
                JSON.stringify(btn.requiredRoles || []),
                btn.ticketMessage || null,
                btn.staffThreadMessage || null,
                btn.steamRequired ? 1 : 0,
                btn.pingsEnabled !== undefined ? (btn.pingsEnabled ? 1 : 0) : 1,
                btn.ticketCategoryId || null
            );
            const optionId = result.lastInsertRowid;

            // Save Questions
            if (btn.questions && Array.isArray(btn.questions)) {
                btn.questions.forEach((q, qIndex) => {
                    db.createQuestion.run(
                        optionId,
                        q.question,
                        q.placeholder || null,
                        q.required ? 1 : 0,
                        q.minLength || 1,
                        q.maxLength || 1000,
                        q.style || 'Paragraph',
                        qIndex
                    );
                });
            }

            buttonOptions.push({ ...btn, style, id: optionId });
        }

        // Handle Discord Message Update
        console.log(`[DEBUG] Attempting Discord Update. ChannelID: '${channelId}'`);
        if (channelId) {
            const client = botManager.getClient(botId);
            console.log(`[DEBUG] Updating panel in channel ${channelId} for bot ${botId}. Client found: ${!!client}`);
            if (client) {
                try {
                    let guild = client.guilds.cache.get(guildId);
                    if (!guild) {
                        console.log(`[DEBUG] Guild ${guildId} not in cache, fetching...`);
                        guild = await client.guilds.fetch(guildId);
                    }
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

                    // Prepare Message Payload
                    const embed = new EmbedBuilder()
                        .setTitle(title)
                        .setDescription(description || 'Click the button below to open a ticket.')
                        .setColor(color || '#5865F2');

                    if (titleUrl) embed.setURL(titleUrl);
                    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
                    if (imageUrl) embed.setImage(imageUrl);
                    if (footerText) embed.setFooter({ text: footerText, iconURL: footerIcon || undefined });
                    if (authorName) embed.setAuthor({ name: authorName, iconURL: authorIcon || undefined, url: authorUrl || undefined });

                    const components = [];
                    if (buttonOptions.length > 0) {
                        const row = new ActionRowBuilder();
                        buttonOptions.forEach((btn) => {
                            const styleMap = {
                                'Primary': ButtonStyle.Primary,
                                'Secondary': ButtonStyle.Secondary,
                                'Success': ButtonStyle.Success,
                                'Danger': ButtonStyle.Danger
                            };

                            const button = new ButtonBuilder()
                                .setCustomId(`ticket_open_${btn.id}`)
                                .setLabel(btn.label)
                                .setStyle(styleMap[btn.style] || ButtonStyle.Primary);

                            if (btn.emoji) button.setEmoji(btn.emoji);
                            row.addComponents(button);
                        });
                        components.push(row);
                    }

                    const msgOptions = { embeds: [embed], components };
                    if (messageContent !== null && messageContent !== undefined) msgOptions.content = messageContent;

                    // Update Strategy: Edit if same channel, otherwise Send New
                    let messageUpdated = false;

                    if (oldPanel && oldPanel.channel_id === channelId && oldPanel.message_id) {
                        try {
                            const channel = await guild?.channels.fetch(channelId);
                            console.log(`[DEBUG] Fetching channel ${channelId}: ${!!channel}`);
                            if (channel) {
                                console.log(`[DEBUG] Fetching old message ${oldPanel.message_id}...`);
                                const oldMsg = await channel.messages.fetch(oldPanel.message_id);
                                console.log(`[DEBUG] Old message found: ${!!oldMsg}`);
                                if (oldMsg) {
                                    console.log('[DEBUG] Attempting to edit message...');
                                    await oldMsg.edit(msgOptions);
                                    console.log('[DEBUG] Message edited successfully.');
                                    messageUpdated = true;
                                }
                            }
                        } catch (e) {
                            console.log('Failed to edit existing message, sending new one. Error:', e.message);
                        }
                    }

                    if (!messageUpdated) {
                        // Delete old if exists (and different channel/failed edit)
                        if (oldPanel && oldPanel.channel_id && oldPanel.message_id) {
                            try {
                                const oldChan = await guild?.channels.fetch(oldPanel.channel_id);
                                if (oldChan) {
                                    const oldM = await oldChan.messages.fetch(oldPanel.message_id);
                                    if (oldM) await oldM.delete();
                                }
                            } catch (e) { }
                        }

                        // Send New
                        const channel = await guild?.channels.fetch(channelId);
                        if (channel) {
                            const msg = await channel.send(msgOptions);
                            console.log('[DEBUG] New panel message sent successfully.');
                            db.updatePanelMessage.run(channelId, msg.id, panelId);
                        }
                    }

                } catch (e) {
                    console.error('Failed to update Discord panel:', e);
                    console.log('[DEBUG] Discord update failed stack:', e.stack);
                    // Warning returned but success is true so frontend doesn't error blocking user
                    // res.json({ success: true, warning: 'Saved to DB but failed to update Discord: ' + e.message });
                }
            }
        }

        res.json({ success: true, panelId });


    } catch (error) {
        console.error('Update panel error:', error);
        res.status(500).json({ error: 'Failed to update panel' });
    }
});

// Get guild emojis
router.get('/:id/guild/:guildId/emojis', authenticateToken, async (req, res) => {
    try {
        const botId = parseInt(req.params.id);
        const guildId = req.params.guildId;
        const client = botManager.getClient(botId);

        if (!client) {
            return res.status(400).json({ error: 'Bot is not running' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const emojis = await guild.emojis.fetch();
        const emojiList = emojis.map(e => ({
            id: e.id,
            name: e.name,
            url: e.url,
            animated: e.animated,
            identifier: e.toString() // <a:name:id> or <name:id>
        }));

        res.json(emojiList);
    } catch (error) {
        console.error('Get emojis error:', error);
        res.status(500).json({ error: 'Failed to get emojis' });
    }
});

// Validate bot token with Discord API
async function validateBotToken(token) {
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me', {
            headers: {
                Authorization: `Bot ${token}`,
            },
        });

        if (!response.ok) {
            return { valid: false, error: 'Invalid token' };
        }

        const data = await response.json();

        if (!data.bot) {
            return { valid: false, error: 'Token is not a bot token' };
        }

        return {
            valid: true,
            id: data.id,
            username: data.username,
            avatar: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : null,
        };
    } catch (error) {
        return { valid: false, error: 'Failed to validate token' };
    }
}

export default router;

