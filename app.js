(function() {
  "use strict";

  // --- CONSTANTES ---
  const STORAGE_KEY = 'liquidityPositions';
  const STATS_ARCHIVE_KEY = 'liquidityPositionStatsArchive';
  const STATS_HIDDEN_KEY = 'liquidityPositionStatsHidden';
  const MIN_COLLECT_USD = 10;
  const MAX_TEXTO_CORTO = 120;
  const MAX_TEXTO_LARGO  = 2000;
  const MAX_MONTO_USD    = 1e9;
  const MAX_PRECIO       = 1e12;

  // --- Estado ---
  let posiciones = [];
  let posicionesArchivadas = [];
  let estadisticasOcultas = [];
  let precioEth = null;
  let ultimaSincronizacion = null;

  // --- DOM refs ---
  const listadoEl = document.getElementById('listadoPosiciones');
  const modalOverlay = document.getElementById('modalDialog');
  const modalContenido = document.getElementById('modalContenido');
  const btnSync = document.getElementById('btnSync');
  const syncStatusEl = document.getElementById('syncStatus');

  // --- Funciones auxiliares ---
  function formatearNumero(num) {
    const n = aNumeroFinito(num);
    if (n === null) return '—';
    return parseFloat(n.toFixed(6)).toString();
  }

  function formatearPrecioUsd(num) {
    const n = aNumeroFinito(num);
    if (n === null) return '—';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n);
  }

  function generarId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
  }

  function fechaISO(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('sv-SE', {
      dateStyle: 'short', timeStyle: 'short'
    }).format(d);
  }

  function ahoraISO() {
    // Devuelve un ISO string real (con 'T'), para que new Date(...) lo parseé
    // de forma consistente en todos los navegadores.
    return new Date().toISOString();
  }

  function formatearFechaParaInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('sv-SE', {
      dateStyle: 'short', timeStyle: 'short'
    }).format(d).replace(' ', 'T');
  }

  function esTextoSeguro(valor, maxLargo) {
    if (typeof valor !== 'string') return '';
    return valor.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLargo);
  }

  function aNumeroFinito(valor, { min = -Infinity, max = Infinity } = {}) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return n;
  }

  function aFechaISO(valor) {
    if (!valor) return null;
    const d = new Date(valor);
    if (!Number.isFinite(d.getTime())) return null;
    const anio = d.getUTCFullYear();
    if (anio < 2000 || anio > 2100) return null;
    return d.toISOString();
  }

  function esIdValido(valor) {
    return typeof valor === 'string' && /^[a-z0-9-]{1,64}$/i.test(valor);
  }

  function escapeAttr(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizarFee(fee) {
    if (!fee || typeof fee !== 'object') return null;
    const monto = aNumeroFinito(fee.monto, { min: 0, max: MAX_MONTO_USD });
    const fecha = aFechaISO(fee.fecha);
    if (monto === null || fecha === null) return null;
    return { fecha, monto, nota: esTextoSeguro(fee.nota, MAX_TEXTO_CORTO) };
  }

  function normalizarPosicion(p) {
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

  // --- Almacenamiento ---
  function cargarDatos() {
    posiciones = leerLista(STORAGE_KEY, normalizarPosicion);
    posicionesArchivadas = leerLista(STATS_ARCHIVE_KEY, normalizarPosicion);
    try {
      const ocultas = JSON.parse(localStorage.getItem(STATS_HIDDEN_KEY) || '[]');
      estadisticasOcultas = Array.isArray(ocultas) ? ocultas.filter(esIdValido) : [];
    } catch (e) {
      estadisticasOcultas = [];
    }
    return posiciones;
  }

  function guardarDatos() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posiciones));
      return true;
    } catch (e) {
      console.error('No se pudo escribir en localStorage', e);
      alert('No se pudieron guardar los cambios. Revisá el espacio disponible del navegador.');
      return false;
    }
  }

  function guardarArchivoEstadisticas() {
    try {
      localStorage.setItem(STATS_ARCHIVE_KEY, JSON.stringify(posicionesArchivadas));
      return true;
    } catch (e) {
      console.error('No se pudo escribir en localStorage', e);
      return false;
    }
  }

  function guardarEstadisticasOcultas() {
    try {
      localStorage.setItem(STATS_HIDDEN_KEY, JSON.stringify(estadisticasOcultas));
      return true;
    } catch (e) {
      console.error('No se pudo escribir en localStorage', e);
      return false;
    }
  }

  function eliminarRegistroEstadisticas(idPosicion, archivada) {
    if (!confirm('¿Eliminar este registro de las estadísticas?')) return false;

    if (archivada) {
      posicionesArchivadas = posicionesArchivadas.filter(pos => pos.id !== idPosicion);
      guardarArchivoEstadisticas();
    } else {
      if (!estadisticasOcultas.includes(idPosicion)) estadisticasOcultas.push(idPosicion);
      guardarEstadisticasOcultas();
    }

    renderizarEstadisticas();
    return true;
  }

  function archivarParaEstadisticas(pos) {
    const copia = JSON.parse(JSON.stringify(pos));
    posicionesArchivadas = posicionesArchivadas.filter(archivada => archivada.id !== pos.id);
    posicionesArchivadas.push(copia);
    guardarArchivoEstadisticas();
  }

  // --- CRUD ---
  function validarRango(rangoMin, rangoMax) {
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

  function crearPosicion(nombre, fechaCreacion, notas, rangoMin, rangoMax, identificador) {
    const fecha = aFechaISO(fechaCreacion);
    if (fecha === null) return { ok: false, error: 'La fecha de creación no es válida.' };

    const rango = validarRango(rangoMin, rangoMax);
    if (!rango.ok) return rango;

    const nueva = {
      id: generarId(),
      nombre: esTextoSeguro(nombre, MAX_TEXTO_CORTO) || `Posición ${posiciones.length + 1}`,
      fechaCreacion: fecha,
      fechaCierre: null,
      notas: esTextoSeguro(notas, MAX_TEXTO_LARGO),
      rangoMin: rango.min,
      rangoMax: rango.max,
      identificador: esTextoSeguro(identificador, MAX_TEXTO_CORTO),
      fees: []
    };
    posiciones.unshift(nueva);
    if (!guardarDatos()) return { ok: false, error: 'No se pudo guardar. ¿Almacenamiento lleno?' };
    renderizarListado();
    return { ok: true, posicion: nueva };
  }

  function actualizarPosicion(idPosicion, notas, rangoMin, rangoMax, identificador) {
    const pos = posiciones.find(p => p.id === idPosicion);
    if (!pos) return { ok: false, error: 'Posición no encontrada.' };

    const rango = validarRango(rangoMin, rangoMax);
    if (!rango.ok) return rango;

    pos.notas = esTextoSeguro(notas, MAX_TEXTO_LARGO);
    pos.rangoMin = rango.min;
    pos.rangoMax = rango.max;
    pos.identificador = esTextoSeguro(identificador, MAX_TEXTO_CORTO);
    guardarDatos();
    renderizarListado();
    return { ok: true };
  }

  function agregarFee(idPosicion, fecha, monto, nota) {
    const pos = posiciones.find(p => p.id === idPosicion);
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
    renderizarListado();
    return { ok: true };
  }

  function cerrarPosicion(idPosicion, fechaCierre) {
    const pos = posiciones.find(p => p.id === idPosicion);
    if (!pos) return { ok: false, error: 'Posición no encontrada.' };
    if (pos.fechaCierre) return { ok: false, error: 'Ya está cerrada.' };

    const fecha = aFechaISO(fechaCierre);
    if (fecha === null) return { ok: false, error: 'La fecha de cierre no es válida.' };
    if (fecha < pos.fechaCreacion) return { ok: false, error: 'La fecha de cierre no puede ser anterior a la creación.' };

    const ultimoFee = pos.fees.length > 0 ? pos.fees[pos.fees.length - 1].fecha : null;
    if (ultimoFee && fecha < ultimoFee) return { ok: false, error: 'La fecha de cierre no puede ser anterior al último fee registrado.' };

    pos.fechaCierre = fecha;
    guardarDatos();
    renderizarListado();
    return { ok: true };
  }

  function eliminarPosicion(idPosicion) {
    if (!confirm('¿Eliminar esta posición y todos sus fees?')) return false;
    const pos = posiciones.find(p => p.id === idPosicion);
    if (pos && pos.fechaCierre) archivarParaEstadisticas(pos);
    posiciones = posiciones.filter(p => p.id !== idPosicion);
    guardarDatos();
    renderizarListado();
    return true;
  }

  // --- Renderizado ---
  function renderizarListado() {
    if (precioEth !== null) {
      syncStatusEl.textContent = `ETH/USDT: ${formatearPrecioUsd(precioEth)} · Actualizado: ${fechaISO(ultimaSincronizacion)}`;
    }

    if (posiciones.length === 0) {
      listadoEl.innerHTML = `<p style="text-align:center;color:#9aa6b5;padding:40px 0;">Aún no hay posiciones. Crea una con el botón "➕ Nueva Posición".</p>`;
      return;
    }

    let html = '';
    posiciones.forEach((pos, index) => {
      const isCerrada = pos.fechaCierre !== null;
      const claseCard = isCerrada ? 'position-card cerrada' : 'position-card';
      const badgeClase = isCerrada ? 'badge cerrada' : 'badge';
      const badgeTexto = isCerrada ? 'Cerrada' : 'Abierta';
      const numFees = pos.fees.length;
      const ultimoFee = numFees > 0 ? fechaISO(pos.fees[pos.fees.length-1].fecha) : '—';
      const tieneRango = pos.rangoMin !== null && pos.rangoMax !== null;
      const estaEnRango = !isCerrada && tieneRango && precioEth !== null && precioEth >= pos.rangoMin && precioEth <= pos.rangoMax;

      html += `<div class="${claseCard}" data-id="${escapeAttr(pos.id)}">`;
      html += `<div class="position-header">`;
      html += `<div class="position-title">${escapeHtml(pos.nombre)} <span class="${badgeClase}">${badgeTexto}</span>`;
      if (estaEnRango) {
        html += `<span class="range-status in-range" title="El precio actual de ETH está dentro del rango">● ✓ En rango</span>`;
      } else if (!isCerrada && tieneRango && precioEth !== null) {
        html += `<span class="range-status out-of-range" title="El precio actual de ETH está fuera del rango">● Fuera de rango</span>`;
      }
      html += `</div>`;
      html += `<span class="text-muted" style="font-size:0.8rem;">#${index+1}</span>`;
      html += `</div>`;

      html += `<div class="position-details">`;
      if (pos.identificador) {
        html += `<span>🆔 ID: ${escapeHtml(pos.identificador)}</span>`;
      }
      html += `<span>📅 Creación: ${fechaISO(pos.fechaCreacion)}</span>`;
      if (isCerrada) {
        html += `<span>🔒 Cierre: ${fechaISO(pos.fechaCierre)}</span>`;
      }
      html += `<span>💰 Fees: ${numFees}</span>`;
      html += `<span>📌 Último fee: ${ultimoFee}</span>`;
      if (pos.rangoMin !== null && pos.rangoMax !== null) {
        html += `<span>📊 Rango: ${formatearNumero(pos.rangoMin)} – ${formatearNumero(pos.rangoMax)}</span>`;
      } else {
        html += `<span class="text-muted">📊 Rango: sin definir</span>`;
      }
      if (pos.notas) {
        html += `<span>📝 ${escapeHtml(pos.notas)}</span>`;
      }
      html += `</div>`;

      // Acciones
      html += `<div class="position-actions">`;
      if (!isCerrada) {
        html += `<button class="btn btn-success btn-sm btn-agregar-fee" data-id="${escapeAttr(pos.id)}">📥 Collect Fee</button>`;
        html += `<button class="btn btn-warning btn-sm btn-cerrar" data-id="${escapeAttr(pos.id)}">🔒 Cerrar</button>`;
      }
      html += `<button class="btn btn-secondary btn-sm btn-editar" data-id="${escapeAttr(pos.id)}">✏️ Editar</button>`;
      html += `<button class="btn btn-danger btn-sm btn-eliminar" data-id="${escapeAttr(pos.id)}">🗑️ Eliminar</button>`;
      html += `</div>`;

      // Lista de fees (expandible)
      if (numFees > 0) {
        html += `<div class="fee-list">`;
        html += `<strong>Historial de fees:</strong> `;
        pos.fees.forEach((fee, i) => {
          const montoNum = aNumeroFinito(fee.monto, { min: 0, max: MAX_MONTO_USD });
          const montoStr = montoNum !== null ? `$${montoNum.toFixed(2)}` : '';
          const notaStr = fee.nota ? ` (${escapeHtml(fee.nota)})` : '';
          html += `<span class="fee-item">#${i+1} ${fechaISO(fee.fecha)} ${montoStr}${notaStr}</span>`;
        });
        html += `</div>`;
      } else {
        html += `<div class="fee-list no-fees">Sin fees recolectados aún.</div>`;
      }

      html += `</div>`;
    });

    listadoEl.innerHTML = html;
  }

  // Escape HTML básico
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Modales ---
  function abrirModal(html) {
    modalContenido.innerHTML = html;
    modalOverlay.showModal();
  }

  function cerrarModal() {
    modalOverlay.close();
  }

  // --- Estadísticas basadas exclusivamente en collects manuales ---
  function diasEntre(inicio, fin) {
    const inicioMs = new Date(inicio).getTime();
    const finMs = new Date(fin).getTime();
    if (!Number.isFinite(inicioMs) || !Number.isFinite(finMs)) return null;
    return Math.max(0, (finMs - inicioMs) / 86400000);
  }

  function calcularEstadisticas(pos) {
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

  function renderizarEstadisticas() {
    const estadisticasEl = document.getElementById('estadisticasContenido');
    if (!estadisticasEl) return;

    const posicionesParaEstadisticas = [
      ...posiciones
        .filter(pos => !estadisticasOcultas.includes(pos.id))
        .map(pos => ({ pos, archivada: false })),
      ...posicionesArchivadas.map(pos => ({ pos, archivada: true }))
    ];

    if (posicionesParaEstadisticas.length === 0) {
      estadisticasEl.innerHTML = `<p class="stats-empty">Todavía no hay posiciones para comparar. Crea una desde la pestaña "📋 Posiciones".</p>`;
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
      return `
        <div class="stats-card" data-id="${escapeAttr(pos.id)}">
          <div class="stats-card-header">
            <div class="stats-card-title">
              <span class="stats-rank${esTop ? ' top' : ''}">${indice + 1}</span>
              ${escapeHtml(pos.nombre)}
            </div>
            <div class="stats-card-actions">
              <span class="stats-highlight">${formatearPrecioUsd(stats.ingresoDiario)} / día</span>
              <button class="btn btn-danger btn-sm btn-eliminar-estadistica" data-id="${escapeAttr(pos.id)}" data-archivada="${archivada}" type="button">🗑️ Eliminar</button>
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
    }).join('');

    estadisticasEl.innerHTML = `
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
    `;
  }

  // --- Formularios específicos ---

  // 1. Nueva posición
  function mostrarFormNuevaPosicion() {
    const ahora = ahoraISO();
    const html = `
      <h2>📌 Nueva Posición</h2>
      <label for="nombrePos">Nombre / Pool (opcional)</label>
      <input type="text" id="nombrePos" placeholder="Ej: Uniswap ETH/USDC" maxlength="120" />

      <label for="idPos">ID de posición (opcional)</label>
      <input type="text" id="idPos" placeholder="Ej: Token ID del NFT, #12345" maxlength="120" />

      <label for="fechaCreacionPos">Fecha de creación</label>
      <input type="datetime-local" id="fechaCreacionPos" value="${formatearFechaParaInput(ahora)}" />

      <label for="notasPos">Notas (opcional)</label>
      <textarea id="notasPos" placeholder="Observaciones..." maxlength="2000"></textarea>

      <label>Rango de precios (opcional)</label>
      <div class="flex">
        <input type="number" step="any" id="rangoMinPos" placeholder="Mínimo" style="flex:1;" />
        <span class="text-muted">–</span>
        <input type="number" step="any" id="rangoMaxPos" placeholder="Máximo" style="flex:1;" />
      </div>

      <div class="modal-actions">
        <button class="btn btn-cancel" id="btnCancelarPos">Cancelar</button>
        <button class="btn" id="btnGuardarPos">Guardar</button>
      </div>
    `;
    abrirModal(html);

    document.getElementById('btnCancelarPos').addEventListener('click', cerrarModal);
    document.getElementById('btnGuardarPos').addEventListener('click', function() {
      const resultado = crearPosicion(
        document.getElementById('nombrePos').value,
        document.getElementById('fechaCreacionPos').value,
        document.getElementById('notasPos').value,
        document.getElementById('rangoMinPos').value,
        document.getElementById('rangoMaxPos').value,
        document.getElementById('idPos').value
      );
      if (!resultado.ok) { alert(resultado.error); return; }
      cerrarModal();
    });
  }

  // 2. Agregar fee
  function mostrarFormAgregarFee(idPosicion) {
    const pos = posiciones.find(p => p.id === idPosicion);
    if (!pos) return;
    if (pos.fechaCierre) {
      alert('Posición cerrada. No se pueden agregar fees.');
      return;
    }
    const ahora = ahoraISO();
    const html = `
      <h2>📥 Collect Fee</h2>
      <p><strong>Posición:</strong> ${escapeHtml(pos.nombre)}</p>
      <label for="fechaFee">Fecha del fee</label>
      <input type="datetime-local" id="fechaFee" value="${formatearFechaParaInput(ahora)}" />

      <label for="montoFee">Monto (USD)</label>
      <input type="number" step="0.01" min="${MIN_COLLECT_USD}" id="montoFee" placeholder="${MIN_COLLECT_USD.toFixed(2)}" required />
      <p class="form-help">El mínimo para registrar un collect es $${MIN_COLLECT_USD.toFixed(2)} USD.</p>

      <label for="notaFee">Nota (opcional)</label>
      <input type="text" id="notaFee" placeholder="Ej: Comisión semanal" maxlength="120" />

      <div class="modal-actions">
        <button class="btn btn-cancel" id="btnCancelarFee">Cancelar</button>
        <button class="btn btn-success" id="btnGuardarFee">Registrar Fee</button>
      </div>
    `;
    abrirModal(html);

    document.getElementById('btnCancelarFee').addEventListener('click', cerrarModal);
    document.getElementById('btnGuardarFee').addEventListener('click', function() {
      const resultado = agregarFee(
        idPosicion,
        document.getElementById('fechaFee').value,
        document.getElementById('montoFee').value,
        document.getElementById('notaFee').value
      );
      if (!resultado.ok) { alert(resultado.error); return; }
      cerrarModal();
    });
  }

  // 3. Cerrar posición
  function mostrarFormCerrarPosicion(idPosicion) {
    const pos = posiciones.find(p => p.id === idPosicion);
    if (!pos) return;
    if (pos.fechaCierre) {
      alert('Ya está cerrada.');
      return;
    }
    const ahora = ahoraISO();
    const html = `
      <h2>🔒 Cerrar Posición</h2>
      <p><strong>${escapeHtml(pos.nombre)}</strong></p>
      <p>Fecha de cierre:</p>
      <input type="datetime-local" id="fechaCierrePos" value="${formatearFechaParaInput(ahora)}" />

      <div class="modal-actions">
        <button class="btn btn-cancel" id="btnCancelarCierre">Cancelar</button>
        <button class="btn btn-warning" id="btnConfirmarCierre">Cerrar</button>
      </div>
    `;
    abrirModal(html);

    document.getElementById('btnCancelarCierre').addEventListener('click', cerrarModal);
    document.getElementById('btnConfirmarCierre').addEventListener('click', function() {
      const resultado = cerrarPosicion(idPosicion, document.getElementById('fechaCierrePos').value);
      if (!resultado.ok) { alert(resultado.error); return; }
      cerrarModal();
    });
  }

  // 4. Editar posición (ID, rango de precios y notas)
  function mostrarFormEditar(idPosicion) {
    const pos = posiciones.find(p => p.id === idPosicion);
    if (!pos) return;
    const html = `
      <h2>✏️ Editar Posición</h2>
      <p><strong>${escapeHtml(pos.nombre)}</strong></p>

      <label for="idEdit">ID de posición</label>
      <input type="text" id="idEdit" placeholder="Ej: Token ID del NFT, #12345" value="${escapeAttr(pos.identificador)}" maxlength="120" />

      <label>Rango de precios</label>
      <div class="flex">
        <input type="number" step="any" id="rangoMinEdit" placeholder="Mínimo" value="${escapeAttr(aNumeroFinito(pos.rangoMin) ?? '')}" style="flex:1;" />
        <span class="text-muted">–</span>
        <input type="number" step="any" id="rangoMaxEdit" placeholder="Máximo" value="${escapeAttr(aNumeroFinito(pos.rangoMax) ?? '')}" style="flex:1;" />
      </div>

      <label for="notasEdit">Notas</label>
      <textarea id="notasEdit" placeholder="Observaciones..." maxlength="2000">${escapeHtml(pos.notas)}</textarea>

      <div class="modal-actions">
        <button class="btn btn-cancel" id="btnCancelarEditar">Cancelar</button>
        <button class="btn" id="btnGuardarEditar">Guardar</button>
      </div>
    `;
    abrirModal(html);

    document.getElementById('btnCancelarEditar').addEventListener('click', cerrarModal);
    document.getElementById('btnGuardarEditar').addEventListener('click', function() {
      const resultado = actualizarPosicion(
        idPosicion,
        document.getElementById('notasEdit').value,
        document.getElementById('rangoMinEdit').value,
        document.getElementById('rangoMaxEdit').value,
        document.getElementById('idEdit').value
      );
      if (!resultado.ok) { alert(resultado.error); return; }
      cerrarModal();
    });
  }

  // --- Eventos globales (delegación en el listado) ---
  listadoEl.addEventListener('click', function(e) {
    const target = e.target.closest('button');
    if (!target) return;

    const id = target.dataset.id;
    if (!id) return;

    if (target.classList.contains('btn-agregar-fee')) {
      mostrarFormAgregarFee(id);
    } else if (target.classList.contains('btn-editar')) {
      mostrarFormEditar(id);
    } else if (target.classList.contains('btn-cerrar')) {
      mostrarFormCerrarPosicion(id);
    } else if (target.classList.contains('btn-eliminar')) {
      eliminarPosicion(id);
    }
  });

  document.getElementById('estadisticasContenido').addEventListener('click', function(e) {
    const target = e.target.closest('.btn-eliminar-estadistica');
    if (!target) return;

    eliminarRegistroEstadisticas(target.dataset.id, target.dataset.archivada === 'true');
  });

  // Botón Nueva Posición
  document.getElementById('btnNuevaPosicion').addEventListener('click', mostrarFormNuevaPosicion);
  document.getElementById('tabEstadisticas').addEventListener('change', function() {
    if (this.checked) renderizarEstadisticas();
  });

  // Consulta el último precio negociado de ETH/USDT en Binance.
  async function sincronizarPrecioEth() {
    btnSync.disabled = true;
    btnSync.textContent = '↻ Sincronizando…';
    syncStatusEl.textContent = 'Consultando ETH/USDT en Binance…';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', { signal: controller.signal });
      if (!response.ok) throw new Error(`Binance respondió ${response.status}`);

      const data = await response.json();
      const precio = Number(data.price);
      if (!Number.isFinite(precio) || precio <= 0 || precio > MAX_PRECIO) {
        throw new Error('Binance devolvió un precio fuera de rango');
      }

      precioEth = precio;
      ultimaSincronizacion = ahoraISO();
      renderizarListado();
    } catch (error) {
      console.error('No se pudo sincronizar ETH/USDT:', error);
      syncStatusEl.textContent = 'No se pudo consultar Binance. Verificá tu conexión e intentá nuevamente.';
    } finally {
      clearTimeout(timeout);
      btnSync.disabled = false;
      btnSync.textContent = '↻ Sync ETH';
    }
  }

  btnSync.addEventListener('click', sincronizarPrecioEth);

  // --- Inicialización ---
  cargarDatos();
  renderizarListado();

})();
