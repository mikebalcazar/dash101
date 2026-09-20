/* Escritura en `suite101-api`, con la misma firma que los módulos de `lib/`.
 *
 * Es la segunda mitad de la fase 3. Cada función recibe lo mismo que recibía
 * su gemela de Firestore —pesos con decimales, `Date`— y lo traduce a lo que
 * la API guarda: centavos enteros y días `AAAA-MM-DD`. Lo que en Firestore era
 * caché (`saldo_actual`, `cobrado`, `compromiso_total`, `monto_pagado`…) aquí
 * no se manda: la API lo recalcula sola después de cada escritura y, si se le
 * manda, contesta `403 campo_no_permitido`.
 *
 * Tres reglas que no estaban en Firestore y aquí sí:
 *
 *   1. **El precio de venta es la suma de los ítems.** En la suite lo que se
 *      vende son ítems (`items`), y `proyectos.precio_venta` es un caché. Un
 *      proyecto capturado con precio y sin productos se guarda como UN ítem
 *      con el nombre del proyecto y ese monto: es la misma venta, dicha como
 *      la suite la dice. Con productos, el precio es su suma y lo que diga el
 *      campo «precio» se ignora (la pantalla ya avisa «≠ precio venta»).
 *   2. **Un ítem no se borra: se cancela.** Quitar un producto del proyecto lo
 *      deja en `estado: 'cancelado'`; la lectura ya no lo enseña y la API no
 *      lo suma.
 *   3. **Lo que tiene filas colgando no se borra.** Las llaves foráneas del
 *      OrgDB se aplican: un proyecto con movimientos, un cliente con ítems,
 *      una cuenta con movimientos contestan `409 en_uso`. Aquí se convierte en
 *      un mensaje que la pantalla puede enseñar tal cual. */

import * as A from './adaptar';
import { ErrorApi, listar, listarCompleto, obtener, pedir } from './cliente';
import { org } from '../fuente';
import type { CuentaInput } from '../cuentas';
import type { ClienteInput } from '../clientes';
import type { NegocioInput } from '../negocios';
import type { ProveedorInput } from '../proveedores';
import type { ProyectoInput, PartidaProyectoInput, ProductoProyectoInput } from '../proyectos';
import type { MovimientoInput } from '../movimientos';
import type { OpexInput } from '../opex';
import type { EstadoProyecto } from '@/types/schema';

/* ─────────────── lo básico ─────────────── */

const ruta = (tabla: string, id?: string) => `/orgs/${org()}/${tabla}${id ? '/' + encodeURIComponent(id) : ''}`;

/** Quita las llaves `undefined`: un PATCH manda solo lo que cambia. */
function limpio(datos: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos)) if (v !== undefined) r[k] = v;
  return r;
}

const QUE: Record<string, string> = {
  negocios: 'el negocio', cuentas: 'la cuenta', clientes: 'el cliente', proveedores: 'el proveedor',
  proyectos: 'el proyecto', items: 'el producto', partidas: 'la partida', movimientos: 'el movimiento', opex: 'el gasto fijo',
};

/** Los errores de la API, dichos como la pantalla los puede enseñar. */
function enClaro(e: unknown, tabla: string): never {
  if (e instanceof ErrorApi) {
    const d = (e.detalle ?? {}) as Record<string, unknown>;
    switch (e.error) {
      case 'en_uso':
        throw new Error(`No se puede borrar ${QUE[tabla] ?? tabla}: hay movimientos, productos o proyectos que dependen de él. Quítalos o cancélalos primero.`);
      case 'no_encontrado':
        throw new Error(`No se encontró ${QUE[tabla] ?? tabla}.`);
      case 'sin_permiso':
        throw new Error(`No tienes permiso para esto${d.motivo ? `: ${String(d.motivo)}` : '.'}`);
      case 'campo_no_permitido':
        throw new Error(`La API no deja escribir ${String((d.campos as string[])?.join(', '))} en ${tabla}.`);
      case 'dinero_no_entero':
        throw new Error(`Monto inválido en ${String(d.campo)}: ${String(d.recibido)}.`);
      case 'datos_invalidos':
        throw new Error(`Faltan datos${d.falta ? `: ${String(Array.isArray(d.falta) ? d.falta.join(', ') : d.falta)}` : ''}${d.pin ? `: ${String(d.pin)}` : ''}.`);
      case 'sin_sesion':
        throw new Error('La sesión terminó. Vuelve a entrar.');
    }
  }
  throw e;
}

