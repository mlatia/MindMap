/**
 * db.config.js - LEGACY shim.
 *
 * Implementasi pool yang sesungguhnya sekarang ada di server/src/db.js
 * supaya ter-bundle Vercel saat Root Directory = server/.
 *
 * File ini cuma re-export untuk backward compatibility script lokal
 * yang masih import dari path ini. Untuk kode baru, langsung import
 * dari `../server/src/db.js`.
 */
export { default } from '../server/src/db.js';
