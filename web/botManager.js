import { Client, Collection, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import * as db from './database.js';
import { StickyManager } from './stickyManager.js';
import { inviteManager } from './inviteManager.js';
import { decrypt } from './utils/crypto.js';

// ... (existing imports)



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BotManager {
    constructor() {
        this.clients = new Map(); // botId -> Discord Client
        this.commands = new Collection(); // Shared commands
        this.commandsLoaded = false;
    }

    // Load commands once
    async loadCommands() {
        if (this.commandsLoaded) return;

        const commandsPath = join(__dirname, '../src/commands');
        try {
            const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = join(commandsPath, file);
                const command = await import(`file://${filePath}`);

                if ('data' in command && 'execute' in command) {
                    this.commands.set(command.data.name, command);
                    console.log(`✓ Loaded command: ${command.data.name}`);
                }
            }
            this.commandsLoaded = true;
        } catch (error) {
            console.error('Failed to load commands:', error);
        }
    }

    // Start a bot
    async startBot(bot) {
        try {
            // Check if already running
            if (this.clients.has(bot.id)) {
                return { success: false, error: 'Bot is already running' };
            }

            // Load commands if not loaded
            await this.loadCommands();

            // Create new Discord client
            const client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildEmojisAndStickers,
                ],
                partials: [
                    Partials.Channel,
                    Partials.Message,
                    Partials.GuildMember,
                ],
            });

            // Attach bot info and commands
            client.botId = bot.id;
            client.commands = this.commands;

            // Create StickyManager before event handlers so it's available when ready event fires
            client.stickyManager = new StickyManager(client);

            // Setup event handlers
            this.setupEventHandlers(client, bot.id);

            // Decrypt token before login (supports both encrypted and legacy plain tokens)
            const decryptedToken = decrypt(bot.bot_token);

            // Login with decrypted token
            await client.login(decryptedToken);

            // Store client
            this.clients.set(bot.id, client);

            // Deploy slash commands to all guilds this bot is in
            try {
                const commandData = [];
                for (const [name, command] of this.commands) {
                    commandData.push(command.data.toJSON());
                }

                // Deploy globally (available in all guilds)
                await client.application.commands.set(commandData);
                console.log(`✓ Deployed ${commandData.length} commands for bot ${bot.id}`);
            } catch (deployError) {
                console.error(`Failed to deploy commands for bot ${bot.id}:`, deployError.message);
            }

            // Update bot info after login
            db.updateBotInfo.run(
                client.user.username,
                client.user.displayAvatarURL(),
                client.user.id,
                client.guilds.cache.size,
                bot.id
            );

            // Update status to 'running' so it can be restored on restart
            db.updateBotStatus.run('running', null, bot.id);

            console.log(`✓ Bot ${bot.id} (${client.user.tag}) started`);

            return { success: true };
        } catch (error) {
            console.error(`Failed to start bot ${bot.id}:`, error.message);

            // Provide helpful error messages
            let errorMessage = error.message;

            if (error.message.includes('disallowed intents') || error.message.includes('Disallowed Intents')) {
                errorMessage = 'Privileged Intents not enabled! Go to Discord Developer Portal → Bot → Enable "SERVER MEMBERS INTENT" and "MESSAGE CONTENT INTENT", then try again.';
            } else if (error.message.includes('invalid token') || error.message.includes('TOKEN_INVALID')) {
                errorMessage = 'Invalid bot token. Please check your token and try again.';
            } else if (error.message.includes('rate limit')) {
                errorMessage = 'Rate limited by Discord. Please wait a moment and try again.';
            }

            return { success: false, error: errorMessage };
        }
    }

    // Stop a bot
    stopBot(botId) {
        const client = this.clients.get(botId);
        if (client) {
            client.destroy();
            this.clients.delete(botId);
            console.log(`✓ Bot ${botId} stopped`);
        }
    }

    // Get client by botId
    getClient(botId) {
        return this.clients.get(botId);
    }

    // Get all running bots
    getRunningBots() {
        return Array.from(this.clients.keys());
    }

    // Update Bot Presence
    updatePresence(botId, { type, name, status }) {
        const client = this.clients.get(Number(botId));
        if (!client || !client.user) return;

        // Map string type to Discord ActivityType
        const ActivityTypeMap = {
            'Playing': ActivityType.Playing,
            'Streaming': ActivityType.Streaming,
            'Listening': ActivityType.Listening,
            'Watching': ActivityType.Watching,
            'Competing': ActivityType.Competing
        };

        client.user.setPresence({
            activities: [{
                name: name || 'KingBot',
                type: ActivityTypeMap[type] || ActivityType.Playing
            }],
            status: status || 'online'
        });

        console.log(`Updated presence for Bot ${botId}: ${type} ${name} (${status})`);
    }

    // Setup event handlers for a bot client
    setupEventHandlers(client, botId) {
        // Ready event
        client.once('ready', async () => {
            console.log(`Bot ${botId} ready as ${client.user.tag}`);

            // Set Bot Status from DB
            const botData = db.getBot.get(botId);
            if (botData) {
                const ActivityTypeMap = {
                    'Playing': ActivityType.Playing,
                    'Streaming': ActivityType.Streaming,
                    'Listening': ActivityType.Listening,
                    'Watching': ActivityType.Watching,
                    'Competing': ActivityType.Competing
                };

                client.user.setPresence({
                    activities: [{
                        name: botData.activity_name || 'KingBot',
                        type: ActivityTypeMap[botData.activity_type] || ActivityType.Playing
                    }],
                    status: botData.status_presence || 'online',
                });
            } else {
                client.user.setPresence({
                    activities: [{ name: 'KingBot', type: ActivityType.Playing }],
                    status: 'online',
                });
            }

            // Initialize guilds in database
            for (const [guildId, guild] of client.guilds.cache) {
                db.upsertGuild.run(guildId, botId);
                // Cache invites
                inviteManager.cacheGuildInvites(guild);
            }

            // Initialize StickyManager after client is ready
            if (client.stickyManager) {
                await client.stickyManager.init();
            }
        });

        // Guild join
        client.on('guildCreate', (guild) => {
            db.upsertGuild.run(guild.id, botId);
            inviteManager.cacheGuildInvites(guild);

            // Update guilds count
            db.updateBotInfo.run(
                client.user.username,
                client.user.displayAvatarURL(),
                client.user.id,
                client.guilds.cache.size,
                botId
            );
        });

        // Interaction handler
        client.on('interactionCreate', async (interaction) => {
            try {
                // Slash commands
                if (interaction.isChatInputCommand()) {
                    const command = client.commands.get(interaction.commandName);
                    if (!command) return;

                    // Inject botId into interaction
                    interaction.botId = botId;

                    await command.execute(interaction);
                }

                // Autocomplete
                if (interaction.isAutocomplete()) {
                    const command = client.commands.get(interaction.commandName);
                    if (command?.autocomplete) {
                        interaction.botId = botId;
                        await command.autocomplete(interaction);
                    }
                }

                // Button interactions
                if (interaction.isButton()) {
                    interaction.botId = botId;
                    const { handleTicketButton, handleTicketAction } = await import('../src/handlers/ticketHandler.js');

                    if (interaction.customId.startsWith('ticket_open_')) {
                        await handleTicketButton(interaction, botId);
                    } else if (interaction.customId.startsWith('ticket_')) {
                        await handleTicketAction(interaction, botId);
                    } else if (interaction.customId.startsWith('vouch_')) {
                        const rating = parseInt(interaction.customId.split('_')[1]);
                        const user = interaction.user;

                        // Get settings
                        const guildSettings = db.getGuild.get(interaction.guild.id, botId);
                        if (!guildSettings?.vouch_channel_id) {
                            return interaction.reply({ content: 'Vouch channel not configured.', ephemeral: true });
                        }

                        const vouchChannel = interaction.guild.channels.cache.get(guildSettings.vouch_channel_id);
                        if (!vouchChannel) {
                            return interaction.reply({ content: 'Vouch channel not found.', ephemeral: true });
                        }

                        // Send Vouch Log
                        const { EmbedBuilder } = await import('discord.js');
                        // Parse settings
                        const vouchData = guildSettings.vouch_data ? JSON.parse(guildSettings.vouch_data) : {};

                        // Custom Log Output
                        const logTitle = vouchData.log_title || '⭐ USER MEMBERIKAN VOUCH';
                        let logDesc = vouchData.log_description || '{user} memberikan rating {rating} Bintang!';
                        logDesc = logDesc.replace(/{user}/g, user.toString()).replace(/{rating}/g, rating.toString());

                        // Log Embed
                        const logEmbed = new EmbedBuilder()
                            .setColor('#FFD700')
                            .setTitle(logTitle)
                            .setDescription(logDesc)
                            .addFields(
                                { name: 'Rating', value: '⭐'.repeat(rating), inline: true },
                                { name: 'Reviewer', value: user.username, inline: true }
                            )
                            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: 'Vouch System', iconURL: interaction.guild.iconURL() })
                            .setTimestamp();

                        try {
                            await vouchChannel.send({ embeds: [logEmbed] });

                            // Reply Publicly and Delete Request
                            let responseMsg = vouchData.response || '{user}, Terimakasih sudah memberikan vouch! 🙏';
                            responseMsg = responseMsg.replace(/{user}/g, user.toString()).replace(/{guild}/g, interaction.guild.name);

                            await interaction.reply({ content: responseMsg });
                            await interaction.message.delete();
                        } catch (err) {
                            console.error('Failed to handle vouch:', err);
                            if (!interaction.replied) await interaction.reply({ content: 'Error processing vouch.', ephemeral: true });
                        }
                    }
                }

                // Modal submissions
                if (interaction.isModalSubmit()) {
                    interaction.botId = botId;
                    const { handleTicketModal } = await import('../src/handlers/ticketHandler.js');
                    await handleTicketModal(interaction, botId);
                }
            } catch (error) {
                console.error('Interaction error:', error);
                try {
                    const reply = { content: 'An error occurred.', ephemeral: true };
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(reply);
                    } else {
                        await interaction.reply(reply);
                    }
                } catch (e) { }
            }
        });

        // Message handler (for activity tracking and custom commands)
        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            if (!message.guild) return;

            // Update ticket activity
            const ticket = db.getTicketByChannel.get(message.channel.id);
            if (ticket && ticket.status === 'open') {
                // Track activity - simplified for now
            }

            // Custom command handler (for !trigger commands)
            if (message.content.startsWith('!')) {
                const trigger = message.content.slice(1).split(' ')[0].toLowerCase();
                if (!trigger) return;

                console.log(`[DEBUG] Custom command triggered: !${trigger} | Guild: ${message.guild.id} | BotId: ${client.botId}`);

                try {
                    const cmd = db.getCustomCommand.get(message.guild.id, client.botId, trigger);
                    console.log(`[DEBUG] Command found:`, cmd ? 'YES' : 'NO');
                    if (!cmd) return;

                    // Build response
                    const { EmbedBuilder } = await import('discord.js');

                    if (cmd.embed_title || cmd.embed_description) {
                        const embed = new EmbedBuilder()
                            .setColor(cmd.embed_color || '#5865F2');

                        if (cmd.embed_title) embed.setTitle(cmd.embed_title);
                        if (cmd.embed_description) embed.setDescription(cmd.embed_description);

                        await message.reply({
                            content: cmd.response || null,
                            embeds: [embed],
                        });
                    } else if (cmd.response) {
                        await message.reply({ content: cmd.response });
                    }
                } catch (error) {
                    console.error('Error handling custom command:', error);
                }
            }
        });



        // Error handler
        client.on('error', (error) => {
            console.error(`Bot ${botId} error:`, error);
            db.updateBotStatus.run('error', error.message, botId);
        });

        // Disconnect handler
        client.on('disconnect', () => {
            console.log(`Bot ${botId} disconnected`);
            db.updateBotStatus.run('stopped', 'Disconnected', botId);
            this.clients.delete(botId);
        });

        // Welcome & Goodbye Events
        client.on('guildMemberAdd', async (member) => {
            try {
                // Invite Tracker
                inviteManager.handleMemberAdd(member);

                if (member.user.bot) return;
                const { handleGuildMemberAdd } = await import('../src/events/guildMemberAdd.js');
                await handleGuildMemberAdd(member, botId);
            } catch (err) {
                console.error('Error in guildMemberAdd listener:', err);
            }
        });

        client.on('guildMemberRemove', async (member) => {
            try {
                if (member.user.bot) return;
                const { handleGuildMemberRemove } = await import('../src/events/guildMemberRemove.js');
                await handleGuildMemberRemove(member, botId);
            } catch (err) {
                console.error('Error in guildMemberRemove listener:', err);
            }
        });

        // Invite Tracking Events
        client.on('inviteCreate', (invite) => {
            inviteManager.handleInviteCreate(invite);
        });

        client.on('inviteDelete', (invite) => {
            inviteManager.handleInviteDelete(invite);
        });

        // Sticky Message Handler
        client.on('messageCreate', async (message) => {
            // console.log(`[Debug] Message received in channel ${message.channel.id} from ${message.author.tag}`);
            if (client.stickyManager) {
                await client.stickyManager.handleMessage(message);
            }
        });
    }

    // Restore bots that were running before restart
    async restoreBots() {
        try {
            const onlineBots = db.getBotsByStatus.all('running');
            if (onlineBots.length === 0) return;

            console.log(`♻️  Restoring ${onlineBots.length} active bots...`);
            for (const bot of onlineBots) {
                console.log(`.. Starting ${bot.bot_name || 'Bot'} (${bot.id})...`);
                await this.startBot(bot);
            }
            console.log('✅ Bot restoration complete.');
        } catch (error) {
            console.error('Failed to restore bots:', error);
        }
    }
}

// Export singleton instance
export const botManager = new BotManager();