async function crear<T extends { id: string }>(tabla: string, datos: Record<string, unknown>): Promise<T> {
  try {
    return await pedir<T>(ruta(tabla), { method: 'POST', body: limpio(datos) });
  } catch (e) {
    return enClaro(e, tabla);
  }
}

async function cambiar<T>(tabla: string, id: string, datos: Record<string, unknown>): Promise<T> {
  try {
    return await pedir<T>(ruta(tabla, id), { method: 'PATCH', body: limpio(datos) });
  } catch (e) {
    return enClaro(e, tabla);
  }
}

async function borrar(tabla: string, id: string): Promise<void> {
  try {
    await pedir(ruta(tabla, id), { method: 'DELETE' });
  } catch (e) {
    enClaro(e, tabla);
  }
}

const dia = (d: Date | null | undefined): string | null => (d ? A.aDia(d) : null);
const oNulo = (s: string | null | undefined): string | null => (s === undefined || s === null || s === '' ? null : s);

/* ─────────────── negocios ─────────────── */

/** `descripcion` no existe en la suite; se acepta y no se guarda. */
export async function createNegocio(_uid: string, d: NegocioInput): Promise<string> {
  const f = await crear<A.FilaNegocio>('negocios', { nombre: d.nombre, rfc: oNulo(d.rfc), moneda: d.moneda });
  return f.id;
}

export async function updateNegocio(id: string, d: Partial<NegocioInput>): Promise<void> {
  await cambiar('negocios', id, {
    nombre: d.nombre, rfc: d.rfc === undefined ? undefined : oNulo(d.rfc), moneda: d.moneda,
    dia_conciliacion: d.dia_conciliacion,
  });
}

export async function deleteNegocio(id: string): Promise<void> {
  await borrar('negocios', id);
}

/* ─────────────── cuentas ─────────────── */

/** `numero` no existe en la suite; se acepta y no se guarda. */
export async function createCuenta(_uid: string, d: CuentaInput): Promise<string> {
  const f = await crear<A.FilaCuenta>('cuentas', {
    negocio_id: d.negocio_id, nombre: d.nombre, tipo: d.tipo, banco: oNulo(d.banco), moneda: d.moneda,
    saldo_inicial: A.aCentavos(d.saldo_inicial),
  });
  return f.id;
}

export async function updateCuenta(id: string, d: Partial<Omit<CuentaInput, 'negocio_id' | 'saldo_inicial'>>): Promise<void> {
  await cambiar('cuentas', id, { nombre: d.nombre, tipo: d.tipo, banco: d.banco === undefined ? undefined : oNulo(d.banco), moneda: d.moneda });
}

export async function deleteCuenta(id: string): Promise<void> {
  await borrar('cuentas', id);
}

/* ─────────────── clientes ─────────────── */

export async function createCliente(_uid: string, d: ClienteInput): Promise<string> {
  const f = await crear<A.FilaCliente>('clientes', {
    negocio_id: d.negocio_id, nombre: d.nombre, correo: oNulo(d.email), telefono: oNulo(d.telefono), rfc: oNulo(d.rfc), notas: oNulo(d.notas),
  });
  return f.id;
}

/** Juntar dos clientes en uno (contrato 0.23.0). `queda` se queda con todo y
 *  `seVa` desaparece: sus proyectos, ítems, cotizaciones y movimientos pasan
 *  al primero, y lo que a éste le falte —correo, teléfono, RFC, notas, el
 *  acceso al portal— se lo hereda. No se deshace, y la API sólo se lo deja
 *  hacer al dueño y a la administración. */
