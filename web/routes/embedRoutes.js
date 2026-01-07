
import express from 'express';
import { authenticateToken } from './userAuth.js';
import * as db from '../database.js';
import { botManager } from '../botManager.js';
import { EmbedBuilder } from 'discord.js';
import { sanitizeUrl } from '../utils/sanitize.js';
import { AuditLog } from '../utils/auditLog.js';

const router = express.Router();

// Get all embeds for a guild
router.get('/:botId/:guildId', authenticateToken, (req, res) => {
    try {
        const { botId, guildId } = req.params;
        const embeds = db.getEmbedsByGuild.all(guildId, botId);
        res.json(embeds);
    } catch (error) {
        console.error('Error fetching embeds:', error);
        res.status(500).json({ error: 'Failed to fetch embeds' });
    }
});

// Get single embed
router.get('/:botId/:guildId/:embedId', authenticateToken, (req, res) => {
    try {
        const { botId, guildId, embedId } = req.params;
        const embed = db.getEmbed.get(embedId, guildId, botId);
        if (!embed) {
            return res.status(404).json({ error: 'Embed not found' });
        }
        res.json(embed);
    } catch (error) {
        console.error('Error fetching embed:', error);
        res.status(500).json({ error: 'Failed to fetch embed' });
    }
});

// Create new embed
router.post('/:botId/:guildId', authenticateToken, (req, res) => {
    try {
        const { botId, guildId } = req.params;
        const {
            name, channel_id, content, title, description, color,
            image_url, thumbnail_url, footer_text, footer_icon_url,
            author_name, author_icon_url, author_url, title_url, timestamp
        } = req.body;

        const result = db.createEmbed.run(
            guildId,
            botId,
            name || 'New Embed',
            channel_id || null,
            content || null,
            title || null,
            description || null,
            color || '#000000',
            image_url || null,
            thumbnail_url || null,
            footer_text || null,
            footer_icon_url || null,
            author_name || null,
            author_icon_url || null,
            author_url || null,
            title_url || null,
            timestamp ? 1 : 0
        );

        res.json({ success: true, id: result.lastInsertRowid, message: 'Embed created successfully' });
    } catch (error) {
        console.error('Error creating embed:', error);
        res.status(500).json({ error: 'Failed to create embed' });
    }
});

// Update embed
router.put('/:botId/:guildId/:embedId', authenticateToken, (req, res) => {
    try {
        const { botId, guildId, embedId } = req.params;
        const {
            name, channel_id, content, title, description, color,
            image_url, thumbnail_url, footer_text, footer_icon_url,
            author_name, author_icon_url, author_url, title_url, timestamp
        } = req.body;

        db.updateEmbed.run(
            name || 'New Embed',
            channel_id || null,
            content || null,
            title || null,
            description || null,
            color || '#000000',
            image_url || null,
            thumbnail_url || null,
            footer_text || null,
            footer_icon_url || null,
            author_name || null,
            author_icon_url || null,
            author_url || null,
            title_url || null,
            timestamp ? 1 : 0,
            embedId,
            guildId,
            botId
        );

        res.json({ success: true, message: 'Embed updated successfully' });
    } catch (error) {
        console.error('Error updating embed:', error);
        res.status(500).json({ error: 'Failed to update embed' });
    }
});

// Delete embed
router.delete('/:botId/:guildId/:embedId', authenticateToken, (req, res) => {
    try {
        const { botId, guildId, embedId } = req.params;
        const embed = db.getEmbed.get(embedId, guildId, botId);
        db.deleteEmbed.run(embedId, guildId, botId);

        // Audit log
        const user = db.getUserById.get(req.userId);
        AuditLog.custom('SETTINGS_CHANGED', { userId: req.userId, username: user?.username, details: `Deleted embed: ${embed?.name || embedId}`, target: `Guild ${guildId}` });

        res.json({ success: true, message: 'Embed deleted successfully' });
    } catch (error) {
        console.error('Error deleting embed:', error);
        res.status(500).json({ error: 'Failed to delete embed' });
    }
});

// Send embed to channel
router.post('/:botId/:guildId/:embedId/send', authenticateToken, async (req, res) => {
    try {
        const { botId, guildId, embedId } = req.params;
        const embedData = db.getEmbed.get(embedId, guildId, botId);

        if (!embedData) {
            return res.status(404).json({ error: 'Embed not found' });
        }

        if (!embedData.channel_id) {
            return res.status(400).json({ error: 'No channel selected for this embed' });
        }

        const bot = botManager.getClient(parseInt(botId));
        if (!bot) {
            return res.status(404).json({ error: 'Bot is not running' });
        }

        const channel = await bot.channels.fetch(embedData.channel_id).catch(() => null);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found or bot lacks access' });
        }

        // Secure URL validation using sanitizeUrl (prevents javascript: and data: URLs)
        const isValidUrl = (url) => sanitizeUrl(url) !== null;

        const embed = new EmbedBuilder();
        if (embedData.title) embed.setTitle(embedData.title);
        if (embedData.description) embed.setDescription(embedData.description);
        if (embedData.color) embed.setColor(embedData.color);

        if (embedData.image_url && isValidUrl(embedData.image_url)) embed.setImage(embedData.image_url);
        if (embedData.thumbnail_url && isValidUrl(embedData.thumbnail_url)) embed.setThumbnail(embedData.thumbnail_url);

        if (embedData.footer_text) {
            const footerObj = { text: embedData.footer_text };
            if (embedData.footer_icon_url && isValidUrl(embedData.footer_icon_url)) {
                footerObj.iconURL = embedData.footer_icon_url;
            }
            embed.setFooter(footerObj);
        }

        if (embedData.author_name) {
            const authorObj = { name: embedData.author_name };
            if (embedData.author_icon_url && isValidUrl(embedData.author_icon_url)) {
                authorObj.iconURL = embedData.author_icon_url;
            }
            if (embedData.author_url && isValidUrl(embedData.author_url)) {
                authorObj.url = embedData.author_url;
            }
            embed.setAuthor(authorObj);
        }

        if (embedData.title_url && isValidUrl(embedData.title_url)) embed.setURL(embedData.title_url);
        if (embedData.timestamp) embed.setTimestamp();

        const messagePayload = { embeds: [embed] };
        if (embedData.content) {
            messagePayload.content = embedData.content;
        }

        await channel.send(messagePayload);

        res.json({ success: true, message: 'Embed sent successfully' });
    } catch (error) {
        console.error('Error sending embed:', error);
        res.status(500).json({ error: 'Failed to send embed: ' + error.message });
    }
});

export default router;
