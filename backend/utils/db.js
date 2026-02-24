
const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;
if(!connectionString){
  console.warn('[AVISO] DATABASE_URL no está definido. Configúralo en Render.');
}
const isRender = !!process.env.RENDER;
const ssl = { rejectUnauthorized: false };
const pool = new Pool({ connectionString, ssl });
module.exports = { pool };
