import { MAX_PRECIO } from './constants.js';
import { state } from './state.js';
import { ahoraISO } from './utils.js';

export async function sincronizarPrecioEth() {
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

    state.precioEth = precio;
    state.ultimaSincronizacion = ahoraISO();
    return { ok: true };
  } catch (error) {
    console.error('No se pudo sincronizar ETH/USDT:', error);
    return { ok: false, error: 'No se pudo consultar Binance. Verificá tu conexión e intentá nuevamente.' };
  } finally {
    clearTimeout(timeout);
  }
}