export async function fusionarClientes(queda: string, seVa: string): Promise<{ movidos: Record<string, number> }> {
  try {
    const r = await pedir<{ movidos: Record<string, number> }>(`${ruta('clientes', queda)}/fusionar`, {
      method: 'POST',
      body: { se_va_id: seVa },
    });
    return r;
  } catch (e) {
    return enClaro(e, 'clientes');
  }
}

export async function updateCliente(id: string, d: Partial<Omit<ClienteInput, 'negocio_id'>>): Promise<void> {
  await cambiar('clientes', id, {
    nombre: d.nombre,
    correo: d.email === undefined ? undefined : oNulo(d.email),
    telefono: d.telefono === undefined ? undefined : oNulo(d.telefono),
    rfc: d.rfc === undefined ? undefined : oNulo(d.rfc),
    notas: d.notas === undefined ? undefined : oNulo(d.notas),
  });
}

export async function deleteCliente(id: string): Promise<void> {
  await borrar('clientes', id);
}

/** POST /clientes/:id/acceso: la API crea (o encuentra) al usuario, le pone el
 *  PIN y prende el acceso. Volver a llamarlo con otro PIN lo cambia. */
export async function darAccesoPortal(clienteId: string, correo: string, pin: string): Promise<{ usuario_id: string; correo: string }> {
  try {
    return await pedir<{ usuario_id: string; correo: string }>(ruta('clientes', clienteId) + '/acceso', { method: 'POST', body: { correo, pin } });
  } catch (e) {
    return enClaro(e, 'clientes');
  }
}

/** DELETE /clientes/:id/acceso: apaga el acceso; el usuario y su PIN se quedan
 *  para poder reactivar. */
export async function quitarAccesoPortal(clienteId: string): Promise<void> {
  try {
    await pedir(ruta('clientes', clienteId) + '/acceso', { method: 'DELETE' });
  } catch (e) {
    enClaro(e, 'clientes');
  }
}

/* ─────────────── proveedores ─────────────── */

export async function createProveedor(_uid: string, d: ProveedorInput): Promise<string> {
  const f = await crear<A.FilaProveedor>('proveedores', {
    nombre: d.nombre, rfc: oNulo(d.rfc), categoria: oNulo(d.categoria), correo: oNulo(d.email), telefono: oNulo(d.telefono),
    terminos_pago: oNulo(d.terminos_pago_default), notas: oNulo(d.notas),
  });
  return f.id;
}

export async function updateProveedor(id: string, d: Partial<ProveedorInput>): Promise<void> {
  const o = (v: string | undefined) => (v === undefined ? undefined : oNulo(v));
  await cambiar('proveedores', id, {
    nombre: d.nombre, rfc: o(d.rfc), categoria: o(d.categoria), correo: o(d.email), telefono: o(d.telefono),
    terminos_pago: o(d.terminos_pago_default), notas: o(d.notas),
  });
}

export async function deleteProveedor(id: string): Promise<void> {
  await borrar('proveedores', id);
}

/* ─────────────── proyectos, con sus ítems y sus partidas ─────────────── */

/** Cuántas piezas iguales. Uno cuando no se dice, y nunca cero ni fracción:
 *  media puerta no existe, y cero dejaría la cuenta de «sin ubicar» en
 *  negativo del lado de quell101. */
const cantidadDe = (p: ProductoProyectoInput): number =>
  p.cantidad && p.cantidad > 0 ? Math.trunc(p.cantidad) : 1;

function filaItem(p: ProductoProyectoInput, proyecto: { id: string; negocio_id: string; cliente_id: string }): Record<string, unknown> {
  return {
    negocio_id: proyecto.negocio_id, cliente_id: proyecto.cliente_id, proyecto_id: proyecto.id,
    nombre: p.nombre, descripcion: oNulo(p.descripcion), monto: A.aCentavos(p.monto),
    cantidad: cantidadDe(p), moneda: 'MXN', estado: 'vendido',
    tipo: 'mueble', fecha_entrega: dia(p.fecha_entrega),
  };
}

function filaPartida(p: PartidaProyectoInput, proyectoId: string): Record<string, unknown> {
  return {
    proyecto_id: proyectoId, proveedor_id: oNulo(p.proveedor_id), proveedor_nombre: oNulo(p.proveedor_nombre),
    concepto: oNulo(p.concepto), monto_acordado: A.aCentavos(p.monto_acordado),
  };
}

