import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import userAuthRoutes from './routes/userAuth.js';
import botRoutes from './routes/botRoutes.js';
import welcomeRoutes from './routes/welcomeRoutes.js';
import embedRoutes from './routes/embedRoutes.js';
import inviteRoutes from './routes/inviteRoutes.js';
import stickyRoutes from './routes/stickyRoutes.js';
import pagesRoutes from './routes/pages.js';
import { botManager } from './botManager.js';
import { globalLimiter } from './middleware/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.WEB_PORT || 3000;

// ===================
// SECURITY MIDDLEWARE
// ===================

// Helmet - Security Headers (XSS, Clickjacking, etc.)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "cdn.discordapp.com", "https:"],
            connectSrc: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Allow Discord CDN images
}));

// Rate Limiting - Global (imported from middleware)
app.use(globalLimiter);

// ===================
// STANDARD MIDDLEWARE
// ===================

app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(join(__dirname, 'public')));

// Session (for page auth)
app.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbot-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true, // Prevent XSS access to cookies
        sameSite: 'lax', // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// API Routes

app.use('/api/auth', userAuthRoutes); // Email/Password (Legacy/Alternative)
app.use('/api/bots', botRoutes);
// welcomeRoutes imported at top

// ...

// API Routes

app.use('/api/auth', userAuthRoutes); // Email/Password (Legacy/Alternative)
app.use('/api/bots', botRoutes);
app.use('/api/welcome', welcomeRoutes);
// The following lines were incorrectly placed import statements in the original document.
// They are now correctly placed at the top of the file.
// import embedRoutes from './routes/embedRoutes.js';
app.use('/api/embeds', embedRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/sticky', stickyRoutes);

// Import admin routes
import adminRoutes from './routes/adminRoutes.js';
app.use('/api/admin', adminRoutes);

app.use('/', pagesRoutes);

// Page Routes
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'views/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(join(__dirname, 'views/login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(join(__dirname, 'views/register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(join(__dirname, 'views/dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(join(__dirname, 'views/admin.html'));
});

// Bots route removed - merged into dashboard

app.get('/bot/:id', (req, res) => {
    res.sendFile(join(__dirname, 'views/bot-dashboard.html'));
});

app.get('/bot/:id/guild/:guildId', (req, res) => {
    res.sendFile(join(__dirname, 'views/guild.html'));
});

app.get('/bot/:botId/guild/:guildId/welcome', (req, res) => {
    res.sendFile(join(__dirname, 'views', 'welcome.html'));
});

app.get('/bot/:botId/guild/:guildId/invites', (req, res) => {
    res.sendFile(join(__dirname, 'views', 'invites.html'));
});

app.get('/bot/:botId/guild/:guildId/sticky', (req, res) => {
    res.sendFile(join(__dirname, 'views', 'sticky.html'));
});

app.get('/bot/:id/guild/:guildId/embeds', (req, res) => {
    res.sendFile(join(__dirname, 'views/embeds.html'));
});

app.get('/bot/:id/guild/:guildId/embeds/:embedId', (req, res) => {
    res.sendFile(join(__dirname, 'views/embed-editor.html'));
});

app.get('/bot/:id/guild/:guildId/panel/new', (req, res) => {
    res.sendFile(join(__dirname, 'views/panel-editor.html'));
});

app.get('/bot/:id/guild/:guildId/panel/:panelId', (req, res) => {
    res.sendFile(join(__dirname, 'views/panel-editor.html'));
});

// Ticket Detail View (Serve static shell, auth handled client-side)
app.get('/server/:id/ticket/:ticketId', (req, res) => {
    res.sendFile(join(__dirname, 'views/ticket-detail.html'));
});

// Documentation
app.get('/docs', (req, res) => {
    res.sendFile(join(__dirname, 'views/docs.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, async () => {
    console.log(`🌐 Dashboard running at http://localhost:${PORT}`);

    // Restore active bots
    await botManager.restoreBots();

    // Initialize backup scheduler
    const { initBackupScheduler } = await import('./utils/backupManager.js');
    initBackupScheduler();
});

export default app;
