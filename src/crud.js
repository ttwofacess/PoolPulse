import { MIN_COLLECT_USD, MAX_MONTO_USD, MAX_PRECIO, MAX_TEXTO_CORTO, MAX_TEXTO_LARGO } from './constants.js';
import { state } from './state.js';
import { aNumeroFinito, aFechaISO, esTextoSeguro, generarId } from './utils.js';
import { guardarDatos, guardarArchivoEstadisticas, guardarEstadisticasOcultas } from './storage.js';

export function validarRango(rangoMin, rangoMax) {
  const min = aNumeroFinito(rangoMin, { min: 0, max: MAX_PRECIO });
  const max = aNumeroFinito(rangoMax, { min: 0, max: MAX_PRECIO });
  if ((rangoMin !== '' && min === null) || (rangoMax !== '' && max === null)) {
    return { ok: false, error: 'El rango debe ser numérico y positivo.' };
  }
  if (min !== null && max !== null && min > max) {
    return { ok: false, error: 'El mínimo del rango no puede ser mayor que el máximo.' };
  }
  return { ok: true, min, max };
}

export function crearPosicion(nombre, fechaCreacion, notas, rangoMin, rangoMax, identificador) {
  const fecha = aFechaISO(fechaCreacion);
  if (fecha === null) return { ok: false, error: 'La fecha de creación no es válida.' };

  const rango = validarRango(rangoMin, rangoMax);
  if (!rango.ok) return rango;

  const nueva = {
    id: generarId(),
    nombre: esTextoSeguro(nombre, MAX_TEXTO_CORTO) || `Posición ${state.posiciones.length + 1}`,
    fechaCreacion: fecha,
    fechaCierre: null,
    notas: esTextoSeguro(notas, MAX_TEXTO_LARGO),
    rangoMin: rango.min,
    rangoMax: rango.max,
    identificador: esTextoSeguro(identificador, MAX_TEXTO_CORTO),
    fees: []
  };
  state.posiciones.unshift(nueva);
  if (!guardarDatos()) return { ok: false, error: 'No se pudo guardar. ¿Almacenamiento lleno?' };
  return { ok: true, posicion: nueva };
}

export function actualizarPosicion(idPosicion, notas, rangoMin, rangoMax, identificador) {
  const pos = state.posiciones.find(p => p.id === idPosicion);
  if (!pos) return { ok: false, error: 'Posición no encontrada.' };

  const rango = validarRango(rangoMin, rangoMax);
  if (!rango.ok) return rango;

  pos.notas = esTextoSeguro(notas, MAX_TEXTO_LARGO);
  pos.rangoMin = rango.min;
  pos.rangoMax = rango.max;
  pos.identificador = esTextoSeguro(identificador, MAX_TEXTO_CORTO);
  guardarDatos();
  return { ok: true };
}

export function agregarFee(idPosicion, fecha, monto, nota) {
  const pos = state.posiciones.find(p => p.id === idPosicion);
  if (!pos) return { ok: false, error: 'Posición no encontrada.' };
  if (pos.fechaCierre) return { ok: false, error: 'Esta posición está cerrada. No se pueden agregar más fees.' };

  const fechaFee = aFechaISO(fecha);
  if (fechaFee === null) return { ok: false, error: 'La fecha del fee no es válida.' };
  if (fechaFee < pos.fechaCreacion) return { ok: false, error: 'El fee no puede ser anterior a la creación de la posición.' };

  const montoNumerico = aNumeroFinito(monto, { min: MIN_COLLECT_USD, max: MAX_MONTO_USD });
  if (montoNumerico === null) {
    return { ok: false, error: `El collect manual debe ser numérico y de al menos $${MIN_COLLECT_USD.toFixed(2)} USD.` };
  }

  pos.fees.push({ fecha: fechaFee, monto: montoNumerico, nota: esTextoSeguro(nota, MAX_TEXTO_CORTO) });
  guardarDatos();
  return { ok: true };
}

export function cerrarPosicion(idPosicion, fechaCierre) {
  const pos = state.posiciones.find(p => p.id === idPosicion);
  if (!pos) return { ok: false, error: 'Posición no encontrada.' };
  if (pos.fechaCierre) return { ok: false, error: 'Ya está cerrada.' };

  const fecha = aFechaISO(fechaCierre);
  if (fecha === null) return { ok: false, error: 'La fecha de cierre no es válida.' };
  if (fecha < pos.fechaCreacion) return { ok: false, error: 'La fecha de cierre no puede ser anterior a la creación.' };

  const ultimoFee = pos.fees.length > 0 ? pos.fees[pos.fees.length - 1].fecha : null;
  if (ultimoFee && fecha < ultimoFee) return { ok: false, error: 'La fecha de cierre no puede ser anterior al último fee registrado.' };

  pos.fechaCierre = fecha;
  guardarDatos();
  return { ok: true };
}

export function archivarParaEstadisticas(pos) {
  const copia = JSON.parse(JSON.stringify(pos));
  state.posicionesArchivadas = state.posicionesArchivadas.filter(archivada => archivada.id !== pos.id);
  state.posicionesArchivadas.push(copia);
  guardarArchivoEstadisticas();
}

export function eliminarPosicion(idPosicion) {
  if (!confirm('¿Eliminar esta posición y todos sus fees?')) return false;
  const pos = state.posiciones.find(p => p.id === idPosicion);
  if (pos && pos.fechaCierre) archivarParaEstadisticas(pos);
  state.posiciones = state.posiciones.filter(p => p.id !== idPosicion);
  guardarDatos();
  return true;
}

export function eliminarRegistroEstadisticas(idPosicion, archivada) {
  if (!confirm('¿Eliminar este registro de las estadísticas?')) return false;

  if (archivada) {
    state.posicionesArchivadas = state.posicionesArchivadas.filter(pos => pos.id !== idPosicion);
    guardarArchivoEstadisticas();
  } else {
    if (!state.estadisticasOcultas.includes(idPosicion)) state.estadisticasOcultas.push(idPosicion);
    guardarEstadisticasOcultas();
  }

  return true;
}