/** Regla 1: si NO se dicen productos, el precio es un solo ítem con el nombre
 *  del proyecto. Así un proyecto capturado «a precio cerrado» tiene algo que
 *  enseñarle al cliente en su portal.
 *
 *  UNA LISTA VACÍA NO ES «NO SE DIJERON»: es «no hay ninguno», y hay que
 *  respetarla. Hasta el 20-sep las dos cosas se trataban igual, y por eso
 *  borrar todos los ítems de un proyecto y guardar los revivía como uno solo
 *  con el precio entero. Mike lo reportó con las palabras exactas: «no hay
 *  manera de borrar ítems», y «al guardar los duplica y los suma» —porque
 *  después de revivir ese ítem fantasma, al volver a capturar los suyos
 *  quedaban los suyos MÁS el fantasma, y el precio contaba doble—. */
function productosOPrecio(nombre: string, precio: number, productos: ProductoProyectoInput[] | undefined): ProductoProyectoInput[] {
  if (productos !== undefined) return productos;
  if (precio > 0) return [{ nombre, monto: precio }];
  return [];
}

export async function createProyecto(_uid: string, d: ProyectoInput): Promise<string> {
  const f = await crear<A.FilaProyecto>('proyectos', {
    negocio_id: d.negocio_id, cliente_id: d.cliente_id, nombre: d.nombre, descripcion: oNulo(d.descripcion), estado: d.estado,
    fecha_inicio: dia(d.fecha_inicio), fecha_fin_estimada: dia(d.fecha_fin_estimada),
  });
  const donde = { id: f.id, negocio_id: d.negocio_id, cliente_id: d.cliente_id };
  for (const p of productosOPrecio(d.nombre, d.precio_venta, d.productos)) await crear('items', filaItem(p, donde));
  for (const p of d.partidas) await crear('partidas', filaPartida(p, f.id));
  return f.id;
}

