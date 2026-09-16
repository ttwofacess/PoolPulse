import { cargarDatos } from './storage.js';
import { renderizarListado, renderizarEstadisticas } from './ui.js';
import { mostrarFormNuevaPosicion, mostrarFormAgregarFee, mostrarFormCerrarPosicion, mostrarFormEditar } from './forms.js';
import { sincronizarPrecioEth } from './api.js';
import { eliminarPosicion, eliminarRegistroEstadisticas } from './crud.js';

const listadoEl = document.getElementById('listadoPosiciones');
const btnSync = document.getElementById('btnSync');
const syncStatusEl = document.getElementById('syncStatus');

cargarDatos();
renderizarListado();

document.getElementById('btnNuevaPosicion').addEventListener('click', mostrarFormNuevaPosicion);

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
    if (eliminarPosicion(id)) renderizarListado();
  }
});

document.getElementById('estadisticasContenido').addEventListener('click', function(e) {
  const target = e.target.closest('.btn-eliminar-estadistica');
  if (!target) return;

  if (eliminarRegistroEstadisticas(target.dataset.id, target.dataset.archivada === 'true')) {
    renderizarEstadisticas();
  }
});

document.getElementById('tabEstadisticas').addEventListener('change', function() {
  if (this.checked) renderizarEstadisticas();
});

btnSync.addEventListener('click', async function() {
  btnSync.disabled = true;
  btnSync.textContent = '↻ Sincronizando…';
  syncStatusEl.textContent = 'Consultando ETH/USDT en Binance…';

  const resultado = await sincronizarPrecioEth();
  if (!resultado.ok) {
    syncStatusEl.textContent = resultado.error;
  } else {
    renderizarListado();
  }

  btnSync.disabled = false;
  btnSync.textContent = '↻ Sync ETH';
});
