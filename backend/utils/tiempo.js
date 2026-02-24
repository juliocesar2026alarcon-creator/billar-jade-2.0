
const moment = require('moment-timezone');
function diffMinutos(inicioTs, finTs) {
  const start = moment(inicioTs);
  const end = moment(finTs);
  return Math.max(0, Math.round(end.diff(start, 'minutes', true)));
}
function minutosCobrables(minutos, fraccion=5, minimo=30){
  if(minutos<=0) return 0;
  if(minutos < minimo) return minimo;
  return Math.ceil(minutos / fraccion) * fraccion;
}
function montoTiempo(minCob, tarifaHora){
  return Number(((minCob/60)*tarifaHora).toFixed(2));
}
function formatLocal(ts){ return moment(ts).format('DD/MM/YYYY HH:mm'); }
module.exports = { diffMinutos, minutosCobrables, montoTiempo, formatLocal };
