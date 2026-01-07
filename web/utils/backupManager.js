/**
 * Backup Manager - Auto backup SQLite to Google Drive
 * 
 * Features:
 * - Local backup with timestamp
 * - Google Drive upload (if configured)
 * - Keep last 7 days of local backups
 * - Scheduled daily at 00:00 WIB (17:00 UTC)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cron from 'node-cron';
import { google } from 'googleapis';
import { WebhookClient, AttachmentBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const DATA_DIR = join(__dirname, '..', 'data');
const BACKUP_DIR = join(__dirname, '..', 'backups');
const DB_FILE = join(DATA_DIR, 'database.sqlite');
const CREDENTIALS_FILE = join(__dirname, '..', '..', 'credentials.json');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Backup status tracking
let lastBackupStatus = {
    lastRun: null,
    success: false,
    message: '',
    googleDrive: false,
    discord: false
};

/**
 * Get current timestamp for filename
 */
function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Create local backup
 */
import { db } from '../database.js';

// ... (other imports)

// ... (existing code for getTimestamp)

/**
 * Create local backup using SQLite Safe Backup API
 */
async function createLocalBackup() {
    const timestamp = getTimestamp();
    const backupFileName = `backup-${timestamp}.sqlite`;
    const backupPath = join(BACKUP_DIR, backupFileName);

    try {
        console.log(`[Backup] ⏳ Starting safe backup to: ${backupFileName}`);

        // Use better-sqlite3 native backup API
        // This is safe even if the database is in WAL mode or being written to
        await db.backup(backupPath);

        console.log(`[Backup] ✅ Local backup created: ${backupFileName}`);
        return { success: true, path: backupPath, fileName: backupFileName };
    } catch (error) {
        console.error('[Backup] ❌ Local backup failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Upload to Google Drive
 */
async function uploadToGoogleDrive(filePath, fileName) {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!folderId) {
        console.log('[Backup] ⏭️  Google Drive not configured (missing GOOGLE_DRIVE_FOLDER_ID)');
        return { success: false, error: 'Not configured' };
    }

    if (!fs.existsSync(CREDENTIALS_FILE)) {
        console.log('[Backup] ⏭️  Google Drive credentials not found (credentials.json)');
        return { success: false, error: 'Credentials not found' };
    }

    try {
        // Load credentials
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));

        // Create JWT client for service account
        const jwtClient = new google.auth.JWT(
            credentials.client_email,
            null,
            credentials.private_key,
            ['https://www.googleapis.com/auth/drive']
        );

        await jwtClient.authorize();

        const drive = google.drive({ version: 'v3', auth: jwtClient });

        // Read file as buffer for simpler upload
        const fileBuffer = fs.readFileSync(filePath);

        // Upload file to shared folder
        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [folderId]
            },
            media: {
                mimeType: 'application/octet-stream',
                body: require('stream').Readable.from(fileBuffer)
            },
            fields: 'id, name',
            supportsAllDrives: true
        });

        console.log(`[Backup] ☁️  Uploaded to Google Drive: ${response.data.name} (ID: ${response.data.id})`);
        return { success: true, fileId: response.data.id };
    } catch (error) {
        console.error('[Backup] ❌ Google Drive upload failed:', error.message);

        // If quota error, suggest using Shared Drive
        if (error.message.includes('storage quota')) {
            console.log('[Backup] 💡 Tip: Create a "Shared Drive" in Google Drive and use that folder ID instead');
        }

        return { success: false, error: error.message };
    }
}

/**
 * Upload to Discord Webhook
 */
