
function center(text, width=32){ const len=(text||'').length; if(len>=width) return (text||'').substring(0,width); const pad=Math.floor((width-len)/2); return ' '.repeat(pad)+text; }
function line(ch='-', width=32){ return ch.repeat(width); }
function money(n){ return (Number(n).toFixed(2)+' Bs').padStart(11,' '); }
function padRight(text, size){ text=text||''; if(text.length>=size) return text.substring(0,size); return text + ' '.repeat(size-text.length); }
function buildTicket(s){
  const lines=[];
  lines.push(center('BILLAR JADE'));
  if(s.sucursal_nombre) lines.push(center(s.sucursal_nombre));
  lines.push(line());
  lines.push(`Mesa: ${s.mesa_codigo || s.mesa_id}`);
  lines.push(`Inicio: ${s.hora_inicio_local}`);
  lines.push(`Fin:    ${s.hora_fin_local}`);
  lines.push(line());
  lines.push(`Tiempo (${s.minutos_reales} -> ${s.minutos_cobrables} min)`);
  lines.push(`Tarifa: ${s.tarifa_hora_bs} Bs/h, frac ${s.fraccion_min}m`);
  if(s.descuento_pct && s.descuento_pct>0){
    lines.push(`Desc.: ${s.descuento_pct}%`);
  }
  lines.push(`Importe tiempo: ${money(s.monto_tiempo_bs)}`);
  lines.push(line());
  lines.push('Consumos:');
  if(s.consumos && s.consumos.length){
    s.consumos.forEach(it=>{
      const left = `x${it.cantidad} ${it.nombre}`;
      const right = money(it.total_bs);
      lines.push(padRight(left,20)+padRight(right,12));
    });
  } else { lines.push('  (sin consumos)'); }
  lines.push(line());
  lines.push(`Subtotal consumos: ${money(s.subtotal_consumos_bs)}`);
  if(s.descuento_bs && s.descuento_bs>0){ lines.push(`Descuento:        -${money(s.descuento_bs)}`); }
  lines.push(`TOTAL A PAGAR:     ${money(s.total_bs)}`);
  lines.push(line());
  lines.push(center('Gracias por su preferencia'));
  lines.push('

');
  return lines.join('
');
}
module.exports = { buildTicket };
