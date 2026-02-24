
const express = require('express');
const router = express.Router();
const { pool } = require('../utils/db');
const { auth, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const moment = require('moment-timezone');

router.use(auth, requireRole('ADMIN'));

// Reapertura con PIN de supervisor (usuario admin actual)
router.post('/sesiones/:id/reabrir', async (req,res)=>{
  const sesion_id = Number(req.params.id);
  const { pin, motivo } = req.body||{};
  const rU = await pool.query('select pin_hash from usuarios where id=$1',[req.user.id]);
  const u = rU.rows[0];
  if(!u || !u.pin_hash) return res.status(400).json({ ok:false, error:'PIN no configurado para supervisor' });
  const ok = await bcrypt.compare(String(pin||''), u.pin_hash);
  if(!ok) return res.status(403).json({ ok:false, error:'PIN incorrecto' });

  const rS = await pool.query('select * from sesiones where id=$1',[sesion_id]);
  if(rS.rowCount===0) return res.status(404).json({ ok:false, error:'Sesión no existe' });
  if(!rS.rows[0].cierre_ts) return res.status(400).json({ ok:false, error:'La sesión ya está abierta' });

  await pool.query('update sesiones set cierre_ts=null, minutos_reales=null, minutos_cobrables=null, monto_tiempo_bs=null where id=$1',[sesion_id]);
  await pool.query('insert into auditoria(usuario_id, tipo, detalle, ts) values($1,$2,$3,$4)',[req.user.id,'REAPERTURA',{ sesion_id, motivo }, new Date().toISOString()]);

  res.json({ ok:true, message:'Sesión reabierta' });
});

// Entradas/mermas inventario
router.post('/inventario/movimientos', async (req,res)=>{
  const { producto_id, tipo, cantidad } = req.body||{}; // tipo: ENTRADA|MERMA
  const q = tipo==='ENTRADA' ? 'update productos set stock = stock + $1 where id=$2' : 'update productos set stock = stock - $1 where id=$2';
  await pool.query(q, [Number(cantidad)||0, Number(producto_id)]);
  await pool.query('insert into auditoria(usuario_id, tipo, detalle, ts) values($1,$2,$3,$4)',[req.user.id,`INVENTARIO_${tipo}`,{ producto_id, cantidad }, new Date().toISOString()]);
  res.json({ ok:true });
});

// Reporte ventas simples
router.get('/reportes/ventas', async (req,res)=>{
  const { desde, hasta, sucursal_id } = req.query;
  let sql = `select c.id, c.total, c.metodo_pago, c.ts, u.usuario, s.mesa_id from cobros c join usuarios u on u.id=c.usuario_id join sesiones s on s.id=c.sesion_id where 1=1`;
  const params=[];
  if(desde){ params.push(desde); sql += ` and c.ts >= $${params.length}`; }
  if(hasta){ params.push(hasta); sql += ` and c.ts <= $${params.length}`; }
  if(sucursal_id){ params.push(Number(sucursal_id)); sql += ` and exists (select 1 from sesiones sx join mesas mx on mx.id=sx.mesa_id where sx.id=c.sesion_id and mx.sucursal_id=$${params.length})`; }
  sql += ' order by c.ts desc limit 1000';
  const r = await pool.query(sql, params);
  res.json({ ok:true, data:r.rows });
});

module.exports = router;
