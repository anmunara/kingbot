/**
 * Migration Script: Add admin fields to existing users table
 * Run this if you have an existing database before the admin update
 * 
 * Usage: node add_admin_fields.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'web', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('🔧 Running Admin Fields Migration...\n');

// Add new columns to users table
const columns = [
    { name: 'is_admin', sql: 'ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0' },
    { name: 'is_approved', sql: 'ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 1' },
    { name: 'is_banned', sql: 'ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0' },
    { name: 'max_bots', sql: 'ALTER TABLE users ADD COLUMN max_bots INTEGER DEFAULT 2' },
    { name: 'invited_by', sql: 'ALTER TABLE users ADD COLUMN invited_by INTEGER' },
    { name: 'invite_code_used', sql: 'ALTER TABLE users ADD COLUMN invite_code_used TEXT' }
];

for (const col of columns) {
    try {
        db.prepare(col.sql).run();
        console.log(`✅ Added column: ${col.name}`);
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log(`⏭️  Column exists: ${col.name}`);
        } else {
            console.log(`❌ Error adding ${col.name}:`, e.message);
        }
    }
}

// Create invite_codes table
try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        created_by INTEGER NOT NULL,
        used_by INTEGER,
        max_uses INTEGER DEFAULT 1,
        uses_count INTEGER DEFAULT 0,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (used_by) REFERENCES users(id)
      )
    `);
    console.log('✅ Created invite_codes table');
} catch (e) {
    console.log('⏭️  invite_codes table exists or error:', e.message);
}

// Make first user admin if exists
const firstUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (firstUser) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(firstUser.id);
    console.log(`\n👑 Made user ID ${firstUser.id} an admin`);
}

console.log('\n✅ Migration complete!\n');
console.log('📝 Note: First registered user is now admin.');
console.log('📝 Admin panel is available at: /admin');

db.close();
