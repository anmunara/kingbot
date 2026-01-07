import express from 'express';
import { StickyManager } from '../stickyManager.js';
import { authenticateToken } from './userAuth.js';
import { botManager } from '../botManager.js';
import * as db from '../database.js';
import { AuditLog } from '../utils/auditLog.js';

const router = express.Router();

// Middleware to check if user owns the bot
const checkBotOwner = async (req, res, next) => {
    try {
        const bots = await botManager.getRunningBots();
        next();
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

router.use(authenticateToken);

// Get all sticky messages for a guild
router.get('/:botId/:guildId', async (req, res) => {
    try {
        const { botId, guildId } = req.params;
        const stickyMessages = StickyManager.getSticky(guildId);
        res.json(stickyMessages);
    } catch (error) {
        console.error('Error fetching sticky messages:', error);
        res.status(500).json({ error: 'Failed to fetch sticky messages' });
    }
});

// Create or Update a sticky message
router.post('/:botId/:guildId', async (req, res) => {
    try {
        const { botId, guildId } = req.params;
        const { channelId, content } = req.body;

        if (!channelId || !content) {
            return res.status(400).json({ error: 'Channel ID and Content are required' });
        }

        await StickyManager.createOrUpdate(guildId, channelId, content);

        // Update cache for running bot
        const client = botManager.getClient(parseInt(botId));
        if (client && client.stickyManager) {
            client.stickyManager.loadCache();
        }

        // Audit log
        const user = db.getUserById.get(req.userId);
        AuditLog.custom('SETTINGS_CHANGED', { userId: req.userId, username: user?.username, details: `Sticky message updated for channel ${channelId}`, target: `Guild ${guildId}` });

        res.json({ success: true });
    } catch (error) {
        console.error('Error saving sticky message:', error);
        res.status(500).json({ error: 'Failed to save sticky message' });
    }
});

// Delete a sticky message
router.delete('/:botId/:guildId/:channelId', async (req, res) => {
    try {
        const { botId, guildId, channelId } = req.params;

        StickyManager.deleteSticky(channelId);

        // Update cache
        const client = botManager.getClient(parseInt(botId));
        if (client && client.stickyManager) {
            client.stickyManager.loadCache();
        }

        // Audit log
        const user = db.getUserById.get(req.userId);
        AuditLog.custom('SETTINGS_CHANGED', { userId: req.userId, username: user?.username, details: `Sticky message deleted from channel ${channelId}`, target: `Guild ${guildId}` });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting sticky message:', error);
        res.status(500).json({ error: 'Failed to delete sticky message' });
    }
});

export default router;
