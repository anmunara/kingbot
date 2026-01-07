/**
 * Crypto Utilities for Bot Token Encryption
 * Uses AES-256-GCM for secure encryption
 */

import crypto from 'crypto';

// Encryption key from environment or generate a default (should be set in .env for production)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'kingbot-encryption-key-change-me!'; // Must be 32 bytes for AES-256

// Ensure key is exactly 32 bytes
function getKey() {
    return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
}

/**
 * Encrypt a string using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string in format: iv:authTag:encryptedData (all hex)
 */
export function encrypt(text) {
    if (!text) return text;

    const iv = crypto.randomBytes(16);
    const key = getKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with AES-256-GCM
 * @param {string} encryptedText - Encrypted string in format: iv:authTag:encryptedData
 * @returns {string} - Decrypted plain text
 */
export function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;

    // Check if it's in encrypted format (contains colons)
    if (!encryptedText.includes(':')) {
        // Not encrypted (legacy plain text token), return as-is
        return encryptedText;
    }

    try {
        const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = getKey();

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption failed:', error.message);
        // Return original if decryption fails (might be legacy unencrypted token)
        return encryptedText;
    }
}

/**
 * Check if a token is already encrypted
 * @param {string} token - Token to check
 * @returns {boolean} - True if encrypted
 */
export function isEncrypted(token) {
    if (!token) return false;
    const parts = token.split(':');
    // Encrypted format has 3 parts: iv (32 hex chars), authTag (32 hex chars), data
    return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}
