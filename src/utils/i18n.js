import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as db from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load language files
const languages = {};
const supportedLanguages = ['en', 'id'];

for (const lang of supportedLanguages) {
    const filePath = join(__dirname, `../locales/${lang}.json`);
    try {
        languages[lang] = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (error) {
        console.error(`Failed to load language file: ${lang}`, error);
    }
}

/**
 * Get translated string for a guild
 * @param {string} guildId - Guild ID
 * @param {string} key - Translation key (e.g., 'ticket.created')
 * @param {object} params - Parameters to replace in the string
 * @returns {string} Translated string
 */
export function t(guildId, key, params = {}) {
    // Get guild language
    let lang = 'en';
    try {
        const guild = db.getGuild.get(guildId);
        lang = guild?.language || 'en';
    } catch (e) { }

    // Fallback to English if language not found
    if (!languages[lang]) {
        lang = 'en';
    }

    // Get translation
    const keys = key.split('.');
    let translation = languages[lang];

    for (const k of keys) {
        translation = translation?.[k];
        if (!translation) break;
    }

    // Fallback to English if key not found
    if (!translation && lang !== 'en') {
        translation = languages['en'];
        for (const k of keys) {
            translation = translation?.[k];
            if (!translation) break;
        }
    }

    // Return key if translation not found
    if (!translation) {
        return key;
    }

    // Replace parameters
    let result = translation;
    for (const [param, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
    }

    return result;
}

/**
 * Get available languages
 * @returns {string[]} Array of language codes
 */
export function getLanguages() {
    return supportedLanguages;
}

/**
 * Get language display name
 * @param {string} code - Language code
 * @returns {string} Language display name
 */
export function getLanguageName(code) {
    const names = {
        en: 'English',
        id: 'Bahasa Indonesia',
    };
    return names[code] || code;
}
