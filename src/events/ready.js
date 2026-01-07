import { Events, ActivityType } from 'discord.js';
import { upsertGuild } from '../database/db.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
    console.log('━'.repeat(50));
    console.log(`🎫 Ticket Bot is online!`);
    console.log(`📛 Logged in as: ${client.user.tag}`);
    console.log(`🏠 Serving ${client.guilds.cache.size} servers`);
    console.log('━'.repeat(50));

    // Set bot activity
    client.user.setActivity('tickets 🎫', { type: ActivityType.Watching });

    // Initialize guilds in database
    for (const [guildId] of client.guilds.cache) {
        upsertGuild.run(guildId, client.botId);
    }
}
