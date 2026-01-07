import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to database.sqlite (relative to this script in web/)
const dbPath = join(__dirname, 'data', 'database.sqlite');

console.log(`Opening database at ${dbPath}...`);
const db = new Database(dbPath);

try {
    // Enable WAL to ensure we can write even if server is running
    db.pragma('journal_mode = WAL');

    console.log('Clearing all tables...');

    // Execute multiple statements to clear data
    db.exec(`
        DELETE FROM ticket_participants;
        DELETE FROM ticket_responses;
        DELETE FROM tickets;
        DELETE FROM panel_questions;
        DELETE FROM panel_options;
        DELETE FROM panels;
        DELETE FROM guilds;
        DELETE FROM custom_commands;
        DELETE FROM templates;
        DELETE FROM steam_links;
        DELETE FROM bots;
        DELETE FROM users;
        
        -- Reset auto-increment counters
        DELETE FROM sqlite_sequence;
    `);

    console.log('✅ Database successfully cleared!');
    console.log('You can now Register a fresh account.');

} catch (error) {
    console.error('❌ Failed to clear database:', error);
}
