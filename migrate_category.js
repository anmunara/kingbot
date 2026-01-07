const db = require('better-sqlite3')('web/data/database.sqlite');

try {
    console.log('Adding ticket_category_id column to panel_options...');
    db.prepare("ALTER TABLE panel_options ADD COLUMN ticket_category_id TEXT").run();
    console.log('✅ Migration successful');
} catch (e) {
    if (e.message.includes('duplicate column')) {
        console.log('ℹ️ Column ticket_category_id already exists');
    } else {
        console.error('❌ Migration failed:', e);
    }
}
