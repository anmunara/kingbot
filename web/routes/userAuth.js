import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { getUserByEmail, getUserById, createUser, getInviteCode, useInviteCode, db } from '../database.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { AuditLog } from '../utils/auditLog.js';

const router = Router();

console.log('DEBUG: userAuth loaded');
console.log('DEBUG: createUser is', typeof createUser);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const JWT_EXPIRES = '7d';

// Check if invite codes are required (default: true if admin exists)
function isInviteRequired() {
    // Skip invite if no users exist (first user can register freely and becomes admin)
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) return false;

    // Otherwise require invite code
    return process.env.REQUIRE_INVITE_CODE !== 'false';
}

// Input validation rules
const registerValidation = [
    body('email')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
        .escape(),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number'),
    body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 32 }).withMessage('Username must be 3-32 characters')
        .escape(),
    body('inviteCode')
        .optional()
        .trim()
        .escape()
];

const loginValidation = [
    body('email')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
        .escape(),
    body('password')
        .notEmpty().withMessage('Password is required')
];

// Register - with rate limiting, validation, and invite code
router.post('/register', authLimiter, registerValidation, async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        const { email, password, username, inviteCode } = req.body;

        // Check if this is the first user (will be admin)
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const isFirstUser = userCount === 0;

        // Validate invite code (if required and not first user)
        let inviterId = null;
        if (!isFirstUser && isInviteRequired()) {
            if (!inviteCode) {
                return res.status(400).json({ error: 'Invite code is required' });
            }

            const invite = getInviteCode.get(inviteCode.toUpperCase());
            if (!invite) {
                return res.status(400).json({ error: 'Invalid invite code' });
            }

            // Check if code has uses left
            if (invite.max_uses > 0 && invite.uses_count >= invite.max_uses) {
                return res.status(400).json({ error: 'Invite code has been fully used' });
            }

            // Check if code is expired
            if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
                return res.status(400).json({ error: 'Invite code has expired' });
            }

            inviterId = invite.created_by;
        }

        // Check if email exists
        const existing = getUserByEmail.get(email);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);

        // Create user (with invite code info)
        const result = createUser.run(
            email,
            passwordHash,
            username || email.split('@')[0],
            inviteCode ? inviteCode.toUpperCase() : null,
            inviterId
        );
        const userId = result.lastInsertRowid;

        // If first user, make them admin
        if (isFirstUser) {
            db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
        }

        // Mark invite code as used
        if (inviteCode) {
            useInviteCode.run(inviteCode.toUpperCase());
        }

        // Generate JWT
        const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

        res.json({
            success: true,
            token,
            user: {
                id: userId,
                email,
                username: username || email.split('@')[0],
                is_admin: isFirstUser ? 1 : 0
            },
        });

        // Audit Log: New user registration
        const clientIp = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
        AuditLog.register(userId, username || email.split('@')[0], clientIp);

        // Set session for server-side routing
        req.session.user = {
            id: userId,
            username: username || email.split('@')[0],
            email,
            is_email_auth: true
        };
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login - with rate limiting and validation
router.post('/login', authLimiter, loginValidation, async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        const { email, password } = req.body;

        // Find user
        const user = getUserByEmail.get(email);
        const clientIp = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
        if (!user) {
            // Use generic message to prevent user enumeration
            AuditLog.loginFailed(email, clientIp, 'User not found');
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check if user is banned
        if (user.is_banned) {
            AuditLog.loginFailed(email, clientIp, 'Account suspended');
            return res.status(403).json({ error: 'Your account has been suspended' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            AuditLog.loginFailed(email, clientIp, 'Wrong password');
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                is_admin: user.is_admin || 0
            },
        });

        // Audit Log: Successful login
        AuditLog.login(user.id, user.username, clientIp);

        // Set session for server-side routing
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            is_email_auth: true
        };
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
    const user = getUserById.get(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
});

// Middleware to authenticate JWT
export function authenticateToken(req, res, next) {
    // 1. Check for JWT
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.userId = decoded.userId;
            return next();
        } catch (error) {
            // If token invalid, try session
        }
    }

    // 2. Check for Session (Discord Auth)
    if (req.session && req.session.user) {
        req.userId = req.session.user.id;
        return next();
    }

    return res.status(401).json({ error: 'Access token required' });
}

export default router;
