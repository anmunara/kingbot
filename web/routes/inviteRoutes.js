import express from 'express';
import { authenticateToken } from './userAuth.js';
import { db } from '../database.js';
import { botManager } from '../botManager.js';

const router = express.Router();

// Get Invite Leaderboard
router.get('/:botId/:guildId/leaderboard', authenticateToken, async (req, res) => {
    const { botId, guildId } = req.params;

    try {
        const rows = db.prepare(`
            SELECT inviter_id, COUNT(*) as count 
            FROM invite_joins 
            WHERE guild_id = ? AND inviter_id IS NOT NULL AND inviter_id != 'unknown'
            GROUP BY inviter_id 
            ORDER BY count DESC 
            LIMIT 10
        `).all(guildId);

        // Fetch user details from Discord
        const bot = botManager.getClient(parseInt(botId));
        if (bot) {
            for (const row of rows) {
                try {
                    const user = await bot.users.fetch(row.inviter_id).catch(() => null);
                    if (user) {
                        row.username = user.username;
                        row.discriminator = user.discriminator;
                        row.avatar = user.displayAvatarURL();
                    } else {
                        row.username = 'Unknown User';
                        row.avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
                    }
                } catch (e) {
                    row.username = 'Unknown User';
                }
            }
        }

        res.json(rows);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// Get Recent Joins
router.get('/:botId/:guildId/recent', authenticateToken, async (req, res) => {
    const { botId, guildId } = req.params;

    try {
        const rows = db.prepare(`
            SELECT * FROM invite_joins 
            WHERE guild_id = ? 
            ORDER BY created_at DESC 
            LIMIT 50
        `).all(guildId);

        // Fetch user details from Discord
        const bot = botManager.getClient(parseInt(botId));
        if (bot) {
            for (const row of rows) {
                try {
                    const user = await bot.users.fetch(row.user_id).catch(() => null);
                    if (user) {
                        row.user_username = user.username;
                        row.user_avatar = user.displayAvatarURL();
                    } else {
                        row.user_username = 'Unknown User';
                        row.user_avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
                    }

                    if (row.inviter_id && row.inviter_id !== 'unknown') {
                        const inviter = await bot.users.fetch(row.inviter_id).catch(() => null);
                        if (inviter) {
                            row.inviter_username = inviter.username;
                        } else {
                            row.inviter_username = 'Unknown Inviter';
                        }
                    } else {
                        row.inviter_username = row.inviter_id === null ? 'Vanity/System' : 'Unknown';
                    }

                } catch (e) {
                    // ignore
                }
            }
        }

        res.json(rows);
    } catch (error) {
        console.error('Error fetching recent joins:', error);
        res.status(500).json({ error: 'Failed to fetch recent joins' });
    }
});

export default router;
