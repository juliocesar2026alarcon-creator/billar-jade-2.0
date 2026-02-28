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
// ===== MANTENIMIENTO TEMPORAL: seed de mesas (BORRAR luego) =====
const { Pool } = require('pg');
const seedPool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/__maintenance__/seed_mesas', async (req, res) => {
  if ((req.query.pin || '') !== '9999') return res.status(403).send('Forbidden');
  try {
    // Traer sucursales
    const suc = await seedPool.query('select id, nombre from sucursales order by id');
    const detalle = [];
    for (const s of suc.rows) {
      // ¿cuántas mesas tiene ya?
      const c = await seedPool.query('select count(*)::int c from mesas where sucursal_id=$1', [s.id]);
      if (c.rows[0].c === 0) {
        // crear 10 mesas M01..M10 (estado por defecto 'libre' si tu tabla lo define)
        const values = [];
        for (let i = 1; i <= 10; i++) {
          const code = 'M' + String(i).padStart(2, '0');
          values.push(`(${s.id}, '${code}')`);
        }
        await seedPool.query(`insert into mesas (sucursal_id, codigo) values ${values.join(',')}`);
        detalle.push({ sucursal_id: s.id, created: 10 });
      } else {
        detalle.push({ sucursal_id: s.id, created: 0, existing: c.rows[0].c });
      }
    }
    res.json({ ok: true, detalle });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});
// ===== FIN MANTENIMIENTO TEMPORAL =====
// Frontend estático
app.use('/', express.static(path.join(__dirname, 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Billar Jade 2.0 escuchando en puerto', PORT));
// ===== Fin BOOT =====
