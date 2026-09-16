import { ahoraISO, diasEntre } from './utils.js';

export function calcularEstadisticas(pos) {
  const fechaFin = pos.fechaCierre || ahoraISO();
  const diasActiva = diasEntre(pos.fechaCreacion, fechaFin);
  const feesOrdenados = pos.fees
    .filter(fee => Number.isFinite(new Date(fee.fecha).getTime()))
    .slice()
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const feesConMonto = feesOrdenados.filter(fee => fee.monto !== null && fee.monto !== '' && Number.isFinite(Number(fee.monto)));
  const total = feesConMonto.reduce((suma, fee) => suma + Number(fee.monto), 0);
  const intervaloPromedio = feesOrdenados.length > 1
    ? feesOrdenados.slice(1).reduce((suma, fee, indice) => suma + diasEntre(feesOrdenados[indice].fecha, fee.fecha), 0) / (feesOrdenados.length - 1)
    : null;

  return {
    diasActiva,
    eventos: feesOrdenados.length,
    total,
    promedioCollect: feesConMonto.length ? total / feesConMonto.length : null,
    ingresoDiario: diasActiva > 0 ? total / diasActiva : total,
    diasPrimerCollect: feesOrdenados.length ? diasEntre(pos.fechaCreacion, feesOrdenados[0].fecha) : null,
    intervaloPromedio,
    ultimoCollect: feesOrdenados.length ? feesOrdenados[feesOrdenados.length - 1].fecha : null
  };
}
