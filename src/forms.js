import { MIN_COLLECT_USD } from './constants.js';
import { state } from './state.js';
import { ahoraISO, formatearFechaParaInput, escapeHtml, escapeAttr, aNumeroFinito } from './utils.js';
import { crearPosicion, agregarFee, cerrarPosicion, actualizarPosicion } from './crud.js';
import { abrirModal, cerrarModal, renderizarListado } from './ui.js';

export function mostrarFormNuevaPosicion() {
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
    renderizarListado();
  });
}

export function mostrarFormAgregarFee(idPosicion) {
  const pos = state.posiciones.find(p => p.id === idPosicion);
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
    renderizarListado();
  });
}

export function mostrarFormCerrarPosicion(idPosicion) {
  const pos = state.posiciones.find(p => p.id === idPosicion);
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
    renderizarListado();
  });
}

export function mostrarFormEditar(idPosicion) {
  const pos = state.posiciones.find(p => p.id === idPosicion);
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
    renderizarListado();
  });
}
