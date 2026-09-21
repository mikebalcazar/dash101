/* El estado de cuenta de UN proyecto · contrato 0.39.0 de la suite.
 *
 * Mike, 21-sep: «necesito poder exportar un estado de cuenta en pdf y un
 * excel con lo siguiente de cada proyecto: saldo general, lista de productos
 * en proyecto, subtotal, IVA y total de proyecto completo, movimientos de
 * proyecto (pagos), fecha del día que se genera el status. Creo que esto es
 * lo mismo que el cliente podría descargar desde peek101».
 *
 * AQUÍ NO SE CALCULA NADA. Todos los totales llegan resueltos de la API,
 * que es la misma ruta que abre peek101. Si esta pantalla sumara por su
 * cuenta, el día que una de las dos cambie el documento de la empresa y el
 * del cliente dirían cosas distintas, y el que se daría cuenta es él.
 *
 * Lo único que pasa aquí es la conversión a PESOS, una sola vez, porque
 * este documento se imprime y se manda.
 */

import { pedir } from './api/cliente';
import { apiBase, org } from './fuente';

const aPesos = (centavos: unknown) => Math.round(Number(centavos ?? 0)) / 100;

export interface RenglonDelEstado {
  id: string;
  clave: string | null;
  nombre: string;
  descripcion: string | null;
  tipo: string | null;
  cantidad: number;
  /** En PESOS. */
  precio_unitario: number;
  /** En PESOS. */
  importe: number;
  /** De qué modelo del catálogo es, si está agrupado. */
  producto_nombre: string | null;
  partida: string | null;
  fecha_entrega: string | null;
}

export interface PagoDelEstado {
  id: string;
  fecha: string;
  /** En PESOS. */
  monto: number;
  descripcion: string | null;
  cuenta_nombre: string | null;
  facturado: boolean;
  requiere_factura: boolean;
}

export interface EstadoDelProyecto {
  /** La pone el SERVIDOR, no el reloj de quien imprime. */
  generado_at: string;
  proyecto: { id: string; nombre: string; estado: string; fecha_inicio: string | null; fecha_cierre: string | null };
  cliente: { id: string; nombre: string; rfc: string | null; correo: string | null; telefono: string | null } | null;
  negocio: { id: string; nombre: string; rfc: string | null; moneda: string | null } | null;
  items: RenglonDelEstado[];
  movimientos: PagoDelEstado[];
  /** Todo en PESOS, menos `tasa_iva`, que va en PUNTOS BASE (1600 = 16 %). */
  totales: {
    subtotal: number; iva: number; total: number;
    tasa_iva: number; iva_incluido: boolean;
    cobrado: number; saldo: number; piezas: number;
  };
}

export async function estadoDelProyecto(proyecto_id: string): Promise<EstadoDelProyecto> {
  const r = await pedir<Record<string, any>>(`/orgs/${org()}/proyectos/${encodeURIComponent(proyecto_id)}/estado`);
  return {
    generado_at: String(r.generado_at),
    proyecto: {
      id: String(r.proyecto.id), nombre: String(r.proyecto.nombre ?? ''),
      estado: String(r.proyecto.estado ?? ''),
      fecha_inicio: r.proyecto.fecha_inicio ?? null, fecha_cierre: r.proyecto.fecha_cierre ?? null,
    },
    cliente: r.cliente
      ? { id: String(r.cliente.id), nombre: String(r.cliente.nombre ?? ''), rfc: r.cliente.rfc ?? null,
          correo: r.cliente.correo ?? null, telefono: r.cliente.telefono ?? null }
      : null,
    negocio: r.negocio
      ? { id: String(r.negocio.id), nombre: String(r.negocio.nombre ?? ''), rfc: r.negocio.rfc ?? null,
          moneda: r.negocio.moneda ?? 'MXN' }
      : null,
    items: (r.items ?? []).map((i: Record<string, any>) => ({
      id: String(i.id), clave: i.clave ?? null, nombre: String(i.nombre ?? ''),
      descripcion: i.descripcion ?? null, tipo: i.tipo ?? null,
      cantidad: Number(i.cantidad ?? 1),
      precio_unitario: aPesos(i.precio_unitario), importe: aPesos(i.importe),
      producto_nombre: i.producto_nombre ?? null,
      partida: i.partida ?? null, fecha_entrega: i.fecha_entrega ?? null,
    })),
    movimientos: (r.movimientos ?? []).map((m: Record<string, any>) => ({
      id: String(m.id), fecha: String(m.fecha ?? ''), monto: aPesos(m.monto),
      descripcion: m.descripcion ?? null, cuenta_nombre: m.cuenta_nombre ?? null,
      facturado: Boolean(m.facturado), requiere_factura: Boolean(m.requiere_factura),
    })),
    totales: {
      subtotal: aPesos(r.totales.subtotal), iva: aPesos(r.totales.iva), total: aPesos(r.totales.total),
      tasa_iva: Number(r.totales.tasa_iva ?? 1600), iva_incluido: Boolean(r.totales.iva_incluido),
      cobrado: aPesos(r.totales.cobrado), saldo: aPesos(r.totales.saldo),
      piezas: Number(r.totales.piezas ?? 0),
    },
  };
}

/* ─────────────── el desglose, sólo para la vista previa ───────────────
 *
 * ESTA ES LA ÚNICA CUENTA QUE SE HACE DEL LADO DE LA PANTALLA, y existe por
 * una razón concreta: en «Editar el proyecto», cuando alguien pica «IVA
 * incluido», todavía no hay nada guardado que preguntarle al servidor. Sin
 * esto, la consecuencia de ese botón se vería hasta después de guardar, en
 * un papel que a lo mejor ya se mandó.
 *
 * Es la MISMA fórmula que `estadoDelProyecto` en la API —enteros y puntos
 * base, no 0.16— y está medida contra los mismos casos. El documento sigue
 * saliendo del servidor: esto no lo alimenta, sólo lo anticipa.
 */
export function desglose(
  venta: number,
  iva_incluido: boolean,
  tasa_iva = 1600,
): { subtotal: number; iva: number; total: number } {
  /* En centavos para la cuenta y de vuelta a pesos al final, que es lo que
   * hace el servidor. Hacerla en pesos con decimales es donde aparecen los
   * 0.005 que luego no cuadran contra el papel. */
  const c = Math.round(venta * 100);
  const tasa = Math.max(0, Math.trunc(tasa_iva));
  const subtotal = iva_incluido ? Math.round((c * 10000) / (10000 + tasa)) : c;
  const iva = iva_incluido ? c - subtotal : Math.round((c * tasa) / 10000);
  return { subtotal: subtotal / 100, iva: iva / 100, total: (subtotal + iva) / 100 };
}

/** La liga para bajar el mismo estado de cuenta en Excel.
 *
 *  El archivo lo arma la API —`GET …/estado.xlsx`— y no esta pantalla: lo
 *  baja también el cliente desde peek101, y dos armadores del mismo archivo
 *  es la manera segura de que un día no digan lo mismo.
 *
 *  Va como liga y no como `fetch` + Blob a propósito: el navegador ya sabe
 *  bajar archivos, respeta el nombre que manda la cabecera, y así no queda
 *  un `createObjectURL` que alguien se olvide de revocar. */
export const ligaDelExcel = (proyecto_id: string) =>
  `${apiBase()}/orgs/${org()}/proyectos/${encodeURIComponent(proyecto_id)}/estado.xlsx`;
