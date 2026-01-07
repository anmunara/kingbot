
import * as db from './database.js';

console.log('Keys in db module:', Object.keys(db));
console.log('Type of createUser:', typeof db.createUser);

if (db.createUser) {
    console.log('createUser is defined');
} else {
    console.error('createUser is UNDEFINED');
}
