// Starts the built server for a manual end-to-end check, on its own port and with its own
// storage directory so it never touches ~/.smith. Usage: npm run build && node scripts/smoke-server.cjs
const os = require('node:os');
const path = require('node:path');

process.env.PORT = process.env.PORT || '4199';
process.env.SMITH_STORAGE_DIR = process.env.SMITH_STORAGE_DIR || path.join(os.tmpdir(), 'smith-smoke-store');
console.log(`[smoke] storage: ${process.env.SMITH_STORAGE_DIR}`);

require(path.join(__dirname, '..', 'dist-server', 'index.cjs'));
