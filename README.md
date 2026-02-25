# Billar Jade 2.0 — Render (Proyecto único)

**Incluye**: Backend (Express + Postgres + JWT + Roles + Reapertura + Descuentos + Inventario + Ticket 80mm) y Frontend (UI de caja con reloj grande).

## Variables de entorno
Crea en Render:
- `DATABASE_URL` (Render Postgres → Connections → **External** o **Use internal URL** si aparece el aviso)
- `JWT_SECRET` (cadena larga y secreta)
- `TZ` = `America/La_Paz`

## Deploy en Render
1. Sube este repositorio a GitHub.
2. Crea **Render PostgreSQL** → copia la `External Database URL`.
3. En **Render → New → Web Service**: selecciona el repo.
4. Configura:
   - **Build command**: `npm install && npm run db:setup`
   - **Start command**: `npm start`
   - **Environment**: agrega `DATABASE_URL`, `JWT_SECRET`, `TZ`.
5. Deploy. La primera subida creará tablas y usuarios:
   - Admin: `admin / 123456` (PIN **9999**)
   - Cajero: `cajero / 1234`

## Endpoints
- `POST /api/auth/login` → token JWT
- `GET /api/sucursales`
- `GET /api/mesas?sucursal_id=`
- `POST /sesiones/iniciar`
- `POST /sesiones/:id/consumos`
- `POST /sesiones/:id/cerrar` (con `descuento_pct`)
- `GET /inventario/alertas`
- `POST /api/admin/sesiones/:id/reabrir` (ADMIN + PIN)
- `GET /api/admin/reportes/ventas`

## Notas de impresión 80mm
El backend expone `ticket_text` (32 columnas) en el cierre. Para impresión directa, conecta un **helper local** que reciba este texto y lo envíe a la térmica USB/Red.
