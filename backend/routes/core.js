
const express = require('express');
const router = express.Router();
const { pool } = require('../utils/db');
const { auth } = require('../middleware/auth');
const moment = require('moment-timezone');
const { diffMinutos, minutosCobrables, montoTiempo, formatLocal } = require('../utils/tiempo');
const { buildTicket } = require('../utils/ticket');

router.use(auth);

// Sucursales
router.get('/sucursales', async (req,res)=>{
  const r = await pool.query('select id, nombre, activo from sucursales where activo=true order by id');
  res.json({ ok:true, data:r.rows });
});

// Mesas por sucursal, con estimado si ocupada
router.get('/mesas', async (req,res)=>{
  const sucursal_id = Number(req.query.sucursal_id)||null;
  const q = `select m.*, s.id as sesion_id, s.inicio_ts from mesas m left join sesiones s on s.mesa_id=m.id and s.cierre_ts is null where m.activo=true ${sucursal_id? 'and m.sucursal_id=$1':''} order by m.codigo`;
  const r = await pool.query(q, sucursal_id? [sucursal_id]:[]);
  const out = [];
  for(const row of r.rows){
    const mesa={ id:row.id, sucursal_id:row.sucursal_id, codigo:row.codigo, estado: row.sesion_id? 'ocupada':'libre', sesion_id: row.sesion_id||null };
    if(mesa.estado==='ocupada'){
      const mins = diffMinutos(row.inicio_ts, moment().toISOString());
      const t = await pool.query('select monto_hora, fraccion_min, minimo_min from tarifas where sucursal_id=$1 order by vigente_desde desc limit 1',[mesa.sucursal_id]);
      const tarifa = t.rows[0];
      const minCob = minutosCobrables(mins, tarifa.fraccion_min, tarifa.minimo_min);
      const montoEst = montoTiempo(minCob, tarifa.monto_hora);
      mesa.inicio_local = formatLocal(row.inicio_ts);
      mesa.minutos = mins; mesa.minutos_cobrables = minCob; mesa.monto_estimado_bs = montoEst;
    }
    out.push(mesa);
  }
  res.json({ ok:true, data: out });
});

// Iniciar sesión/mesa
router.post('/sesiones/iniciar', async (req,res)=>{
  const { mesa_id, nota } = req.body;
  const rM = await pool.query('select id, sucursal_id from mesas where id=$1 and activo=true',[mesa_id]);
  if(rM.rowCount===0) return res.status(404).json({ ok:false, error:'Mesa no encontrada' });
  const rOpen = await pool.query('select 1 from sesiones where mesa_id=$1 and cierre_ts is null',[mesa_id]);
  if(rOpen.rowCount>0) return res.status(400).json({ ok:false, error:'Mesa ya ocupada' });
  const inicio_ts = moment().toISOString();
  const r = await pool.query('insert into sesiones(mesa_id, inicio_ts, nota, usuario_id) values($1,$2,$3,$4) returning id',[mesa_id, inicio_ts, nota||null, req.user.id]);
  res.json({ ok:true, data:{ sesion_id:r.rows[0].id, mesa_id, hora_inicio_iso: inicio_ts, hora_inicio_local: formatLocal(inicio_ts) } });
});

// Productos
router.get('/productos', async (req,res)=>{
  const fav = req.query.favoritos==='true';
  const r = await pool.query('select id, codigo, nombre, precio, costo, stock, stock_min, favorito from productos where activo=true');
  let data = r.rows; if(fav) data = data.filter(p=>p.favorito);
  res.json({ ok:true, data });
});

// Agregar consumo
router.post('/sesiones/:id/consumos', async (req,res)=>{
  const sesion_id = Number(req.params.id);
  const { producto_id, cantidad } = req.body;
  const rS = await pool.query('select id from sesiones where id=$1 and cierre_ts is null',[sesion_id]);
  if(rS.rowCount===0) return res.status(404).json({ ok:false, error:'Sesión no encontrada o ya cerrada' });
  const rP = await pool.query('select id, precio, stock from productos where id=$1 and activo=true',[producto_id]);
  if(rP.rowCount===0) return res.status(404).json({ ok:false, error:'Producto no existe' });
  const qty = Number(cantidad)||1; if(rP.rows[0].stock < qty) return res.status(400).json({ ok:false, error:'Stock insuficiente' });
  await pool.query('update productos set stock = stock - $1 where id=$2',[qty, producto_id]);
  const r = await pool.query('insert into consumos(sesion_id, producto_id, cantidad, precio_unit) values($1,$2,$3,$4) returning id',[sesion_id, producto_id, qty, rP.rows[0].precio]);
  res.json({ ok:true, data:{ id:r.rows[0].id, sesion_id, producto_id, cantidad:qty } });
});

