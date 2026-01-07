import Database from 'better-sqlite3';
const db = new Database('web/data/database.sqlite');

try {
    console.log('Running migration: add_vouch_channel_id...');

    try {
        db.prepare("ALTER TABLE guilds ADD COLUMN vouch_channel_id TEXT").run();
        console.log('✓ Added vouch_channel_id column');
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error('Error adding vouch_channel_id:', e.message);
        else console.log('Column vouch_channel_id already exists.');
    }

    console.log('Migration completed successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
