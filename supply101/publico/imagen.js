/* La foto del ticket, achicada antes de subir.
 *
 * Mike, 29-sep-2026: «Hay que reducir el consumo de recursos de las apps en
 * MÓVIL. Es crítico.» En supply101 la foto del ticket o de la cotización se
 * subía tal cual sale de la cámara: de 3 a 12 MB por foto, con datos
 * móviles, para un papel que se lee perfectamente a 1600 píxeles de lado.
 * Lo mismo hacen ya quell101 y roster101 con sus fotos.
 *
 * Reglas:
 *   · sólo imágenes; un PDF pasa tal cual;
 *   · nunca se agranda: una foto chica pasa tal cual;
 *   · si el navegador no puede (sin lienzo, formato raro), se sube la
 *     original: una foto grande es mejor que ninguna.
 *
 * Vive aparte de app.js para poder medirla sola en un navegador
 * (pruebas/la-foto-se-achica.mjs). */

export const LADO_MAYOR = 1600;
export const CALIDAD = 0.82;

export async function achicarImagen(archivo, { ladoMayor = LADO_MAYOR, calidad = CALIDAD } = {}) {
  if (!archivo || !archivo.type || !archivo.type.startsWith('image/')) return archivo;
  try {
    const mapa = await createImageBitmap(archivo);
    const escala = Math.min(1, ladoMayor / Math.max(mapa.width, mapa.height));
    if (escala === 1 && archivo.type === 'image/jpeg') { mapa.close?.(); return archivo; }
    const w = Math.max(1, Math.round(mapa.width * escala)), h = Math.max(1, Math.round(mapa.height * escala));
    const lienzo = document.createElement('canvas');
    lienzo.width = w; lienzo.height = h;
    lienzo.getContext('2d').drawImage(mapa, 0, 0, w, h);
    mapa.close?.();
    const blob = await new Promise((res) => lienzo.toBlob(res, 'image/jpeg', calidad));
    if (!blob) return archivo;
    const nombre = (archivo.name || 'foto').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return archivo;
  }
}
