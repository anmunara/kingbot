import Database from 'better-sqlite3';
const db = new Database('web/data/database.sqlite');

try {
    console.log('Running migration: add_bot_status_fields...');

    // Add activity_type
    try {
        db.prepare("ALTER TABLE bots ADD COLUMN activity_type TEXT DEFAULT 'Playing'").run();
        console.log('✓ Added activity_type column');
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error('Error adding activity_type:', e.message);
    }

    // Add activity_name
    try {
        db.prepare("ALTER TABLE bots ADD COLUMN activity_name TEXT DEFAULT 'KingBot'").run();
        console.log('✓ Added activity_name column');
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error('Error adding activity_name:', e.message);
    }

    // Add status (online, idle, dnd, invisible)
    try {
        db.prepare("ALTER TABLE bots ADD COLUMN status_presence TEXT DEFAULT 'online'").run();
        console.log('✓ Added status_presence column');
    } catch (e) {
        if (!e.message.includes('duplicate column')) console.error('Error adding status_presence:', e.message);
    }

    console.log('Migration completed successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
