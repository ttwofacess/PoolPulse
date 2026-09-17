import { MAX_MONTO_USD } from './constants.js';
import { state } from './state.js';
import { formatearNumero, formatearPrecioUsd, fechaISO, ahoraISO, aNumeroFinito, html, renderEn, raw } from './utils.js';
import { calcularEstadisticas } from './stats.js';

const listadoEl = document.getElementById('listadoPosiciones');
const syncStatusEl = document.getElementById('syncStatus');
const modalOverlay = document.getElementById('modalDialog');
const modalContenido = document.getElementById('modalContenido');

export function abrirModal(contenido) {
  renderEn(modalContenido, contenido);
  modalOverlay.showModal();
}

export function cerrarModal() {
  modalOverlay.close();
}

export function renderizarListado() {
  if (state.precioEth !== null) {
    syncStatusEl.textContent = `ETH/USDT: ${formatearPrecioUsd(state.precioEth)} · Actualizado: ${fechaISO(state.ultimaSincronizacion)}`;
  }

  if (state.posiciones.length === 0) {
    renderEn(listadoEl, html`<p class="empty-state">Aún no hay posiciones. Crea una con el botón "➕ Nueva Posición".</p>`);
    return;
  }

  const tarjetas = state.posiciones.map((pos, index) => {
    const isCerrada = pos.fechaCierre !== null;
    const claseCard = isCerrada ? 'position-card cerrada' : 'position-card';
    const badgeClase = isCerrada ? 'badge cerrada' : 'badge';
    const badgeTexto = isCerrada ? 'Cerrada' : 'Abierta';
    const numFees = pos.fees.length;
    const ultimoFee = numFees > 0 ? fechaISO(pos.fees[pos.fees.length-1].fecha) : '—';
    const tieneRango = pos.rangoMin !== null && pos.rangoMax !== null;
    const estaEnRango = !isCerrada && tieneRango && state.precioEth !== null && state.precioEth >= pos.rangoMin && state.precioEth <= pos.rangoMax;

    const feeItems = pos.fees.map((fee, i) => {
      const montoNum = aNumeroFinito(fee.monto, { min: 0, max: MAX_MONTO_USD });
      const montoStr = montoNum !== null ? `$${montoNum.toFixed(2)}` : '';
      return html`<span class="fee-item">#${i + 1} ${fechaISO(fee.fecha)} ${montoStr}${fee.nota ? ` (${fee.nota})` : ''}</span>`;
    });

    return html`
      <div class="${claseCard}" data-id="${pos.id}">
        <div class="position-header">
          <div class="position-title">${pos.nombre} <span class="${badgeClase}">${badgeTexto}</span>
            ${estaEnRango
              ? html`<span class="range-status in-range" title="El precio actual de ETH está dentro del rango">● ✓ En rango</span>`
              : !isCerrada && tieneRango && state.precioEth !== null
                ? html`<span class="range-status out-of-range" title="El precio actual de ETH está fuera del rango">● Fuera de rango</span>`
                : raw('')}
          </div>
          <span class="text-muted text-xs">#${index + 1}</span>
        </div>
        <div class="position-details">
          ${pos.identificador ? html`<span>🆔 ID: ${pos.identificador}</span>` : raw('')}
          <span>📅 Creación: ${fechaISO(pos.fechaCreacion)}</span>
          ${isCerrada ? html`<span>🔒 Cierre: ${fechaISO(pos.fechaCierre)}</span>` : raw('')}
          <span>💰 Fees: ${numFees}</span>
          <span>📌 Último fee: ${ultimoFee}</span>
          ${tieneRango
            ? html`<span>📊 Rango: ${formatearNumero(pos.rangoMin)} – ${formatearNumero(pos.rangoMax)}</span>`
            : html`<span class="text-muted">📊 Rango: sin definir</span>`}
          ${pos.notas ? html`<span>📝 ${pos.notas}</span>` : raw('')}
        </div>
        <div class="position-actions">
          ${!isCerrada
            ? html`
              <button class="btn btn-success btn-sm btn-agregar-fee" data-id="${pos.id}">📥 Collect Fee</button>
              <button class="btn btn-warning btn-sm btn-cerrar" data-id="${pos.id}">🔒 Cerrar</button>`
            : raw('')}
          <button class="btn btn-secondary btn-sm btn-editar" data-id="${pos.id}">✏️ Editar</button>
          <button class="btn btn-danger btn-sm btn-eliminar" data-id="${pos.id}">🗑️ Eliminar</button>
        </div>
        ${numFees > 0
          ? html`<div class="fee-list"><strong>Historial de fees:</strong> ${feeItems}</div>`
          : html`<div class="fee-list no-fees">Sin fees recolectados aún.</div>`}
      </div>`;
  });

  renderEn(listadoEl, html`${tarjetas}`);
}

