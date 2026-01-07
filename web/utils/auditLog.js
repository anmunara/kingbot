/**
 * Audit Log System - Discord Webhook Integration
 * Logs security-sensitive actions to a Discord channel via webhook
 */

import fetch from 'node-fetch';

// Webhook URL from environment variable
const AUDIT_WEBHOOK_URL = process.env.AUDIT_WEBHOOK_URL;

// Event types with colors and emojis
const EVENT_TYPES = {
    LOGIN: { emoji: '🔐', color: 0x22C55E, name: 'Login' },
    LOGOUT: { emoji: '🚪', color: 0x6B7280, name: 'Logout' },
    LOGIN_FAILED: { emoji: '⛔', color: 0xEF4444, name: 'Login Failed' },
    REGISTER: { emoji: '📝', color: 0x3B82F6, name: 'New Registration' },
    BOT_TOKEN_UPDATE: { emoji: '🔑', color: 0xF59E0B, name: 'Bot Token Updated' },
    BOT_CREATED: { emoji: '🤖', color: 0x22C55E, name: 'Bot Created' },
    BOT_DELETED: { emoji: '🗑️', color: 0xEF4444, name: 'Bot Deleted' },
    BOT_STARTED: { emoji: '▶️', color: 0x22C55E, name: 'Bot Started' },
    BOT_STOPPED: { emoji: '⏹️', color: 0xF59E0B, name: 'Bot Stopped' },
    USER_BANNED: { emoji: '🔨', color: 0xEF4444, name: 'User Banned' },
    USER_UNBANNED: { emoji: '✅', color: 0x22C55E, name: 'User Unbanned' },
    USER_DELETED: { emoji: '❌', color: 0xEF4444, name: 'User Deleted' },
    ADMIN_ACTION: { emoji: '👑', color: 0xFAE022, name: 'Admin Action' },
    INVITE_CREATED: { emoji: '🎟️', color: 0x3B82F6, name: 'Invite Created' },
    SETTINGS_CHANGED: { emoji: '⚙️', color: 0x6B7280, name: 'Settings Changed' },
    PANEL_DELETED: { emoji: '📋', color: 0xF59E0B, name: 'Panel Deleted' },
    BACKUP_COMPLETED: { emoji: '💾', color: 0x22C55E, name: 'Backup Completed' },
    SECURITY_ALERT: { emoji: '🚨', color: 0xEF4444, name: 'Security Alert' },
};

/**
 * Send an audit log to Discord
 * @param {string} eventType - One of EVENT_TYPES keys
 * @param {Object} data - Event data
 * @param {string} data.userId - User ID who performed action (optional)
 * @param {string} data.username - Username who performed action (optional)
 * @param {string} data.ip - IP address (optional)
 * @param {string} data.details - Additional details
 * @param {string} data.target - Target of the action (e.g., bot name, user name)
 */
export async function logAuditEvent(eventType, data = {}) {
    // Skip if no webhook configured
    if (!AUDIT_WEBHOOK_URL) {
        console.log(`[Audit] ${eventType}: ${data.details || 'No details'} (Webhook not configured)`);
        return;
    }

    const event = EVENT_TYPES[eventType] || { emoji: '📌', color: 0x6B7280, name: eventType };

    const fields = [];

    if (data.userId || data.username) {
        fields.push({
            name: '👤 User',
            value: data.username ? `${data.username} (\`${data.userId || 'N/A'}\`)` : `\`${data.userId}\``,
            inline: true
        });
    }

    if (data.target) {
        fields.push({
            name: '🎯 Target',
            value: data.target,
            inline: true
        });
    }

    if (data.ip) {
        fields.push({
            name: '🌐 IP Address',
            value: `\`${maskIp(data.ip)}\``,
            inline: true
        });
    }

    if (data.details) {
        fields.push({
            name: '📝 Details',
            value: data.details.substring(0, 1024), // Discord limit
            inline: false
        });
    }

    const embed = {
        title: `${event.emoji} ${event.name}`,
        color: event.color,
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: {
            text: 'KingBot Audit Log'
        }
    };

    try {
        await fetch(AUDIT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (error) {
        console.error('[Audit] Failed to send audit log:', error.message);
    }
}

/**
 * Mask IP address for privacy (show only first two octets)
 * @param {string} ip - Full IP address
 * @returns {string} - Masked IP
 */
function maskIp(ip) {
    if (!ip) return 'Unknown';
    const parts = ip.replace('::ffff:', '').split('.');
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    return ip.substring(0, 10) + '...';
}

/**
 * Convenience functions for common events
 */
export const AuditLog = {
    login: (userId, username, ip) =>
        logAuditEvent('LOGIN', { userId, username, ip }),

    loginFailed: (email, ip, reason) =>
        logAuditEvent('LOGIN_FAILED', { username: email, ip, details: reason }),

    logout: (userId, username) =>
        logAuditEvent('LOGOUT', { userId, username }),

    register: (userId, username, ip) =>
        logAuditEvent('REGISTER', { userId, username, ip }),

    botTokenUpdate: (userId, username, botName) =>
        logAuditEvent('BOT_TOKEN_UPDATE', { userId, username, target: botName }),

    botCreated: (userId, username, botName) =>
        logAuditEvent('BOT_CREATED', { userId, username, target: botName }),

    botDeleted: (userId, username, botName) =>
        logAuditEvent('BOT_DELETED', { userId, username, target: botName }),

    botStarted: (userId, username, botName) =>
        logAuditEvent('BOT_STARTED', { userId, username, target: botName }),

    botStopped: (userId, username, botName) =>
        logAuditEvent('BOT_STOPPED', { userId, username, target: botName }),

    userBanned: (adminId, adminName, targetUser) =>
        logAuditEvent('USER_BANNED', { userId: adminId, username: adminName, target: targetUser }),

    userDeleted: (adminId, adminName, targetUser) =>
        logAuditEvent('USER_DELETED', { userId: adminId, username: adminName, target: targetUser }),

    inviteCreated: (adminId, adminName, code) =>
        logAuditEvent('INVITE_CREATED', { userId: adminId, username: adminName, details: `Code: \`${code}\`` }),

    panelDeleted: (userId, username, panelName, guildId) =>
        logAuditEvent('PANEL_DELETED', { userId, username, target: panelName, details: `Guild: ${guildId}` }),

    securityAlert: (type, details, ip) =>
        logAuditEvent('SECURITY_ALERT', { details: `**${type}**: ${details}`, ip }),

    backupCompleted: (success, destination) =>
        logAuditEvent('BACKUP_COMPLETED', { details: `${success ? '✅' : '⚠️'} ${destination}` }),

    custom: (eventType, data) =>
        logAuditEvent(eventType, data)
};

export default AuditLog;
