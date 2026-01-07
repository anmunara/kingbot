/**
 * Admin Routes - User & Invite Management
 */

import { Router } from 'express';
import crypto from 'crypto';
import { authenticateToken } from './userAuth.js';
import * as db from '../database.js';
import { AuditLog } from '../utils/auditLog.js';

const router = Router();

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
    const user = db.getUserById.get(req.userId);
    if (!user || !user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminUser = user;
    next();
}

// ========================
// Admin Stats
// ========================

router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        const totalUsers = db.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const totalBots = db.db.prepare('SELECT COUNT(*) as count FROM bots').get().count;
        const activeBots = db.db.prepare("SELECT COUNT(*) as count FROM bots WHERE status = 'running'").get().count;
        const totalInviteCodes = db.db.prepare('SELECT COUNT(*) as count FROM invite_codes').get().count;
        const bannedUsers = db.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_banned = 1').get().count;

        res.json({
            totalUsers,
            totalBots,
            activeBots,
            totalInviteCodes,
            bannedUsers
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// ========================
// User Management
// ========================

router.get('/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = db.getAllUsers.all();
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

router.put('/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { is_approved, is_banned, max_bots } = req.body;

        // Prevent admin from modifying themselves
        if (userId === req.userId) {
            return res.status(400).json({ error: 'Cannot modify your own account' });
        }

        const targetUser = db.getUserById.get(userId);
        const oldBanned = targetUser?.is_banned || 0;
        const newBanned = is_banned ?? 0;

        db.updateUser.run(
            is_approved ?? 1,
            newBanned,
            max_bots ?? 2,
            userId
        );

        // Audit log for ban/unban
        if (oldBanned !== newBanned) {
            if (newBanned) {
                AuditLog.userBanned(req.userId, req.adminUser.username, targetUser?.username || `User #${userId}`);
            } else {
                AuditLog.custom('USER_UNBANNED', { userId: req.userId, username: req.adminUser.username, target: targetUser?.username || `User #${userId}` });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Prevent admin from deleting themselves
        if (userId === req.userId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const targetUser = db.getUserById.get(userId);
        db.deleteUser.run(userId);

        // Audit log
        AuditLog.userDeleted(req.userId, req.adminUser.username, targetUser?.username || `User #${userId}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Make user admin
router.post('/users/:id/admin', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const targetUser = db.getUserById.get(userId);
        db.makeUserAdmin.run(userId);

        // Audit log
        AuditLog.custom('ADMIN_ACTION', { userId: req.userId, username: req.adminUser.username, target: targetUser?.username || `User #${userId}`, details: 'Granted admin privileges' });

        res.json({ success: true });
    } catch (error) {
        console.error('Make admin error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ========================
// Invite Code Management
// ========================

// Generate random invite code
function generateCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

router.get('/codes', authenticateToken, requireAdmin, (req, res) => {
    try {
        const codes = db.getAllInviteCodes.all();
        res.json(codes);
    } catch (error) {
        console.error('Get codes error:', error);
        res.status(500).json({ error: 'Failed to get invite codes' });
    }
});

router.post('/codes', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { max_uses, expires_days } = req.body;
        const code = generateCode();

        let expiresAt = null;
        if (expires_days && expires_days > 0) {
            const date = new Date();
            date.setDate(date.getDate() + expires_days);
            expiresAt = date.toISOString();
        }

        db.createInviteCode.run(code, req.userId, max_uses || 1, expiresAt);

        // Audit log
        AuditLog.inviteCreated(req.userId, req.adminUser.username, code);

        res.json({
            success: true,
            code,
            max_uses: max_uses || 1,
            expires_at: expiresAt
        });
    } catch (error) {
        console.error('Create code error:', error);
        res.status(500).json({ error: 'Failed to create invite code' });
    }
});

router.delete('/codes/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const codeId = parseInt(req.params.id);
        db.deleteInviteCode.run(codeId);

        // Audit log
        AuditLog.custom('ADMIN_ACTION', { userId: req.userId, username: req.adminUser.username, details: `Deleted invite code #${codeId}` });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete code error:', error);
        res.status(500).json({ error: 'Failed to delete invite code' });
    }
});

// ========================
// Settings
// ========================

router.get('/settings', authenticateToken, requireAdmin, (req, res) => {
    try {
        const requireInvite = process.env.REQUIRE_INVITE_CODE !== 'false';
        res.json({
            requireInviteCode: requireInvite,
            defaultMaxBots: 2
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// ========================
// Backup Management
// ========================

import { runBackup, getBackupStatus, listBackups } from '../utils/backupManager.js';

// Get backup status
router.get('/backup/status', authenticateToken, requireAdmin, (req, res) => {
    try {
        const status = getBackupStatus();
        const backups = listBackups();
        res.json({ status, backups });
    } catch (error) {
        console.error('Backup status error:', error);
        res.status(500).json({ error: 'Failed to get backup status' });
    }
});

// Trigger manual backup
router.post('/backup/run', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await runBackup();

        // Audit log
        AuditLog.backupCompleted(result.success, `Manual trigger by ${req.adminUser.username}`);

        res.json(result);
    } catch (error) {
        console.error('Manual backup error:', error);
        res.status(500).json({ error: 'Backup failed' });
    }
});

export default router;
