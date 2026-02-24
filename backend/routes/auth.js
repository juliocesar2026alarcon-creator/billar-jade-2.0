
const express = require('express');
const router = express.Router();
const { pool } = require('../utils/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

router.post('/login', async (req,res)=>{
  try{
    const { usuario, password } = req.body;
    const r = await pool.query('select id, usuario, pass_hash, rol, sucursal_id from usuarios where usuario=$1 and activo=true', [usuario]);
    if(r.rowCount===0) return res.status(400).json({ ok:false, error:'Usuario o contraseña inválidos' });
    const u = r.rows[0];
    const ok = await bcrypt.compare(password, u.pass_hash);
    if(!ok) return res.status(400).json({ ok:false, error:'Usuario o contraseña inválidos' });
    const token = jwt.sign({ id:u.id, rol:u.rol, sucursal_id:u.sucursal_id||null, usuario:u.usuario }, process.env.JWT_SECRET||'secret', { expiresIn:'12h' });
    res.json({ ok:true, token, user:{ id:u.id, usuario:u.usuario, rol:u.rol, sucursal_id:u.sucursal_id } });
  }catch(e){ console.error(e); res.status(500).json({ ok:false, error:'No se pudo iniciar sesión' }); }
});

router.get('/me', async (req,res)=>{
  res.status(501).json({ ok:false, error:'Use /api/auth/login y guarde el token' });
});

module.exports = router;
