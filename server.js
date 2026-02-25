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
// ===== Mantenimiento V3: dedup + índice único (BORRAR LUEGO) =====
const { Pool } = require('pg');
const maintPool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/__maintenance__/dedupe_and_lock', async (req, res) => {
  const pin = String(req.query.pin || '');
  if (pin !== '9999') return res.status(403).send('Forbidden');

  const client = await maintPool.connect();
  try {
    await client.query('BEGIN');

    // 1) Detectar duplicados y decidir el keeper (menor id) por (sucursal_id, codigo)
    const dup = await client.query(`
      WITH grouped AS (
        SELECT sucursal_id, codigo, MIN(id) AS keeper
        FROM mesas
        GROUP BY sucursal_id, codigo
      )
      SELECT m.id AS duplicate_id, g.keeper AS keeper_id,
             m.sucursal_id, m.codigo
      FROM mesas m
      JOIN grouped g
        ON g.sucursal_id = m.sucursal_id
       AND g.codigo      = m.codigo
      WHERE m.id <> g.keeper
      ORDER BY m.sucursal_id, m.codigo, m.id
    `);

    // 2) Reasignar sesiones desde duplicadas -> keeper
    let sesionesReasig = 0;
    for (const r of dup.rows) {
      const upd = await client.query(
        `UPDATE sesiones
            SET mesa_id = $1
          WHERE mesa_id = $2`,
        [r.keeper_id, r.duplicate_id]
      );
      sesionesReasig += upd.rowCount;
    }

    // 3) Borrar duplicadas ya sin referencias
    const del = await client.query(`
      DELETE FROM mesas m
      USING (
        WITH grouped AS (
          SELECT sucursal_id, codigo, MIN(id) AS keeper
          FROM mesas
          GROUP BY sucursal_id, codigo
        )
        SELECT m.id
        FROM mesas m
        JOIN grouped g
          ON g.sucursal_id = m.sucursal_id
         AND g.codigo      = m.codigo
        WHERE m.id <> g.keeper
      ) d
      WHERE m.id = d.id
    `);

    // 4) Crear índice único para bloquear futuros duplicados
    // (si ya existe, no falla por IF NOT EXISTS)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname   = 'mesas_sucursal_codigo_uidx'
        ) THEN
          EXECUTE 'CREATE UNIQUE INDEX mesas_sucursal_codigo_uidx ON mesas(sucursal_id, codigo)';
        END IF;
      END
      $$;
    `);

    await client.query('COMMIT');

    const after = await maintPool.query(`
      SELECT sucursal_id, codigo
      FROM mesas
      ORDER BY sucursal_id, codigo
    `);

    res.json({
      ok: true,
      duplicados_detectados: dup.rowCount,
      sesiones_reasignadas: sesionesReasig,
      mesas_borradas: del.rowCount,
      total_mesas: after.rowCount,
      muestra: after.rows.slice(0, 30)
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  } finally {
    client.release();
  }
});
// ==============================================================
// Frontend estático
app.use('/', express.static(path.join(__dirname, 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Billar Jade 2.0 escuchando en puerto', PORT));
// ===== Fin BOOT =====