export async function updateProyecto(
  id: string,
  d: {
    nombre?: string; descripcion?: string; precio_venta?: number; partidas?: PartidaProyectoInput[];
    productos?: ProductoProyectoInput[]; estado?: EstadoProyecto; fecha_inicio?: Date; fecha_fin_estimada?: Date | null;
  },
): Promise<void> {
  const actual = await obtener<A.FilaProyecto>('proyectos', id);
  if (!actual) throw new Error('Proyecto no encontrado');
  const donde = { id, negocio_id: actual.negocio_id, cliente_id: actual.cliente_id };

  await cambiar('proyectos', id, {
    nombre: d.nombre, descripcion: d.descripcion === undefined ? undefined : oNulo(d.descripcion), estado: d.estado,
    fecha_inicio: d.fecha_inicio === undefined ? undefined : dia(d.fecha_inicio),
    fecha_fin_estimada: d.fecha_fin_estimada === undefined ? undefined : dia(d.fecha_fin_estimada),
  });

  /* Ítems: por id. Los que vienen con id se actualizan, los que no se crean,
   * los que ya no vienen se quitan.
   *
   * TRES COSAS QUE SE APRENDIERON A GOLPES (Mike lo reportó tres veces el
   * 20-sep: «sigue agregando todo lo que aparece en la lista de ítems; no hay
   * forma de quitar/eliminar ítems»):
   *
   * 1. LA LISTA SE PIDE SÓLO DE LOS VIVOS. La API tope cada lista en 500
   *    filas, ordenadas por fecha de creación. Un proyecto al que se le
   *    editan los ítems varias veces va dejando cancelados, y el día que
   *    cancelados + vivos pasan de 500, los vivos RECIENTES se caen del tope:
   *    sus ids ya no aparecen aquí, la rama de abajo los toma por nuevos y
   *    los CREA otra vez. Eso es exactamente lo que se veía: cada guardado
   *    agregaba copias y nada se podía quitar. Pidiendo `estado=vendido` los
   *    cancelados no ocupan lugar en el tope.
   *
   * 2. UN ID QUE LA PANTALLA MANDA NUNCA SE CONVIERTE EN UNA COPIA. Si trae
   *    id pero no está en la lista, se intenta ACTUALIZARLO; sólo si la API
   *    dice que no existe se crea. Un id que existe jamás se duplica, aunque
   *    la lista venga incompleta por lo que sea.
   *
   * 3. LO QUE SE QUITA SE SIGUE CANCELANDO, y está bien que así sea: la API
   *    contesta 403 `items_nunca_se_borran` a propósito, porque un ítem
   *    borrado deja el historial y el saldo sin cuadrar y nadie sabría por
   *    qué. Lo que estaba mal no era cancelar: era CONTAR los cancelados
   *    contra el tope de 500 (punto 1) y tomar por nuevo un id que no salía
   *    en esa lista (punto 2). */
  /* `listarCompleto`, no `listar`: si de los vivos llegaran sólo los
   * primeros 500, los que se quedaran fuera no aparecerían en `porId`, la
   * pantalla los mandaría con id y —por el punto 2— se intentaría
   * actualizarlos uno por uno. Funcionaría, pero el barrido de abajo
   * («los que ya no vienen se cancelan») no los vería, y un ítem quitado
   * seguiría vivo. Mejor tronar que guardar a medias. */
  const vivos = await listarCompleto<A.FilaItem>('items', { proyecto_id: id, estado: 'vendido' });
  if (d.productos !== undefined || (d.precio_venta !== undefined && vivos.length === 0)) {
    const quiere = productosOPrecio(d.nombre ?? actual.nombre, d.precio_venta ?? A.aPesos(actual.precio_venta), d.productos);
    const porId = new Map(vivos.map((i) => [i.id, i]));
    const quedan = new Set<string>();
    for (const p of quiere) {
      const campos = {
        nombre: p.nombre, descripcion: oNulo(p.descripcion), monto: A.aCentavos(p.monto),
        cantidad: cantidadDe(p), fecha_entrega: dia(p.fecha_entrega),
      };
      if (!p.id) { await crear('items', filaItem(p, donde)); continue; }
      quedan.add(p.id);
      if (porId.has(p.id)) { await cambiar('items', p.id, campos); continue; }
      // Trae id pero no salió en la lista: se intenta actualizar; si de veras
      // no existe —lo borró alguien más entre que se abrió la pantalla y se
      // guardó—, entonces sí es uno nuevo.
      try {
        await cambiar('items', p.id, { ...campos, estado: 'vendido' });
      } catch {
        await crear('items', filaItem(p, donde));
      }
    }
    for (const i of vivos) if (!quedan.has(i.id)) await cambiar('items', i.id, { estado: 'cancelado' });
  }

  /* Partidas: por proveedor, como lo hacía Firestore. La primera partida que
   * viene de un proveedor toma la primera fila de ese proveedor; las filas
   * que sobran se borran (sí se pueden: nada cuelga de una partida). */
  if (d.partidas !== undefined) {
    const filas = await listar<A.FilaPartida>('partidas', { proyecto_id: id });
    const porProveedor = new Map<string, A.FilaPartida[]>();
    for (const f of filas) {
      const k = f.proveedor_id ?? '';
      porProveedor.set(k, [...(porProveedor.get(k) ?? []), f]);
    }
    for (const p of d.partidas) {
      const fila = porProveedor.get(p.proveedor_id)?.shift();
      if (fila) {
        await cambiar('partidas', fila.id, { proveedor_nombre: oNulo(p.proveedor_nombre), concepto: oNulo(p.concepto), monto_acordado: A.aCentavos(p.monto_acordado) });
      } else {
        await crear('partidas', filaPartida(p, id));
      }
    }
    for (const sobran of porProveedor.values()) for (const f of sobran) await borrar('partidas', f.id);
  }
}

/** Regla 3: un proyecto con movimientos no se borra; se cierra. Sin ellos, sus
 *  partidas se van, sus ítems se cancelan y se sueltan, y el proyecto se va. */
