require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const moment = require('moment-timezone');
const { pool } = require('./backend/utils/db');
const authRoutes = require('./backend/routes/auth');
const coreRoutes = require('./backend/routes/core');
const adminRoutes = require('./backend/routes/admin');

moment.tz.setDefault(process.env.TZ || 'America/La_Paz');

const app = express();
app.use(cors());
app.use(express.json());

Rutas API
app.use('/api/auth', authRoutes);
app.use('/api', coreRoutes);
app.use('/api/admin', adminRoutes);

// Salud
app.get('/api/health', async (req, res) => {
  try {
    const r = await pool.query('select now()');
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Frontend estático
app.use('/', express.static(path.join(__dirname, 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Billar Jade 2.0 escuchando en puerto', PORT));
app.get('/ping', (req, res) => res.send('ok'));
