import { STORAGE_KEY, STATS_ARCHIVE_KEY, STATS_HIDDEN_KEY } from './constants.js';
import { state } from './state.js';
import { normalizarPosicion, esIdValido } from './utils.js';

function leerLista(clave, normalizador) {
  try {
    const parsed = JSON.parse(localStorage.getItem(clave) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizador).filter(Boolean);
  } catch (e) {
    console.warn(`Datos inválidos en ${clave}, se descartan.`, e);
    return [];
  }
}

export function cargarDatos() {
  state.posiciones = leerLista(STORAGE_KEY, normalizarPosicion);
  state.posicionesArchivadas = leerLista(STATS_ARCHIVE_KEY, normalizarPosicion);
  try {
    const ocultas = JSON.parse(localStorage.getItem(STATS_HIDDEN_KEY) || '[]');
    state.estadisticasOcultas = Array.isArray(ocultas) ? ocultas.filter(esIdValido) : [];
  } catch (e) {
    state.estadisticasOcultas = [];
  }
  return state.posiciones;
}

export function guardarDatos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posiciones));
    return true;
  } catch (e) {
    console.error('No se pudo escribir en localStorage', e);
    alert('No se pudieron guardar los cambios. Revisá el espacio disponible del navegador.');
    return false;
  }
}

export function guardarArchivoEstadisticas() {
  try {
    localStorage.setItem(STATS_ARCHIVE_KEY, JSON.stringify(state.posicionesArchivadas));
    return true;
  } catch (e) {
    console.error('No se pudo escribir en localStorage', e);
    return false;
  }
}

export function guardarEstadisticasOcultas() {
  try {
    localStorage.setItem(STATS_HIDDEN_KEY, JSON.stringify(state.estadisticasOcultas));
    return true;
  } catch (e) {
    console.error('No se pudo escribir en localStorage', e);
    return false;
  }
}