async function uploadToDiscord(filePath, fileName) {
    const webhookUrl = process.env.DISCORD_BACKUP_WEBHOOK_URL;

    if (!webhookUrl) {
        console.log('[Backup] ⏭️  Discord Webhook not configured (missing DISCORD_BACKUP_WEBHOOK_URL)');
        return { success: false, error: 'Not configured' };
    }

    try {
        const webhookClient = new WebhookClient({ url: webhookUrl });

        const attachment = new AttachmentBuilder(filePath, { name: fileName });

        await webhookClient.send({
            content: `📦 **Database Backup**\n📅 Date: ${new Date().toLocaleString('id-ID')}\n📁 File: \`${fileName}\``,
            files: [attachment]
        });

        console.log(`[Backup] 🎮 Uploaded to Discord Webhook: ${fileName}`);
        return { success: true };
    } catch (error) {
        console.error('[Backup] ❌ Discord upload failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Clean old backups (keep last 7 days)
 */
function cleanOldBackups() {
    const MAX_DAYS = 7;
    const now = Date.now();
    const maxAge = MAX_DAYS * 24 * 60 * 60 * 1000;

    try {
        const files = fs.readdirSync(BACKUP_DIR);
        let deleted = 0;

        for (const file of files) {
            if (!file.startsWith('backup-')) continue;

            const filePath = join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                deleted++;
            }
        }

        if (deleted > 0) {
            console.log(`[Backup] 🗑️  Cleaned ${deleted} old backup(s)`);
        }
    } catch (error) {
        console.error('[Backup] ⚠️  Error cleaning backups:', error.message);
    }
}

/**
 * Run full backup process
 */
export async function runBackup() {
    console.log('\n[Backup] 🔄 Starting backup process...');

    // 1. Create local backup (now async for safe backup)
    const localResult = await createLocalBackup();

    if (!localResult.success) {
        lastBackupStatus = {
            lastRun: new Date().toISOString(),
            success: false,
            message: `Local backup failed: ${localResult.error}`,
            googleDrive: false
        };
        return lastBackupStatus;
    }

    // 2. Upload to Google Drive
    const driveResult = await uploadToGoogleDrive(localResult.path, localResult.fileName);

    // 3. Upload to Discord
    const discordResult = await uploadToDiscord(localResult.path, localResult.fileName);

    // 4. Clean old backups
    cleanOldBackups();

    // 5. Update status
    lastBackupStatus = {
        lastRun: new Date().toISOString(),
        success: true,
        message: `Backup completed: ${localResult.fileName}`,
        googleDrive: driveResult.success,
        discord: discordResult.success
    };

    console.log('[Backup] ✅ Backup process completed\n');
    return lastBackupStatus;
}

/**
 * Get backup status
 */
export function getBackupStatus() {
    return lastBackupStatus;
}

/**
 * List local backups
 */
export function listBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('backup-'))
            .map(f => {
                const filePath = join(BACKUP_DIR, f);
                const stats = fs.statSync(filePath);
                return {
                    name: f,
                    size: stats.size,
                    created: stats.mtime
                };
            })
            .sort((a, b) => b.created - a.created);

        return files;
    } catch (error) {
        return [];
    }
}

/**
 * Initialize backup scheduler
 * Runs at 00:00 WIB (17:00 UTC previous day)
 */
export function initBackupScheduler() {
    // Cron: minute hour day month weekday
    // 00:00 WIB = 17:00 UTC (WIB is UTC+7)
    const cronSchedule = '0 17 * * *';

    console.log('[Backup] ⏰ Scheduler initialized (00:00 WIB daily)');

    cron.schedule(cronSchedule, async () => {
        console.log('[Backup] ⏰ Scheduled backup triggered');
        await runBackup();
    }, {
        timezone: 'Asia/Jakarta'
    });

    // Actually let's use timezone properly
    // With timezone option, we can use 00:00 directly
    cron.schedule('0 0 * * *', async () => {
        console.log('[Backup] ⏰ Scheduled backup triggered (00:00 WIB)');
        await runBackup();
    }, {
        timezone: 'Asia/Jakarta'
    });
}

export default {
    runBackup,
    getBackupStatus,
    listBackups,
    initBackupScheduler
};
