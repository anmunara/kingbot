/**
 * Rate Limiting Middleware
 * Separated to avoid circular dependencies
 */

import rateLimit from 'express-rate-limit';

// Rate Limiting - Strict for Auth routes (login/register)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login/register attempts per 15 min
    message: { error: 'Too many login attempts, please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate Limiting - API routes
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 API requests per 15 min
    message: { error: 'API rate limit exceeded, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate Limiting - Global
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per 15 min per IP
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
