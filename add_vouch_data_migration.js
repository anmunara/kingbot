import Database from 'better-sqlite3';
const db = new Database('web/data/database.sqlite');

try {
    console.log('Running migration: add_vouch_data...');

    try {
        db.prepare("ALTER TABLE guilds ADD COLUMN vouch_data TEXT").run();
        console.log('✓ Added vouch_data column');
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error('Error adding vouch_data:', e.message);
        else console.log('Column vouch_data already exists.');
    }

    console.log('Migration completed successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
