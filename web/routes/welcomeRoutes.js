import express from 'express';
import * as db from '../database.js';
import { authenticateToken } from './userAuth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AuditLog } from '../utils/auditLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Get Welcome Settings
router.get('/:botId/:guildId', authenticateToken, (req, res) => {
    try {
        const { botId, guildId } = req.params;
        const settings = db.getWelcomeSettings.get(guildId, botId);
        res.json(settings || {});
    } catch (error) {
        console.error('Error fetching welcome settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Save Welcome Settings
router.post('/:botId/:guildId', authenticateToken, upload.single('card_background'), (req, res) => {
    try {
        const { botId, guildId } = req.params;
        const {
            welcome_enabled, welcome_channel_id, welcome_message,
            goodbye_enabled, goodbye_channel_id, goodbye_message,
            autorole_enabled, autorole_id,
            welcome_card_enabled, card_font, card_text_color, card_bg_color, card_overlay_opacity
        } = req.body;

        // Get existing settings to preserve background if not updated
        const currentSettings = db.getWelcomeSettings.get(guildId, botId);
        let card_background = currentSettings?.card_background || null;

        if (req.file) {
            // New file uploaded
            card_background = `/uploads/${req.file.filename}`;
        } else if (req.body.remove_background === 'true') {
            card_background = null;
        }

        db.saveWelcomeSettings.run(
            guildId, botId,
            welcome_enabled === 'true' || welcome_enabled === true ? 1 : 0,
            welcome_channel_id || null,
            welcome_message || '',
            goodbye_enabled === 'true' || goodbye_enabled === true ? 1 : 0,
            goodbye_channel_id || null,
            goodbye_message || '',
            autorole_enabled === 'true' || autorole_enabled === true ? 1 : 0,
            autorole_id || null,
            welcome_card_enabled === 'true' || welcome_card_enabled === true ? 1 : 0,
            card_background,
            card_font || 'Inter',
            card_text_color || '#ffffff',
            card_bg_color || '#000000',
            parseFloat(card_overlay_opacity) || 0.5
        );

        // Audit log
        const user = db.getUserById.get(req.userId);
        AuditLog.custom('SETTINGS_CHANGED', { userId: req.userId, username: user?.username, details: 'Welcome/Leave settings updated', target: `Guild ${guildId}` });

        res.json({ success: true, message: 'Settings saved successfully', background: card_background });
    } catch (error) {
        console.error('Error saving welcome settings:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

export default router;
