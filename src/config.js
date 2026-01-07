import 'dotenv/config';

export const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,

    // Default embed colors
    colors: {
        primary: 0x5865F2,  // Discord Blurple
        success: 0x57F287,  // Green
        warning: 0xFEE75C,  // Yellow
        error: 0xED4245,    // Red
        ticket: 0xD4AF37,   // Gold
    },

    // Ticket settings
    ticket: {
        defaultCategoryName: 'Tickets',
        transcriptEnabled: true,
    }
};
