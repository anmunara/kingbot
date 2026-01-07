import { Events } from 'discord.js';
import { upsertGuild } from '../database/db.js';

export const name = Events.GuildCreate;
export const once = false;

export async function execute(guild) {
    console.log(`📥 Joined new guild: ${guild.name} (${guild.id})`);

    // Initialize guild in database
    upsertGuild.run(guild.id, guild.client.botId);
}
