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
// ===== Seed temporal de insumos (BORRAR LUEGO) =====
const { Pool } = require('pg');
const seedPool2 = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/__maintenance__/seed_insumos_v2', async (req, res) => {
  try {
    if (String(req.query.pin || '') !== '9999') return res.status(403).send('Forbidden');

    const items = [
      { codigo:'CDL1', nombre:'Cerveza Dorada Litro', precio:12.00, costo:8.00, stock:20, stock_min:5, favorito:false },
      { codigo:'CP620', nombre:'Cerveza Paceña 620', precio:11.00, costo:7.00, stock:24, stock_min:6, favorito:false },
      { codigo:'CR710', nombre:'Corona 710 ml', precio:16.00, costo:11.00, stock:12, stock_min:4, favorito:true },
      { codigo:'CC600', nombre:'Coca-Cola 600 ml', precio:6.00, costo:4.00, stock:30, stock_min:10, favorito:true },
      { codigo:'PS600', nombre:'Pepsi 600 ml', precio:6.00, costo:4.00, stock:30, stock_min:10, favorito:false },
      { codigo:'NECTMAN', nombre:'CC Néctar Mango', precio:5.00, costo:3.00, stock:20, stock_min:5, favorito:false },
      { codigo:'NECTDUR', nombre:'CC Néctar Durazno', precio:5.00, costo:3.00, stock:20, stock_min:5, favorito:false },
      { codigo:'CUSQ330', nombre:'Cusqueña 330 ml', precio:12.00, costo:8.00, stock:12, stock_min:3, favorito:false },
      { codigo:'SV1', nombre:'Siete Vidas', precio:10.00, costo:6.00, stock:18, stock_min:4, favorito:false },
      { codigo:'SPO', nombre:'Sabor Popular', precio:6.00, costo:4.00, stock:30, stock_min:10, favorito:false }
    ];

    let insertados = 0;
    for (const p of items) {
      const r = await seedPool2.query(
        `INSERT INTO productos (codigo, nombre, precio, costo, stock, stock_min, favorito, activo)
         SELECT $1,$2,$3,$4,$5,$6,$7,true
         WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo=$1)`,
        [p.codigo, p.nombre, p.precio, p.costo, p.stock, p.stock_min, p.favorito]
      );
      insertados += r.rowCount;
    }

    const tot = await seedPool2.query(`SELECT COUNT(*)::int AS c FROM productos`);
    res.json({ ok:true, insertados, total_productos: tot.rows[0].c });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});
// =====================================================
// Frontend estático
app.use('/', express.static(path.join(__dirname, 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Billar Jade 2.0 escuchando en puerto', PORT));
// ===== Fin BOOT =====
