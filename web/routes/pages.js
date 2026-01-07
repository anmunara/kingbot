import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Helper to serve HTML with user data
function serveHTML(file, req, res) {
    const filePath = join(__dirname, '../views', file);
    let html = readFileSync(filePath, 'utf-8');

    // Inject user data
    const userData = req.session.user ? JSON.stringify({
        id: req.session.user.id,
        username: req.session.user.username,
        avatar: req.session.user.avatar,
    }) : 'null';

    html = html.replace('{{USER_DATA}}', userData);

    res.send(html);
}

// Landing page
router.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    serveHTML('index.html', req, res);
});

// Dashboard (server selection) - Handled by server.js (static serve)
// router.get('/dashboard', (req, res) => { ... });

// Server management page
router.get('/server/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    serveHTML('server.html', req, res);
});

// Panels page
router.get('/server/:id/panels', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    serveHTML('panels.html', req, res);
});

// Ticket Detail page (New) - REMOVED: Handled in server.js for static serve
// router.get('/server/:id/ticket/:ticketId', ...);

// Tickets page
router.get('/server/:id/tickets', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    serveHTML('tickets.html', req, res);
});

// Settings page
router.get('/server/:id/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    serveHTML('settings.html', req, res);
});

// Status Page
router.get('/status', (req, res) => {
    serveHTML('status.html', req, res);
});

// Documentation Page
router.get(['/docs', '/documentation'], (req, res) => {
    serveHTML('docs.html', req, res);
});

export default router;
