// Admin rights for the hosted site, granted from the server and nowhere else:
//
//   docker exec visulaserz-web-1 node lib/admin-cli.js grant you@example.com
//   docker exec visulaserz-web-1 node lib/admin-cli.js revoke you@example.com
//   docker exec visulaserz-web-1 node lib/admin-cli.js list
//   docker exec visulaserz-web-1 node lib/admin-cli.js where          the desk's secret address
//   docker exec visulaserz-web-1 node lib/admin-cli.js new-address    a new one; the old one stops working
//
// The account must exist already: sign up on the site first. The site does not verify email
// addresses, so grant rights only to an account you know you made yourself.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createAdminStore } from './admin-store.js';

const [command, email] = process.argv.slice(2);
const dataRoot = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = path.join(dataRoot, 'accounts.sqlite');
const fail = message => { console.error(message); process.exit(1); };

if (!['grant', 'revoke', 'list', 'where', 'new-address'].includes(command) || (['grant', 'revoke'].includes(command) && !email)) fail('Usage: node lib/admin-cli.js grant|revoke <email>  or  list | where | new-address');
if (!fs.existsSync(file)) fail(`No account database at ${file}. Start the hosted server once first.`);
const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()) fail('The account database has no members yet. Start the hosted server once first.');
const store = createAdminStore(db);
try {
  if (command === 'grant') {
    const user = store.grant(email);
    console.log(`${user.email} (${user.name}, joined ${new Date(user.created_at).toISOString().slice(0, 10)}) can now open the desk: node lib/admin-cli.js where`);
  } else if (command === 'revoke') {
    console.log(store.revoke(email) ? `${email} is no longer an admin.` : `${email} was not an admin.`);
  } else if (command === 'where' || command === 'new-address') {
    if (command === 'new-address') store.newDeskKey('command line');
    const host = (process.env.PUBLIC_HOSTS || '').split(',')[0].trim();
    console.log(`${host ? `https://${host}` : ''}${store.deskPath()}`);
  } else {
    const admins = store.listAdmins();
    if (!admins.length) console.log('No admins yet.');
    for (const a of admins) console.log(`${a.email}  ${a.name}  since ${new Date(a.granted_at).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  }
} catch (error) { fail(error.message); }
finally { db.close(); }
