/**
 * XSS Sanitization Utilities
 * Prevents Cross-Site Scripting attacks by escaping HTML entities in user input
 */

/**
 * Escapes HTML entities to prevent XSS attacks
 * Use this when rendering user input as HTML content
 * @param {string} str - The string to sanitize
 * @returns {string} - Sanitized string safe for HTML rendering
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Sanitizes a string for safe use in HTML attributes
 * @param {string} str - The string to sanitize
 * @returns {string} - Sanitized string safe for attribute use
 */
export function escapeAttribute(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Sanitizes an object's string properties recursively
 * Useful for sanitizing entire objects before rendering
 * @param {Object} obj - The object to sanitize
 * @returns {Object} - New object with sanitized string values
 */
export function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return typeof obj === 'string' ? escapeHtml(obj) : obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
}

/**
 * Strips all HTML tags from a string
 * Use when you want plain text only
 * @param {string} str - The string to strip
 * @returns {string} - String with all HTML tags removed
 */
export function stripHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/<[^>]*>/g, '');
}

/**
 * Validates and sanitizes a URL
 * Prevents javascript: and data: URL attacks
 * @param {string} url - The URL to validate
 * @returns {string|null} - Safe URL or null if invalid
 */
export function sanitizeUrl(url) {
    if (typeof url !== 'string') return null;

    // Trim and lowercase for checking
    const trimmed = url.trim().toLowerCase();

    // Block dangerous protocols
    if (trimmed.startsWith('javascript:') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('vbscript:')) {
        return null;
    }

    // Allow http, https, and relative URLs
    if (trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('#')) {
        return url;
    }

    // For other cases, assume it needs https://
    return 'https://' + url;
}
