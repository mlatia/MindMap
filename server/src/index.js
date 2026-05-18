/**
 * index.js - Express Server Entry Point untuk Mind Map Otomatis.
 *
 * Environment Variables:
 *   PORT - port server (default: 3000)
 *
 * Catatan PENTING: `import 'dotenv/config'` HARUS jadi import pertama,
 * sebelum './app.js'. Karena ESM meng-hoist semua import, jika dipakai
 * `dotenv.config()` sebagai statement, db.config.js sudah meng-instantiate
 * Pool dengan env undefined => error "client password must be a string".
 */
import 'dotenv/config';
import http from 'http';
import app from './app.js';

const PORT = process.env.PORT || 3000;
app.set('port', PORT);

const server = http.createServer(app);
server.listen(PORT);
server.on('error', onError);
server.on('listening', onListening);

function onError(error) {
  if (error.syscall !== 'listen') throw error;
  switch (error.code) {
    case 'EACCES':
      console.error(`Port ${PORT} requires elevated privileges`); process.exit(1); break;
    case 'EADDRINUSE':
      console.error(`Port ${PORT} is already in use`); process.exit(1); break;
    default: throw error;
  }
}

function onListening() {
  console.log(`Server listening on port ${PORT}`);
  console.log(`  -> http://localhost:${PORT}`);
  console.log(`  -> LLM provider: ${process.env.LLM_PROVIDER || 'mock'}`);
  console.log(`  -> Database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || '(undefined!)'}`);
  if (!process.env.DB_PASSWORD) {
    console.warn('  ! WARNING: DB_PASSWORD tidak ter-load. Cek file server/.env ada di folder ini.');
  }
}
