// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Falta token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = payload; // { id, rol, sucursal_id, usuario }
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (req.user.rol !== role) return res.status(403).json({ ok: false, error: 'No autorizado' });
    next();
  };
}

module.exports = { auth, requireRole };