export function renderizarEstadisticas() {
  const estadisticasEl = document.getElementById('estadisticasContenido');
  if (!estadisticasEl) return;

  const posicionesParaEstadisticas = [
    ...state.posiciones
      .filter(pos => !state.estadisticasOcultas.includes(pos.id))
      .map(pos => ({ pos, archivada: false })),
    ...state.posicionesArchivadas.map(pos => ({ pos, archivada: true }))
  ];

  if (posicionesParaEstadisticas.length === 0) {
    renderEn(estadisticasEl, html`<p class="stats-empty">Todavía no hay posiciones para comparar. Crea una desde la pestaña "📋 Posiciones".</p>`);
    return;
  }

  const filas = posicionesParaEstadisticas.map(({ pos, archivada }) => ({ pos, archivada, stats: calcularEstadisticas(pos) }))
    .sort((a, b) => b.stats.ingresoDiario - a.stats.ingresoDiario);
  const totalRecaudado = filas.reduce((suma, fila) => suma + fila.stats.total, 0);
  const totalEventos = filas.reduce((suma, fila) => suma + fila.stats.eventos, 0);
  const eventosConMonto = filas.reduce((suma, fila) => suma + fila.pos.fees.filter(fee => fee.monto !== null && fee.monto !== '' && Number.isFinite(Number(fee.monto))).length, 0);
  const promedioGeneral = eventosConMonto ? totalRecaudado / eventosConMonto : null;
  const formatoDias = valor => valor === null ? '—' : `${valor.toFixed(1)} días`;

  const htmlTarjetas = filas.map(({ pos, archivada, stats }, indice) => {
    const esTop = indice === 0;
    return html`
      <div class="stats-card" data-id="${pos.id}">
        <div class="stats-card-header">
          <div class="stats-card-title">
            <span class="stats-rank${esTop ? ' top' : ''}">${indice + 1}</span>
            ${pos.nombre}
          </div>
          <div class="stats-card-actions">
            <span class="stats-highlight">${formatearPrecioUsd(stats.ingresoDiario)} / día</span>
            <button class="btn btn-danger btn-sm btn-eliminar-estadistica" data-id="${pos.id}" data-archivada="${archivada}" type="button">🗑️ Eliminar</button>
          </div>
        </div>
        <div class="stats-grid">
          <div><small>Total</small><strong>${formatearPrecioUsd(stats.total)}</strong></div>
          <div><small>Collects</small><strong>${stats.eventos}</strong></div>
          <div><small>Promedio</small><strong>${stats.promedioCollect === null ? '—' : formatearPrecioUsd(stats.promedioCollect)}</strong></div>
          <div><small>1.º collect</small><strong>${formatoDias(stats.diasPrimerCollect)}</strong></div>
          <div><small>Intervalo prom.</small><strong>${formatoDias(stats.intervaloPromedio)}</strong></div>
          <div><small>Último collect</small><strong>${stats.ultimoCollect ? fechaISO(stats.ultimoCollect) : '—'}</strong></div>
        </div>
      </div>`;
  });

  renderEn(estadisticasEl, html`
    <div class="stats-header">
      <h2>📊 Estadísticas de collects</h2>
    </div>
    <p class="text-muted mb-2">Datos calculados únicamente a partir de los eventos de collect manual registrados. El ranking prioriza USD/día para comparar posiciones con distinta antigüedad.</p>
    <div class="stats-summary">
      <div><small>Total recaudado</small><strong>${formatearPrecioUsd(totalRecaudado)}</strong></div>
      <div><small>Eventos manuales</small><strong>${totalEventos}</strong></div>
      <div><small>Promedio por collect</small><strong>${promedioGeneral === null ? '—' : formatearPrecioUsd(promedioGeneral)}</strong></div>
    </div>
    ${htmlTarjetas}
  `);
}
