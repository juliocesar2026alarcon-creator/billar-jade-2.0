const express = require('express');
const router = express.Router();
const { pool } = require('../utils/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body || {};
    if (!usuario || !password) return res.status(400).json({ ok: false, error: 'Faltan credenciales' });

    const r = await pool.query(
      'select id, usuario, pass_hash, rol, sucursal_id, activo from usuarios where usuario=$1',
      [usuario]
    );
    if (r.rowCount === 0 || !r.rows[0].activo) return res.status(400).json({ ok: false, error: 'Usuario o contraseña inválidos' });

    const u = r.rows[0];
    const ok = await bcrypt.compare(password, u.pass_hash);
    if (!ok) return res.status(400).json({ ok: false, error: 'Usuario o contraseña inválidos' });

    const token = jwt.sign(
      { id: u.id, usuario: u.usuario, rol: u.rol, sucursal_id: u.sucursal_id || null },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '12h' }
    );

    res.json({ ok: true, token, user: { id: u.id, usuario: u.usuario, rol: u.rol, sucursal_id: u.sucursal_id } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'No se pudo iniciar sesión' });
  }
});

module.exports = router;
