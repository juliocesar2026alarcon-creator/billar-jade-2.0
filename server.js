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
// ===== Seed FINAL de productos (BORRAR luego) =====
app.get('/__seed__/productos_final', async (req, res) => {
  try {
    if ((req.query.pin || '') !== '9999')
      return res.status(403).json({ ok:false, error:'PIN incorrecto' });

    const items = [
      ['TIZA', 'Tiza Blanca', 2.00, 1.00, 30, 10, true],
      ['AGUA500', 'Agua 500ml', 5.00, 3.00, 24, 6, true],
      ['GAS350', 'Gaseosa 350ml', 7.00, 4.00, 24, 6, true],
      ['SNACK1', 'Snack', 6.00, 3.50, 20, 5, false],
      ['CERVL1', 'Cerveza Litro', 12.00, 8.00, 20, 5, false],
      ['PACE620', 'Paceña 620ml', 11.00, 7.00, 24, 6, false],
      ['COR710', 'Corona 710ml', 16.00, 11.00, 12, 4, true],
      ['COCA600', 'Coca-Cola 600', 6.00, 4.00, 30, 10, true],
      ['PEPS600', 'Pepsi 600', 6.00, 4.00, 30, 10, false],
      ['NECMAN', 'Néctar Mango', 5.00, 3.00, 20, 5, false]
    ];

    let insertados = 0;

    for (const p of items) {
      const r = await pool.query(
        `INSERT INTO productos (codigo,nombre,precio,costo,stock,stock_min,favorito,activo)
         SELECT $1,$2,$3,$4,$5,$6,$7,true
         WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo=$1)`,
        p
      );
      insertados += r.rowCount;
    }

    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM productos`);
    res.json({ ok:true, insertados, total: total.rows[0].c });

  } catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});
// ===== FIN SEED =====
// Frontend estático
app.use('/', express.static(path.join(__dirname, 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Billar Jade 2.0 escuchando en puerto', PORT));
// ===== Fin BOOT =====
