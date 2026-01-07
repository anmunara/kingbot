import { db } from './database.js';

export class StickyManager {
    constructor(client) {
        this.client = client;
        this.cache = new Map(); // channelId -> { content, lastMessageId }
    }

    // Initialize: Load all sticky configs for this bot's guilds
    async init() {
        try {
            // We only load configs for guilds this bot is in
            // actually, botManager manages multiple bots. 
            // This class might be instantiated per bot, OR one global manager.
            // Based on previous patterns (InviteManager), it seems we might want one manager per bot 
            // OR one global manager that handles all.
            // Let's check how InviteManager was done. It was likely global or per-bot.
            // Actually, seeing botManager.js, it seems we pass the client to managers.

            // Let's assume this manager is instantiated for a specific bot client
            // But wait, the DB has guild_id. 
            // If we use one global manager, we need to know which client handles which guild.
            // Best approach: The manager is attached to the bot client or used by the event handler which has access to the client.

            this.loadCache();
            console.log(`📌 StickyManager initialized for ${this.client.user.tag}`);
        } catch (error) {
            console.error('Failed to init StickyManager:', error);
        }
    }

    loadCache() {
        try {
            // Load all sticky messages from DB
            // We verify guild ownership at the event level or simply load all.
            // For efficiency, we can just load all.
            const rows = db.prepare('SELECT * FROM sticky_messages').all();
            console.log(`[Sticky] Loaded ${rows.length} sticky message configs`);
            for (const row of rows) {
                // console.log(`[Sticky] Cached channel: ${row.channel_id}, content: ${row.content.substring(0, 50)}...`);
                this.cache.set(row.channel_id, {
                    id: row.id,
                    guildId: row.guild_id,
                    content: row.content,
                    lastMessageId: row.last_message_id
                });
            }
        } catch (error) {
            console.error('Error loading sticky cache:', error);
        }
    }

    async handleMessage(message) {
        if (message.author.bot) return; // Ignore bots

        const config = this.cache.get(message.channel.id);
        if (!config) {
            // console.log(`[Sticky] Channel ${message.channel.id} is not a sticky channel`);
            return; // Not a sticky channel
        }
        // console.log(`[Sticky] Handling message in sticky channel ${message.channel.id}`);

        try {
            // Delete last sticky message if it exists
            if (config.lastMessageId) {
                try {
                    const lastMsg = await message.channel.messages.fetch(config.lastMessageId).catch(() => null);
                    if (lastMsg) {
                        await lastMsg.delete();
                    }
                } catch (err) {
                    console.warn(`Could not delete previous sticky message in ${message.channel.id}:`, err.message);
                }
            }

            // Send new sticky message
            const sentMsg = await message.channel.send(config.content);

            // Update DB and Cache
            this.updateLastMessageId(message.channel.id, sentMsg.id);

        } catch (error) {
            console.error(`Error handling sticky message in ${message.channel.id}:`, error);
        }
    }

    updateLastMessageId(channelId, messageId) {
        const config = this.cache.get(channelId);
        if (config) {
            config.lastMessageId = messageId;
            this.cache.set(channelId, config); // Update cache

            // Update DB
            try {
                db.prepare('UPDATE sticky_messages SET last_message_id = ? WHERE channel_id = ?')
                    .run(messageId, channelId);
            } catch (err) {
                console.error('Failed to update last_message_id in DB:', err);
            }
        }
    }

    // CRUD Methods for API
    static getSticky(guildId) {
        return db.prepare('SELECT * FROM sticky_messages WHERE guild_id = ?').all(guildId);
    }

    static async createOrUpdate(guildId, channelId, content) {
        // Upsert
        const existing = db.prepare('SELECT id FROM sticky_messages WHERE channel_id = ?').get(channelId);

        if (existing) {
            db.prepare('UPDATE sticky_messages SET content = ?, last_message_id = NULL WHERE channel_id = ?')
                .run(content, channelId);
        } else {
            db.prepare('INSERT INTO sticky_messages (guild_id, channel_id, content) VALUES (?, ?, ?)')
                .run(guildId, channelId, content);
        }

        // Note: For the cache to update immediately for the running bot, 
        // we might need a way to signal the running bot instance.
        // Since the bot runs in the same process as the web server (currently),
        // we can access the active bot's manager if strictly coupled, 
        // OR we rely on the periodic refresh / event-based refresh.
        // For this architecture, we might need to expose a method to update the cache globally.
    }

    static deleteSticky(channelId) {
        db.prepare('DELETE FROM sticky_messages WHERE channel_id = ?').run(channelId);
    }
}
