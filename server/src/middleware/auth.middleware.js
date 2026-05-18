/**
 * auth.middleware.js - JWT verification middleware (MBE-02)
 *
 * Memvalidasi header Authorization: Bearer <token>, mengisi req.user
 * dengan { id }. Mengirim 401 jika token hilang/invalid.
 */

import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Express middleware: verifikasi JWT.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { id: payload.id };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid' });
  }
}

export default requireAuth;
