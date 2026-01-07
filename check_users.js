// Check users in database
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'web', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('\n📊 Users in Database:\n');
const users = db.prepare('SELECT id, email, username, is_admin FROM users').all();
console.table(users);

db.close();
