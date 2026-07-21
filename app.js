(function() {
  "use strict";

  // --- CONSTANTES ---
  const STORAGE_KEY = 'liquidityPositions';
  const MIN_COLLECT_USD = 10;

  // --- Estado ---
  let posiciones = [];
  let precioEth = null;
  let ultimaSincronizacion = null;

  // --- DOM refs ---
  const listadoEl = document.getElementById('listadoPosiciones');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContenido = document.getElementById('modalContenido');
  const btnSync = document.getElementById('btnSync');
  const syncStatusEl = document.getElementById('syncStatus');

  // --- Funciones auxiliares ---
  function formatearNumero(num) {
    if (num === null || num === undefined || isNaN(num)) return '—';
    // Muestra hasta 6 decimales pero sin ceros innecesarios
    return parseFloat(num.toFixed(6)).toString();
  }

  function formatearPrecioUsd(num) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  }

  function generarId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
  }

  function fechaISO(fecha) {
    // Formatea una fecha para visualización, usando hora LOCAL
    // (evita el desfase que producía toISOString(), que convierte a UTC)
    if (!fecha) return '—';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '—'; // fecha inválida (p.ej. placeholder '—')
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  function ahoraISO() {
    // Devuelve un ISO string real (con 'T'), para que new Date(...) lo parseé
    // de forma consistente en todos los navegadores.
    return new Date().toISOString();
  }

  function formatearFechaParaInput(fechaISO) {
    // Para input datetime-local necesitamos formato "YYYY-MM-DDTHH:mm"
    if (!fechaISO) return '';
    const d = new Date(fechaISO);
    const year = d.getFullYear();
    const month = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const hours = String(d.getHours()).padStart(2,'0');
    const minutes = String(d.getMinutes()).padStart(2,'0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // --- Almacenamiento ---
  function cargarDatos() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        posiciones = JSON.parse(raw);
        // Asegurar que cada posición tenga array fees y fechas como strings o null
        posiciones.forEach(p => {
          if (!p.fees) p.fees = [];
          if (!p.fechaCierre) p.fechaCierre = null;
          if (!p.nombre) p.nombre = '';
          if (!p.notas) p.notas = '';
          if (p.rangoMin === undefined) p.rangoMin = null;
          if (p.rangoMax === undefined) p.rangoMax = null;
          if (!p.identificador) p.identificador = '';
        });
      } catch (e) {
        posiciones = [];
      }
    } else {
      posiciones = [];
    }
    return posiciones;
  }

  function guardarDatos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posiciones));
  }

  // --- CRUD ---
  function crearPosicion(nombre, fechaCreacion, notas, rangoMin, rangoMax, identificador) {
    const nueva = {
      id: generarId(),
      nombre: nombre.trim() || `Posición ${posiciones.length+1}`,
      fechaCreacion: fechaCreacion || ahoraISO(),
      fechaCierre: null,
      notas: notas || '',
      rangoMin: (rangoMin !== undefined && rangoMin !== null && rangoMin !== '') ? parseFloat(rangoMin) : null,
      rangoMax: (rangoMax !== undefined && rangoMax !== null && rangoMax !== '') ? parseFloat(rangoMax) : null,
      identificador: identificador ? identificador.trim() : '',
      fees: []
    };
    posiciones.unshift(nueva); // más reciente arriba
    guardarDatos();
    renderizarListado();
    return nueva;
  }

  function actualizarPosicion(idPosicion, notas, rangoMin, rangoMax, identificador) {
    const pos = posiciones.find(p => p.id === idPosicion);
    if (!pos) return false;
    pos.notas = notas || '';
    pos.rangoMin = (rangoMin !== undefined && rangoMin !== null && rangoMin !== '') ? parseFloat(rangoMin) : null;
    pos.rangoMax = (rangoMax !== undefined && rangoMax !== null && rangoMax !== '') ? parseFloat(rangoMax) : null;
    pos.identificador = identificador ? identificador.trim() : '';
    guardarDatos();
    renderizarListado();
    return true;
  }

  function agregarFee(idPosicion, fecha, monto, nota) {
    const pos = posiciones.find(p => p.id === idPosicion);
    if (!pos) return false;
    if (pos.fechaCierre) {
      alert('Esta posición está cerrada. No se pueden agregar más fees.');
      return false;
    }
    const montoNumerico = parseFloat(monto);
    if (!Number.isFinite(montoNumerico) || montoNumerico < MIN_COLLECT_USD) {
      alert(`El collect manual debe ser de al menos $${MIN_COLLECT_USD.toFixed(2)} USD.`);
      return false;
    }
    const fee = {
      fecha: fecha || ahoraISO(),
      monto: montoNumerico,
      nota: nota || ''
    };
    pos.fees.push(fee);
    guardarDatos();
    renderizarListado();
    return true;
  }

  function cerrarPosicion(idPosicion, fechaCierre) {
    const pos = posiciones.find(p => p.id === idPosicion);
    if (!pos) return false;
    if (pos.fechaCierre) {
      alert('Ya está cerrada.');
      return false;
    }
    pos.fechaCierre = fechaCierre || ahoraISO();
    guardarDatos();
    renderizarListado();
    return true;
  }

  function eliminarPosicion(idPosicion) {
    if (!confirm('¿Eliminar esta posición y todos sus fees?')) return false;
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

      html += `<div class="${claseCard}" data-id="${pos.id}">`;
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
        html += `<button class="btn btn-success btn-sm btn-agregar-fee" data-id="${pos.id}">📥 Collect Fee</button>`;
        html += `<button class="btn btn-warning btn-sm btn-cerrar" data-id="${pos.id}">🔒 Cerrar</button>`;
      }
      html += `<button class="btn btn-secondary btn-sm btn-editar" data-id="${pos.id}">✏️ Editar</button>`;
      html += `<button class="btn btn-danger btn-sm btn-eliminar" data-id="${pos.id}">🗑️ Eliminar</button>`;
      html += `</div>`;

      // Lista de fees (expandible)
      if (numFees > 0) {
        html += `<div class="fee-list">`;
        html += `<strong>Historial de fees:</strong> `;
        pos.fees.forEach((fee, i) => {
          const montoStr = fee.monto ? `$${fee.monto.toFixed(2)}` : '';
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
    modalOverlay.classList.add('active');
  }

  function cerrarModal() {
    modalOverlay.classList.remove('active');
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

    if (posiciones.length === 0) {
      estadisticasEl.innerHTML = `<p class="stats-empty">Todavía no hay posiciones para comparar. Crea una desde la pestaña "📋 Posiciones".</p>`;
      return;
    }

    const filas = posiciones.map(pos => ({ pos, stats: calcularEstadisticas(pos) }))
      .sort((a, b) => b.stats.ingresoDiario - a.stats.ingresoDiario);
    const totalRecaudado = filas.reduce((suma, fila) => suma + fila.stats.total, 0);
    const totalEventos = filas.reduce((suma, fila) => suma + fila.stats.eventos, 0);
    const eventosConMonto = filas.reduce((suma, fila) => suma + fila.pos.fees.filter(fee => fee.monto !== null && fee.monto !== '' && Number.isFinite(Number(fee.monto))).length, 0);
    const promedioGeneral = eventosConMonto ? totalRecaudado / eventosConMonto : null;
    const formatoDias = valor => valor === null ? '—' : `${valor.toFixed(1)} días`;

    const htmlTarjetas = filas.map(({ pos, stats }, indice) => {
      const esTop = indice === 0;
      return `
        <div class="stats-card">
          <div class="stats-card-header">
            <div class="stats-card-title">
              <span class="stats-rank${esTop ? ' top' : ''}">${indice + 1}</span>
              ${escapeHtml(pos.nombre)}
            </div>
            <span class="stats-highlight">${formatearPrecioUsd(stats.ingresoDiario)} / día</span>
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

  // --- Navegación por pestañas ---
  function cambiarPestana(tab) {
    const esPosiciones = tab === 'posiciones';
    document.getElementById('viewPosiciones').classList.toggle('active', esPosiciones);
    document.getElementById('viewEstadisticas').classList.toggle('active', !esPosiciones);
    document.getElementById('tabBtnPosiciones').classList.toggle('active', esPosiciones);
    document.getElementById('tabBtnEstadisticas').classList.toggle('active', !esPosiciones);
    document.getElementById('tabBtnPosiciones').setAttribute('aria-selected', String(esPosiciones));
    document.getElementById('tabBtnEstadisticas').setAttribute('aria-selected', String(!esPosiciones));
    if (!esPosiciones) renderizarEstadisticas();
  }

  // --- Manejo de eventos del modal (delegación) ---
  modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) cerrarModal();
  });

  // --- Formularios específicos ---

  // 1. Nueva posición
  function mostrarFormNuevaPosicion() {
    const ahora = ahoraISO();
    const html = `
      <h2>📌 Nueva Posición</h2>
      <label for="nombrePos">Nombre / Pool (opcional)</label>
      <input type="text" id="nombrePos" placeholder="Ej: Uniswap ETH/USDC" />

      <label for="idPos">ID de posición (opcional)</label>
      <input type="text" id="idPos" placeholder="Ej: Token ID del NFT, #12345" />

      <label for="fechaCreacionPos">Fecha de creación</label>
      <input type="datetime-local" id="fechaCreacionPos" value="${formatearFechaParaInput(ahora)}" />

      <label for="notasPos">Notas (opcional)</label>
      <textarea id="notasPos" placeholder="Observaciones..."></textarea>

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
      const nombre = document.getElementById('nombrePos').value;
      const idExterno = document.getElementById('idPos').value;
      const fecha = document.getElementById('fechaCreacionPos').value;
      const notas = document.getElementById('notasPos').value;
      const rangoMin = document.getElementById('rangoMinPos').value;
      const rangoMax = document.getElementById('rangoMaxPos').value;
      if (!fecha) {
        alert('La fecha de creación es obligatoria.');
        return;
      }
      if (rangoMin !== '' && rangoMax !== '' && parseFloat(rangoMin) > parseFloat(rangoMax)) {
        alert('El mínimo del rango no puede ser mayor que el máximo.');
        return;
      }
      crearPosicion(nombre, fecha, notas, rangoMin, rangoMax, idExterno);
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
      <input type="text" id="notaFee" placeholder="Ej: Comisión semanal" />

      <div class="modal-actions">
        <button class="btn btn-cancel" id="btnCancelarFee">Cancelar</button>
        <button class="btn btn-success" id="btnGuardarFee">Registrar Fee</button>
      </div>
    `;
    abrirModal(html);

    document.getElementById('btnCancelarFee').addEventListener('click', cerrarModal);
    document.getElementById('btnGuardarFee').addEventListener('click', function() {
      const fecha = document.getElementById('fechaFee').value;
      const monto = document.getElementById('montoFee').value;
      const nota = document.getElementById('notaFee').value;
      if (!fecha) {
        alert('La fecha es obligatoria.');
        return;
      }
      if (!Number.isFinite(parseFloat(monto)) || parseFloat(monto) < MIN_COLLECT_USD) {
        alert(`El collect manual debe ser de al menos $${MIN_COLLECT_USD.toFixed(2)} USD.`);
        return;
      }
      if (agregarFee(idPosicion, fecha, monto, nota)) cerrarModal();
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
      const fecha = document.getElementById('fechaCierrePos').value;
      if (!fecha) {
        alert('La fecha de cierre es obligatoria.');
        return;
      }
      cerrarPosicion(idPosicion, fecha);
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
      <input type="text" id="idEdit" placeholder="Ej: Token ID del NFT, #12345" value="${escapeHtml(pos.identificador)}" />

      <label>Rango de precios</label>
      <div class="flex">
        <input type="number" step="any" id="rangoMinEdit" placeholder="Mínimo" value="${pos.rangoMin !== null ? pos.rangoMin : ''}" style="flex:1;" />
        <span class="text-muted">–</span>
        <input type="number" step="any" id="rangoMaxEdit" placeholder="Máximo" value="${pos.rangoMax !== null ? pos.rangoMax : ''}" style="flex:1;" />
      </div>

      <label for="notasEdit">Notas</label>
      <textarea id="notasEdit" placeholder="Observaciones...">${escapeHtml(pos.notas)}</textarea>

      <div class="modal-actions">
        <button class="btn btn-cancel" id="btnCancelarEditar">Cancelar</button>
        <button class="btn" id="btnGuardarEditar">Guardar</button>
      </div>
    `;
    abrirModal(html);

    document.getElementById('btnCancelarEditar').addEventListener('click', cerrarModal);
    document.getElementById('btnGuardarEditar').addEventListener('click', function() {
      const idExterno = document.getElementById('idEdit').value;
      const rangoMin = document.getElementById('rangoMinEdit').value;
      const rangoMax = document.getElementById('rangoMaxEdit').value;
      const notas = document.getElementById('notasEdit').value;
      if (rangoMin !== '' && rangoMax !== '' && parseFloat(rangoMin) > parseFloat(rangoMax)) {
        alert('El mínimo del rango no puede ser mayor que el máximo.');
        return;
      }
      actualizarPosicion(idPosicion, notas, rangoMin, rangoMax, idExterno);
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

  // Botón Nueva Posición
  document.getElementById('btnNuevaPosicion').addEventListener('click', mostrarFormNuevaPosicion);
  document.getElementById('tabBtnPosiciones').addEventListener('click', () => cambiarPestana('posiciones'));
  document.getElementById('tabBtnEstadisticas').addEventListener('click', () => cambiarPestana('estadisticas'));

  // Consulta el último precio negociado de ETH/USDT en Binance.
  async function sincronizarPrecioEth() {
    btnSync.disabled = true;
    btnSync.textContent = '↻ Sincronizando…';
    syncStatusEl.textContent = 'Consultando ETH/USDT en Binance…';

    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT');
      if (!response.ok) throw new Error(`Binance respondió ${response.status}`);

      const data = await response.json();
      const precio = Number(data.price);
      if (!Number.isFinite(precio) || precio <= 0) throw new Error('Binance devolvió un precio inválido');

      precioEth = precio;
      ultimaSincronizacion = ahoraISO();
      renderizarListado();
    } catch (error) {
      console.error('No se pudo sincronizar ETH/USDT:', error);
      syncStatusEl.textContent = 'No se pudo consultar Binance. Verificá tu conexión e intentá nuevamente.';
    } finally {
      btnSync.disabled = false;
      btnSync.textContent = '↻ Sync ETH';
    }
  }

  btnSync.addEventListener('click', sincronizarPrecioEth);

  // --- Inicialización ---
  cargarDatos();
  renderizarListado();

  // Cerrar modal con Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      cerrarModal();
    }
  });

})();
