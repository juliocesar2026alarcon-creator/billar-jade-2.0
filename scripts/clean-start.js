// scripts/clean-start.js
const fs = require('fs');
const path = require('path');

const inFile = path.join(process.cwd(), 'server.js');
const outFile = path.join(process.cwd(), 'server.clean.js');

// Lee server.js, elimina BOM si hubiera y escribe server.clean.js
const s = fs.readFileSync(inFile, 'utf8').replace(/^\uFEFF/, '');
fs.writeFileSync(outFile, s, 'utf8');

// Ejecuta el server limpio
require(outFile);
