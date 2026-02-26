const express = require('express');
const router = express.Router();
const { pool } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const moment = require('moment-timezone');

router.use(auth, requireRole('ADMIN'));

router.post('/sesiones/:id/reabrir', async (req, res) => {
  try {
    const sesion_id = Number(req.params.id);
    const { pin, motivo } = req.body || {};

    const rU = await pool.query('select pin_hash from usuarios where id=$1', [req.user.id]);
    const u = rU.rows[0];
    if (!u || !u.pin_hash) return res.status(400).json({ ok: false, error: 'PIN no configurado' });

    const ok = await bcrypt.compare(String(pin || ''), u.pin_hash);
    if (!ok) return res.status(403).json({ ok: false, error: 'PIN incorrecto' });

    const rS = await pool.query('select * from sesiones where id=$1', [sesion_id]);
    if (rS.rowCount === 0) return res.status(404).json({ ok: false, error: 'Sesión no existe' });
    if (!rS.rows[0].cierre_ts) return res.status(400).json({ ok: false, error: 'La sesión ya está abierta' });

    await pool.query('update sesiones set cierre_ts=null, minutos_reales=null, minutos_cobrables=null, monto_tiempo_bs=null where id=$1', [sesion_id]);
    await pool.query('insert into auditoria(usuario_id, tipo, detalle, ts) values($1,$2,$3,$4)', [req.user.id, 'REAPERTURA', { sesion_id, motivo }, new Date().toISOString()]);

    res.json({ ok: true, message: 'Sesión reabierta' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'No se pudo reabrir' });
  }
});

router.post('/inventario/movimientos', async (req, res) => {
  try {
    const { producto_id, tipo, cantidad } = req.body || {};
    const qty = Number(cantidad) || 0;
    const q = tipo === 'ENTRADA'
      ? 'update productos set stock = stock + $1 donde id=$2'.replace('donde','where')
      : 'update productos set stock = stock - $1 donde id=$2'.replace('donde','where');
    await pool.query(q, [qty, Number(producto_id)]);
    await pool.query('insert into auditoria(usuario_id, tipo, detalle, ts) values($1,$2,$3,$4)', [req.user.id, `INVENTARIO_${tipo}`, { producto_id, cantidad: qty }, new Date().toISOString()]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'No se pudo registrar movimiento' });
  }
});

router.get('/reportes/ventas', async (req, res) => {
  try {
    const { desde, hasta, sucursal_id } = req.query;
    let sql = `
      select c.id, c.total, c.metodo_pago, c.ts, u.usuario, s.mesa_id
      from cobros c
      join usuarios u on u.id=c.usuario_id
      join sesiones s on s.id=c.sesion_id
      where 1=1
    `;
    const params = [];
    if (desde) { params.push(desde); sql += ` and c.ts >= $${params.length}`; }
    if (hasta) { params.push(hasta); sql += ` and c.ts <= $${params.length}`; }
    if (sucursal_id) {
      params.push(Number(sucursal_id));
      sql += ` and exists (select 1 from sesiones sx join mesas mx on mx.id=sx.mesa_id where sx.id=c.sesion_id and mx.sucursal_id=$${params.length})`;
    }
    sql += ' order by c.ts desc limit 1000';
    const r = await pool.query(sql, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'No se pudieron obtener ventas' });
  }
});
// ====== ADMIN: CRUD de Productos ======
// Listar (incluye costo)
router.get('/productos', async (req, res) => {
  try {
    const r = await pool.query(`
      select id, codigo, nombre, precio, costo, stock, stock_min, favorito, activo
      from productos
      order by nombre
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'No se pudieron listar productos' });
  }
});

// Crear
router.post('/productos', async (req, res) => {
  try {
    const { codigo, nombre, precio, costo, stock, stock_min, favorito } = req.body || {};
    if (!codigo || !nombre) return res.status(400).json({ ok:false, error:'Código y nombre son requeridos' });
    const r = await pool.query(`
      insert into productos (codigo, nombre, precio, costo, stock, stock_min, favorito, activo)
      values ($1,$2,$3,$4,$5,$6,$7,true)
      returning id
    `, [codigo, nombre, Number(precio||0), Number(costo||0), Number(stock||0), Number(stock_min||0), favorito===true]);
    res.json({ ok:true, id: r.rows[0].id });
  } catch (e) {
    console.error(e);
    if (e.code === '23505') return res.status(400).json({ ok:false, error:'Código ya existe' });
    res.status(500).json({ ok:false, error:'No se pudo crear producto' });
  }
});

// Editar
router.put('/productos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { codigo, nombre, precio, costo, stock, stock_min, favorito, activo } = req.body || {};
    const r = await pool.query(`
      update productos set
        codigo = coalesce($2, codigo),
        nombre = coalesce($3, nombre),
        precio = coalesce($4, precio),
        costo = coalesce($5, costo),
        stock = coalesce($6, stock),
        stock_min = coalesce($7, stock_min),
        favorito = coalesce($8, favorito),
        activo = coalesce($9, activo)
      where id=$1
    `, [id,
      codigo ?? null, nombre ?? null,
      (precio!==undefined? Number(precio): null),
      (costo!==undefined? Number(costo): null),
      (stock!==undefined? Number(stock): null),
      (stock_min!==undefined? Number(stock_min): null),
      (favorito!==undefined? favorito: null),
      (activo!==undefined? activo: null)
    ]);
    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    if (e.code === '23505') return res.status(400).json({ ok:false, error:'Código duplicado' });
    res.status(500).json({ ok:false, error:'No se pudo editar producto' });
  }
});

// Eliminar
router.delete('/productos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Si prefieres "baja lógica": update productos set activo=false where id=$1
    await pool.query(`delete from productos where id=$1`, [id]);
    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    // Si hay FK (consumos), puedes decidir baja lógica:
    // if (e.code==='23503') { await pool.query(`update productos set activo=false where id=$1`, [id]); return res.json({ok:true}); }
    res.status(500).json({ ok:false, error:'No se pudo eliminar (tiene movimientos relacionados?)' });
  }
});
// ====== FIN CRUD ======
module.exports = router;
