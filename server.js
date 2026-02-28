// ===== Inicio BOOT =====
console.log('BOOT: iniciando Billar Jade 2.0');

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const moment = require('moment-timezone');

// --- Detector de módulo problemático (imprime el módulo exacto que falla) ---
function req(name, p) {
  try {
    console.log('▶ Requiriendo:', name, p);
    return require(p);
  } catch (e) {
    console.error('❌ Falla al requerir:', name, p);
    console.error(e.stack || e);
    // cortar el proceso para que Render muestre claramente el stack
    process.exit(1);
  }
}

// Utils y middleware (con detección)
const { pool } = req('utils/db', './backend/utils/db');
req('utils/tiempo', './backend/utils/tiempo');
req('utils/ticket', './backend/utils/ticket');
const { auth, requireRole } = req('middleware/auth', './backend/middleware/auth');

// Rutas (con detección)
const authRoutes  = req('routes/auth',  './backend/routes/auth');
const coreRoutes  = req('routes/core',  './backend/routes/core');
const adminRoutes = req('routes/admin', './backend/routes/admin');

moment.tz.setDefault(process.env.TZ || 'America/La_Paz');

const app = express();
app.use(cors());
app.use(express.json());

// Salud rápida (para probar que el server llegó a levantar)
app.get('/api/health', async (req, res) => {
  try {
    const r = await pool.query('select now()');
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Montar rutas
app.use('/api/auth',  authRoutes);
app.use('/api',       coreRoutes);
app.use('/api/admin', adminRoutes);
// ===== MANTENIMIENTO TEMPORAL (borrar al final) =====
const { Pool } = require('pg');
const maintPool = new Pool({ connectionString: process.env.DATABASE_URL });

// 1) Ver mesas por sucursal (dump)
app.get('/__maintenance__/dump_mesas', async (req, res) => {
  if ((req.query.pin || '') !== '9999') return res.status(403).send('Forbidden');
  try {
    const sid = Number(req.query.sucursal_id) || null;
    const sql = sid
      ? 'select id, sucursal_id, codigo, coalesce(estado, \'(null)\') as estado, coalesce(activo, false) as activo from mesas where sucursal_id=$1 order by codigo'
      : 'select id, sucursal_id, codigo, coalesce(estado, \'(null)\') as estado, coalesce(activo, false) as activo from mesas order by sucursal_id, codigo';
    const r = await maintPool.query(sql, sid ? [sid] : []);
    res.json({ ok: true, count: r.rowCount, data: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// 2) Normalizar todas las mesas: estado/libre y activo/true
app.post('/__maintenance__/fix_mesas', async (req, res) => {
  if ((req.query.pin || '') !== '9999') return res.status(403).send('Forbidden');
  try {
    const a = await maintPool.query(`update mesas set estado='libre' where estado is null or trim(estado)=''`);
    const b = await maintPool.query(`update mesas set activo=true where activo is distinct from true`);
    res.json({ ok: true, set_estado:a.rowCount, set_activo:b.rowCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// 3) Asegurar N mesas en una sucursal (crea faltantes M01..MN)
app.post('/__maintenance__/ensure_mesas', async (req, res) => {
  if ((req.query.pin || '') !== '9999') return res.status(403).send('Forbidden');
  try {
    const sid = Number(req.query.sucursal_id);
    const n   = Number(req.query.n || 10);
    if (!sid) return res.status(400).json({ ok:false, error:'sucursal_id requerido' });

    const r0 = await maintPool.query(`select codigo from mesas where sucursal_id=$1`, [sid]);
    const have = new Set(r0.rows.map(r=>r.codigo));
    const toCreate = [];
    for (let i=1;i<=n;i++){
      const code = 'M' + String(i).padStart(2,'0');
      if (!have.has(code)) toCreate.push(code);
    }
    for (const code of toCreate){
      await maintPool.query(
        `insert into mesas (sucursal_id, codigo, estado, activo) values ($1, $2, 'libre', true)`,
        [sid, code]
      );
    }
    res.json({ ok:true, created: toCreate.length, codes: toCreate });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});
// ===== FIN MANTENIMIENTO TEMPORAL =====
// Frontend estático
app.use('/', express.static(path.join(__dirname, 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Billar Jade 2.0 escuchando en puerto', PORT));
// ===== Fin BOOT =====
