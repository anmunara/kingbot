import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'web', 'data', 'database.sqlite');

const db = new Database(dbPath);

try {
    console.log('Checking guilds table for timezone column...');
    const tableInfo = db.pragma('table_info(guilds)');
    const hasTimezone = tableInfo.some(col => col.name === 'timezone');

    if (!hasTimezone) {
        console.log('Adding timezone column to guilds table...');
        db.exec("ALTER TABLE guilds ADD COLUMN timezone TEXT DEFAULT 'UTC'");
        console.log('✅ Timezone column added successfully.');
    } else {
        console.log('ℹ️ Timezone column already exists.');
    }
} catch (error) {
    console.error('❌ Error updating database:', error);
}
console.log('Done.');
