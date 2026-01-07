import { Router } from 'express';
import * as db from '../../src/database/db.js';

const router = Router();

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
}

// Check if user has permission in guild
function hasPermission(guild) {
    const MANAGE_GUILD = 0x20; // Manage Server permission
    return (guild.permissions & MANAGE_GUILD) === MANAGE_GUILD || guild.owner;
}

// Get user's guilds (that they can manage and bot is in)
router.get('/guilds', requireAuth, (req, res) => {
    const client = req.app.get('discordClient');
    const userGuilds = req.session.guilds || [];

    // Filter guilds user can manage and bot is in
    const managableGuilds = userGuilds
        .filter(g => hasPermission(g))
        .map(g => {
            const botGuild = client?.guilds?.cache?.get(g.id);
            return {
                id: g.id,
                name: g.name,
                icon: g.icon,
                botJoined: !!botGuild,
            };
        })
        .sort((a, b) => (b.botJoined ? 1 : 0) - (a.botJoined ? 1 : 0));

    res.json(managableGuilds);
});

// Get guild info
router.get('/guild/:id', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const client = req.app.get('discordClient');

    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) {
        return res.status(404).json({ error: 'Guild not found or bot not joined' });
    }

    const guildConfig = db.getGuild.get(guildId);

    res.json({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL(),
        memberCount: guild.memberCount,
        config: guildConfig,
    });
});

// Get guild panels
router.get('/guild/:id/panels', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const panels = db.getPanelsByGuild.all(guildId);

    const panelsWithOptions = panels.map(panel => {
        const options = db.getPanelOptions.all(panel.id);
        return {
            ...panel,
            options: options.map(opt => {
                const questions = db.getQuestionsByOption.all(opt.id);
                return { ...opt, questions };
            }),
        };
    });

    res.json(panelsWithOptions);
});

// Create panel
router.post('/guild/:id/panels', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const { name, title, description, color, image, footer } = req.body;

    if (!name || !title) {
        return res.status(400).json({ error: 'Name and title are required' });
    }

    db.upsertGuild.run(guildId);

    const result = db.createPanel.run(
        guildId,
        name,
        title,
        description || '',
        color || '#5865F2',
        image || null,
        null,
        footer || null,
        null,
        null
    );

    res.json({
        success: true,
        panelId: result.lastInsertRowid,
    });
});

// Delete panel
router.delete('/guild/:id/panels/:panelId', requireAuth, (req, res) => {
    const { id: guildId, panelId } = req.params;

    const panel = db.getPanel.get(panelId);
    if (!panel || panel.guild_id !== guildId) {
        return res.status(404).json({ error: 'Panel not found' });
    }

    db.deletePanel.run(panelId);

    res.json({ success: true });
});

// Get guild tickets
router.get('/guild/:id/tickets', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const page = parseInt(req.query.page) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const tickets = db.getTicketsByGuild.all(guildId, limit, page * limit);

    res.json(tickets);
});

// Get guild stats
router.get('/guild/:id/stats', requireAuth, (req, res) => {
    const guildId = req.params.id;

    const stats = db.getTicketStats.get(guildId);
    const staffStats = db.getStaffStats.all(guildId);
    const categoryStats = db.getTicketsByCategory.all(guildId);

    res.json({
        overview: stats,
        staff: staffStats,
        categories: categoryStats,
    });
});

// Update guild settings
router.put('/guild/:id/settings', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const { logChannel, transcriptChannel, ticketCategory, language, autoCloseHours } = req.body;

    db.upsertGuild.run(guildId);

    if (logChannel !== undefined) {
        db.updateGuildSetting(guildId, 'log_channel_id', logChannel);
    }
    if (transcriptChannel !== undefined) {
        db.updateGuildSetting(guildId, 'transcript_channel_id', transcriptChannel);
    }
    if (ticketCategory !== undefined) {
        db.updateGuildSetting(guildId, 'ticket_category_id', ticketCategory);
    }
    if (language !== undefined) {
        db.updateGuildSetting(guildId, 'language', language);
    }
    if (autoCloseHours !== undefined) {
        db.updateGuildSetting(guildId, 'auto_close_hours', autoCloseHours);
    }
    if (req.body.supportRoles !== undefined) {
        db.updateGuildSetting(guildId, 'support_role_ids', JSON.stringify(req.body.supportRoles));
    }

    res.json({ success: true });
});

// Get guild channels
router.get('/guild/:id/channels', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const client = req.app.get('discordClient');

    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
    }

    const channels = guild.channels.cache
        .filter(c => c.type === 0 || c.type === 4) // Text and Category
        .map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            parentId: c.parentId,
        }));

    res.json(channels);
});

// Get guild roles
router.get('/guild/:id/roles', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const client = req.app.get('discordClient');

    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
    }

    const roles = guild.roles.cache
        .filter(r => r.id !== guildId) // Exclude @everyone
        .map(r => ({
            id: r.id,
            name: r.name,
            color: r.hexColor,
        }))
        .sort((a, b) => b.position - a.position);

    res.json(roles);
});

export default router;