export async function deleteProyecto(id: string): Promise<void> {
  const movs = await listar<A.FilaMovimiento>('movimientos', { proyecto_id: id });
  if (movs.length) {
    throw new Error(`Este proyecto tiene ${movs.length} movimiento${movs.length === 1 ? '' : 's'}: con la API no se borra un proyecto con movimientos. Cámbialo a «Cerrado».`);
  }
  for (const p of await listar<A.FilaPartida>('partidas', { proyecto_id: id })) await borrar('partidas', p.id);
  for (const i of await listar<A.FilaItem>('items', { proyecto_id: id })) await cambiar('items', i.id, { estado: 'cancelado', proyecto_id: null });
  await borrar('proyectos', id);
}

/* ─────────────── movimientos ─────────────── */

/** Los nombres denormalizados (`cuenta_nombre`, `proyecto_nombre`,
 *  `producto_nombre`) no se guardan: la lectura los arma. `producto_id` es
 *  `item_id`. Los cachés (saldo, cobrado, partidas) los recalcula la API. */
export async function createMovimiento(_uid: string, d: MovimientoInput): Promise<string> {
  const f = await crear<A.FilaMovimiento>('movimientos', {
    negocio_id: d.negocio_id, tipo: d.tipo, monto: A.aCentavos(d.monto), fecha: A.aDia(d.fecha), cuenta_id: d.cuenta_id,
    proyecto_id: oNulo(d.proyecto_id), item_id: oNulo(d.producto_id),
    contraparte_tipo: d.contraparte_tipo, contraparte_id: oNulo(d.contraparte_id), contraparte_nombre: oNulo(d.contraparte_nombre),
    transfer_id: oNulo(d.transfer_id), descripcion: oNulo(d.descripcion), categoria: oNulo(d.categoria),
  });
  return f.id;
}

/** Si es parte de una transferencia, se van los dos. */
export async function deleteMovimiento(id: string): Promise<void> {
  const m = await obtener<A.FilaMovimiento>('movimientos', id);
  if (!m) return;
  if (m.transfer_id) {
    const par = (await listar<A.FilaMovimiento>('movimientos', { negocio_id: m.negocio_id })).filter((x) => x.transfer_id === m.transfer_id);
    for (const x of par) await borrar('movimientos', x.id);
  } else {
    await borrar('movimientos', id);
  }
}

/* ─────────────── opex ─────────────── */

/** `cuenta_nombre` y `descripcion` no se guardan: el nombre se arma al leer y
 *  la suite no tiene descripción de gasto fijo. */
export async function createOpex(_uid: string, d: OpexInput): Promise<string> {
  const f = await crear<A.FilaOpex>('opex', {
    negocio_id: d.negocio_id, nombre: d.nombre, tipo: d.tipo, monto: A.aCentavos(d.monto), moneda: d.moneda, frecuencia: d.frecuencia,
    dia_semana: d.dia_semana ?? null, dia_del_mes: d.dia_del_mes ?? null, fecha_inicio: A.aDia(d.fecha_inicio), fecha_fin: dia(d.fecha_fin),
    cuenta_id: oNulo(d.cuenta_id), categoria: oNulo(d.categoria), activo: d.activo,
  });
  return f.id;
}

export async function updateOpex(id: string, d: Partial<Omit<OpexInput, 'negocio_id'>>): Promise<void> {
  await cambiar('opex', id, {
    nombre: d.nombre, tipo: d.tipo, monto: d.monto === undefined ? undefined : A.aCentavos(d.monto), moneda: d.moneda, frecuencia: d.frecuencia,
    dia_semana: d.dia_semana, dia_del_mes: d.dia_del_mes,
    fecha_inicio: d.fecha_inicio === undefined ? undefined : A.aDia(d.fecha_inicio),
    fecha_fin: d.fecha_fin === undefined ? undefined : dia(d.fecha_fin),
    cuenta_id: d.cuenta_id === undefined ? undefined : oNulo(d.cuenta_id),
    categoria: d.categoria === undefined ? undefined : oNulo(d.categoria), activo: d.activo,
  });
}

export async function deleteOpex(id: string): Promise<void> {
  await borrar('opex', id);
}
