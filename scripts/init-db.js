
require('dotenv').config();
const { pool } = require('../backend/utils/db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

(async ()=>{
  try{
    const schema = fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf-8');
    await pool.query(schema);

    // Sucursales
    await pool.query(`insert into sucursales(nombre) values('BILLAR JADE') on conflict do nothing`);
    await pool.query(`insert into sucursales(nombre) values('BILLAR JADE ANEXO') on conflict do nothing`);

    const sucursales = (await pool.query('select * from sucursales order by id')).rows;

    // Mesas: 10 por sucursal
    for(const s of sucursales){
      for(let i=1;i<=10;i++){
        const codigo = 'M'+String(i).padStart(2,'0');
        await pool.query('insert into mesas(sucursal_id, codigo) values($1,$2) on conflict do nothing',[s.id, codigo]);
      }
    }

    // Tarifas por sucursal
    for(const s of sucursales){
      await pool.query('insert into tarifas(sucursal_id, monto_hora, fraccion_min, minimo_min, vigente_desde) values($1,15,5,30,now())',[s.id]);
    }

    // Productos base
    const prods=[
      ['TIZA','Tiza',3,1,20,5,true],
      ['AGUA','Agua',5,2,30,10,true],
      ['GAS','Gaseosa',8,4,25,8,true],
      ['SNK','Snack',7,3,15,5,false]
    ];
    for(const p of prods){
      await pool.query('insert into productos(codigo,nombre,precio,costo,stock,stock_min,favorito) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',p);
    }

    // Usuarios iniciales
    const adminPass = await bcrypt.hash('123456', 10);
    const adminPin = await bcrypt.hash('9999', 10);
    const cajeroPass = await bcrypt.hash('1234', 10);

    const s1 = sucursales[0]?.id || null;

    await pool.query(`
      insert into usuarios(usuario, pass_hash, rol, sucursal_id, pin_hash)
      values('admin', $1, 'ADMIN', $3, $2)
      on conflict (usuario) do nothing
    `,[adminPass, adminPin, s1]);

    await pool.query(`
      insert into usuarios(usuario, pass_hash, rol, sucursal_id)
      values('cajero', $1, 'CAJERO', $2)
      on conflict (usuario) do nothing
    `,[cajeroPass, s1]);

    console.log('✅ Base de datos inicializada.');
    process.exit(0);
  }catch(e){
    console.error(e); process.exit(1);
  }
})();
