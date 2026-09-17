import { MAX_MONTO_USD, MAX_TEXTO_CORTO, MAX_TEXTO_LARGO, MAX_PRECIO } from './constants.js';

export function formatearNumero(num) {
  const n = aNumeroFinito(num);
  if (n === null) return '—';
  return parseFloat(n.toFixed(6)).toString();
}

export function formatearPrecioUsd(num) {
  const n = aNumeroFinito(num);
  if (n === null) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}

export function generarId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

export function fechaISO(fecha) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short', timeStyle: 'short'
  }).format(d);
}

export function ahoraISO() {
  return new Date().toISOString();
}

export function formatearFechaParaInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short', timeStyle: 'short'
  }).format(d).replace(' ', 'T');
}

export function esTextoSeguro(valor, maxLargo) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLargo);
}

export function aNumeroFinito(valor, { min = -Infinity, max = Infinity } = {}) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function aFechaISO(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (!Number.isFinite(d.getTime())) return null;
  const anio = d.getUTCFullYear();
  if (anio < 2000 || anio > 2100) return null;
  return d.toISOString();
}

export function esIdValido(valor) {
  return typeof valor === 'string' && /^[a-z0-9-]{1,64}$/i.test(valor);
}

export function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

export const escapeAttr = escapeHtml;

class HtmlSeguro {
  constructor(valor) { this.valor = String(valor); }
  toString() { return this.valor; }
}

export function raw(valor) {
  return new HtmlSeguro(valor);
}

export function html(partes, ...valores) {
  return new HtmlSeguro(
    partes.reduce((acc, parte, i) => {
      if (i === 0) return parte;
      const v = valores[i - 1];
      let renderizado;
      if (v instanceof HtmlSeguro) {
        renderizado = v.toString();
      } else if (Array.isArray(v)) {
        renderizado = v.map(x => x instanceof HtmlSeguro ? x.toString() : escapeHtml(x)).join('');
      } else {
        renderizado = escapeHtml(v);
      }
      return acc + renderizado + parte;
    }, '')
  );
}

export function renderEn(elemento, contenido) {
  if (!(contenido instanceof HtmlSeguro)) {
    throw new TypeError('renderEn() requiere el resultado de html`` o raw(). Nunca una cadena cruda.');
  }
  elemento.innerHTML = contenido.toString();
}

export function diasEntre(inicio, fin) {
  const inicioMs = new Date(inicio).getTime();
  const finMs = new Date(fin).getTime();
  if (!Number.isFinite(inicioMs) || !Number.isFinite(finMs)) return null;
  return Math.max(0, (finMs - inicioMs) / 86400000);
}

export function normalizarFee(fee) {
  if (!fee || typeof fee !== 'object') return null;
  const monto = aNumeroFinito(fee.monto, { min: 0, max: MAX_MONTO_USD });
  const fecha = aFechaISO(fee.fecha);
  if (monto === null || fecha === null) return null;
  return { fecha, monto, nota: esTextoSeguro(fee.nota, MAX_TEXTO_CORTO) };
}

export function normalizarPosicion(p) {
  if (!p || typeof p !== 'object') return null;
  if (!esIdValido(p.id)) return null;
  const fechaCreacion = aFechaISO(p.fechaCreacion);
  if (fechaCreacion === null) return null;

  const fechaCierre = aFechaISO(p.fechaCierre);
  const rangoMin = aNumeroFinito(p.rangoMin, { min: 0, max: MAX_PRECIO });
  const rangoMax = aNumeroFinito(p.rangoMax, { min: 0, max: MAX_PRECIO });
  const rangoValido = rangoMin !== null && rangoMax !== null && rangoMin <= rangoMax;

  return {
    id: p.id,
    nombre: esTextoSeguro(p.nombre, MAX_TEXTO_CORTO),
    identificador: esTextoSeguro(p.identificador, MAX_TEXTO_CORTO),
    notas: esTextoSeguro(p.notas, MAX_TEXTO_LARGO),
    fechaCreacion,
    fechaCierre: (fechaCierre && fechaCierre >= fechaCreacion) ? fechaCierre : null,
    rangoMin: rangoValido ? rangoMin : null,
    rangoMax: rangoValido ? rangoMax : null,
    fees: Array.isArray(p.fees) ? p.fees.map(normalizarFee).filter(Boolean) : []
  };
}