// Cerrar mesa (con descuento)
router.post('/sesiones/:id/cerrar', async (req,res)=>{
  const sesion_id = Number(req.params.id);
  const { metodo_pago='Efectivo', descuento_pct=0 } = req.body||{};
  const rS = await pool.query('select s.*, m.sucursal_id, m.codigo as mesa_codigo from sesiones s join mesas m on m.id=s.mesa_id where s.id=$1',[sesion_id]);
  if(rS.rowCount===0) return res.status(404).json({ ok:false, error:'Sesión no encontrada' });
  const s = rS.rows[0];
  if(s.cierre_ts) return res.status(400).json({ ok:false, error:'Sesión ya cerrada' });

  // Regla de tope de descuento para Cajero
  let desc = Number(descuento_pct)||0;
  if(req.user.rol==='CAJERO' && desc>10) desc = 10;

  const fin_ts = moment().toISOString();
  const rT = await pool.query('select monto_hora, fraccion_min, minimo_min from tarifas where sucursal_id=$1 order by vigente_desde desc limit 1',[s.sucursal_id]);
  const t = rT.rows[0];
  const mins = diffMinutos(s.inicio_ts, fin_ts);
  const minCob = minutosCobrables(mins, t.fraccion_min, t.minimo_min);
  const monto_tiempo_bs = montoTiempo(minCob, t.monto_hora);

  const rC = await pool.query(`select c.cantidad, c.precio_unit, p.codigo, p.nombre from consumos c join productos p on p.id=c.producto_id where c.sesion_id=$1`,[sesion_id]);
  const detalle = rC.rows.map(x=>({ cantidad:x.cantidad, precio_unit_bs:Number(x.precio_unit), codigo:x.codigo, nombre:x.nombre, total_bs:Number((x.cantidad*x.precio_unit).toFixed(2)) }));
  const subtotal_consumos_bs = detalle.reduce((a,b)=>a+b.total_bs,0);

  let total = Number((monto_tiempo_bs + subtotal_consumos_bs).toFixed(2));
  const descuento_bs = Number((total * (desc/100)).toFixed(2));
  total = Number((total - descuento_bs).toFixed(2));

  await pool.query('update sesiones set cierre_ts=$2, minutos_reales=$3, minutos_cobrables=$4, monto_tiempo_bs=$5 where id=$1',[sesion_id, fin_ts, mins, minCob, monto_tiempo_bs]);
  await pool.query('insert into cobros(sesion_id,total,metodo_pago,usuario_id,ts,descuento_pct,descuento_bs) values($1,$2,$3,$4,$5,$6,$7)',[sesion_id,total,metodo_pago,req.user.id,fin_ts,desc,descuento_bs]);

  const payload = {
    ok:true,
    sesion_id,
    mesa_id: s.mesa_id,
    mesa_codigo: s.mesa_codigo,
    sucursal_nombre: (await pool.query('select nombre from sucursales where id=$1',[s.sucursal_id])).rows[0].nombre,
    hora_inicio_iso: s.inicio_ts,
    hora_inicio_local: formatLocal(s.inicio_ts),
    hora_fin_iso: fin_ts,
    hora_fin_local: formatLocal(fin_ts),
    minutos_reales: mins,
    minutos_cobrables: minCob,
    tarifa_hora_bs: Number(t.monto_hora),
    fraccion_min: t.fraccion_min,
    minimo_min: t.minimo_min,
    monto_tiempo_bs,
    consumos: detalle,
    subtotal_consumos_bs: Number(subtotal_consumos_bs.toFixed(2)),
    descuento_pct: desc,
    descuento_bs,
    total_bs: total,
    metodo_pago
  };
  payload.ticket_text = buildTicket(payload);
  res.json(payload);
});

// Ticket de una sesión
router.get('/tickets/sesion/:id', async (req,res)=>{
  const id = Number(req.params.id);
  const s = await pool.query('select s.*, m.codigo as mesa_codigo, m.sucursal_id from sesiones s join mesas m on m.id=s.mesa_id where s.id=$1',[id]);
  if(s.rowCount===0) return res.status(404).json({ ok:false, error:'Sesión no encontrada' });
  const tarifa = (await pool.query('select monto_hora, fraccion_min, minimo_min from tarifas where sucursal_id=$1 order by vigente_desde desc limit 1',[s.rows[0].sucursal_id])).rows[0];
  const suc = (await pool.query('select nombre from sucursales where id=$1',[s.rows[0].sucursal_id])).rows[0];
  const cons = await pool.query('select c.cantidad, c.precio_unit, p.nombre, p.codigo from consumos c join productos p on p.id=c.producto_id where c.sesion_id=$1',[id]);
  const detalle = cons.rows.map(x=>({ cantidad:x.cantidad, precio_unit_bs:Number(x.precio_unit), codigo:x.codigo, nombre:x.nombre, total_bs:Number((x.cantidad*x.precio_unit).toFixed(2)) }));
  const subtotal = detalle.reduce((a,b)=>a+b.total_bs,0);
  const payload = {
    mesa_id: s.rows[0].mesa_id,
    mesa_codigo: s.rows[0].mesa_codigo,
    sucursal_nombre: suc.nombre,
    hora_inicio_local: formatLocal(s.rows[0].inicio_ts),
    hora_fin_local: s.rows[0].cierre_ts? formatLocal(s.rows[0].cierre_ts):'',
    minutos_reales: s.rows[0].minutos_reales||0,
    minutos_cobrables: s.rows[0].minutos_cobrables||0,
    tarifa_hora_bs: Number(tarifa.monto_hora),
    fraccion_min: tarifa.fraccion_min,
    minimo_min: tarifa.minimo_min,
    monto_tiempo_bs: Number(s.rows[0].monto_tiempo_bs||0),
    consumos: detalle,
    subtotal_consumos_bs: Number(subtotal.toFixed(2)),
    total_bs: Number((Number(s.rows[0].monto_tiempo_bs||0)+subtotal).toFixed(2))
  }
  payload.ticket_text = buildTicket(payload);
  res.json({ ok:true, ticket_text: payload.ticket_text, data: payload });
});

// Alertas de stock
router.get('/inventario/alertas', async (req,res)=>{
  const r = await pool.query('select codigo, nombre, stock, stock_min from productos where activo=true and stock <= stock_min order by nombre');
  res.json({ ok:true, data: r.rows });
});

module.exports = router;
