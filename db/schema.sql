
create table if not exists sucursales(
  id serial primary key,
  nombre text not null,
  activo boolean default true
);
create table if not exists mesas(
  id serial primary key,
  sucursal_id int references sucursales(id),
  codigo text not null,
  activo boolean default true
);
create table if not exists tarifas(
  id serial primary key,
  sucursal_id int references sucursales(id),
  monto_hora numeric(10,2) not null,
  fraccion_min int not null default 5,
  minimo_min int not null default 30,
  vigente_desde timestamptz not null
);
create table if not exists usuarios(
  id serial primary key,
  usuario text unique not null,
  pass_hash text not null,
  rol text not null check (rol in ('ADMIN','CAJERO')),
  sucursal_id int references sucursales(id),
  pin_hash text,
  activo boolean default true
);
create table if not exists productos(
  id serial primary key,
  codigo text unique not null,
  nombre text not null,
  precio numeric(10,2) not null,
  costo numeric(10,2) not null,
  stock int not null default 0,
  stock_min int not null default 0,
  favorito boolean default false,
  activo boolean default true
);
create table if not exists sesiones(
  id serial primary key,
  mesa_id int references mesas(id),
  inicio_ts timestamptz not null,
  cierre_ts timestamptz,
  minutos_reales int,
  minutos_cobrables int,
  monto_tiempo_bs numeric(10,2),
  nota text,
  usuario_id int references usuarios(id)
);
create table if not exists consumos(
  id serial primary key,
  sesion_id int references sesiones(id),
  producto_id int references productos(id),
  cantidad int not null,
  precio_unit numeric(10,2) not null
);
create table if not exists cobros(
  id serial primary key,
  sesion_id int references sesiones(id),
  total numeric(10,2) not null,
  metodo_pago text not null,
  usuario_id int references usuarios(id),
  ts timestamptz not null,
  descuento_pct numeric(5,2) default 0,
  descuento_bs numeric(10,2) default 0
);
create table if not exists auditoria(
  id serial primary key,
  usuario_id int references usuarios(id),
  tipo text not null,
  detalle jsonb,
  ts timestamptz not null
);
