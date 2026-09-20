/* La escritura por la API, medida contra STAGING en una org propia.
 *
 * Segunda mitad de la fase 3. Se llama a los módulos de `lib/` con FUENTE=api
 * exactamente como los llaman las pantallas —pesos con decimales, `Date`— y
 * se vuelve a leer con los mismos módulos: lo que se mide es que las cifras
 * que la app enseña después de escribir son las que Firestore habría dejado
 * con sus fórmulas (cobrado, pagado, disponible, margen, saldo, partidas).
 *
 * Corre en una org propia por corrida (`pe-<run>`), que se crea al empezar y
 * se reinicia al terminar con DELETE /admin/orgs/:o (existe solo fuera de
 * producción). La org `demo` no se toca: es la que ven peek101 y las capturas. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Timestamp } from "firebase/firestore";
import { apiBase, fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio, getNegocio, updateNegocio, deleteNegocio } from "@/lib/negocios";
import { createCuenta, listCuentas, updateCuenta, deleteCuenta } from "@/lib/cuentas";
import { createCliente, getCliente, updateCliente, deleteCliente, getClienteUid } from "@/lib/clientes";
import { createProveedor, getProveedor, deleteProveedor } from "@/lib/proveedores";
import { createProyecto, getProyecto, listProyectos, updateProyecto, deleteProyecto } from "@/lib/proyectos";
import { createMovimiento, listMovimientos, deleteMovimiento } from "@/lib/movimientos";
import { createOpex, listOpex, updateOpex, deleteOpex } from "@/lib/opex";
import { activarAccesoPortal, cambiarPinPortal, desactivarAccesoPortal } from "@/lib/portal";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
// Una org por corrida: dos corridas a la vez (dos PR con el flujo de pruebas
// al mismo tiempo) se pisaban la misma org y una borraba la de la otra.
const ORG = `pe-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;
const CORREO_CLIENTE = "prueba.escritura@ejemplo.mx";

let uid = "";
const ids = { negocio: "", banco: "", caja: "", cliente: "", proveedor: "", proyecto: "", ingreso: "", egreso: "", opex: "" };

const dia = (t: unknown) => (t as Timestamp).toDate();

/** Como el cliente, con su propio frasco de galletas, para no pisar la sesión de Mike. */
async function comoCliente(pin: string): Promise<{ entrar: number; peek: number }> {
  const base = apiBase();
  const r = await fetch(`${base}/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json", "X-App": "peek101" }, body: JSON.stringify({ correo: CORREO_CLIENTE, pin }) });
  const galleta = (r.headers.get("set-cookie") ?? "").split(";")[0];
  const p = await fetch(`${base}/orgs/${ORG}/peek`, { headers: { "X-App": "peek101", Cookie: galleta } });
  return { entrar: r.status, peek: p.status };
}

beforeAll(async () => {
  expect(fuente()).toBe("api");
  const salud = await pedir<{ entorno: string }>("/salud");
  expect(salud.entorno).toBe("staging");
  const u = await entrarDePrueba(CORREO);
  uid = u.id;

  // La org de prueba nace limpia: si quedó de una corrida rota, se reinicia.
  process.env.NEXT_PUBLIC_ORG = ORG;
  try {
    await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" });
  } catch {
    /* no existía */
  }
  const alta = await pedir<{ org_db_version: number }>("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de escritura" } });
  /* Las migraciones corren solas al nacer el Durable Object. Lo que esta
   * prueba necesita es que ya estén la 0002 (partidas) y la 0003
   * (conciliaciones); la API sigue agregando (0004 folios, 0005 ajustes) y
   * `toBe(3)` se rompía con cada una sin que dash101 hubiera cambiado
   * (run 35294156632, 18-sep-2026: «expected 5 to be 3»). */
  expect(alta.org_db_version).toBeGreaterThanOrEqual(3);
}, 60000);

afterAll(async () => {
  try {
    await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" });
  } finally {
    process.env.NEXT_PUBLIC_ORG = ORG_ANTES;
  }
});

describe("negocio, cuentas, cliente, proveedor", () => {
  it("se crean con la firma de siempre y se leen con la forma de siempre", async () => {
    ids.negocio = await createNegocio(uid, { nombre: "Taller de prueba", moneda: "MXN", descripcion: "se acepta y no se guarda" });
    const n = await getNegocio(ids.negocio);
    expect(n?.nombre).toBe("Taller de prueba");
    expect(n?.moneda).toBe("MXN");

    ids.banco = await createCuenta(uid, { nombre: "Banco", tipo: "banco", banco: "Ficticio", moneda: "MXN", saldo_inicial: 10000.5, negocio_id: ids.negocio });
    ids.caja = await createCuenta(uid, { nombre: "Caja", tipo: "caja", moneda: "MXN", saldo_inicial: 0, negocio_id: ids.negocio });
    const cuentas = await listCuentas(ids.negocio);
    const banco = cuentas.find((c) => c.id === ids.banco)!;
    expect(banco.saldo_inicial).toBe(10000.5);
    expect(banco.saldo_actual).toBe(10000.5);
    expect(banco.banco).toBe("Ficticio");

    ids.cliente = await createCliente(uid, { nombre: "Cliente de Prueba", email: CORREO_CLIENTE, telefono: "55 1234 5678", negocio_id: ids.negocio });
    const cli = await getCliente(ids.cliente);
    expect(cli?.email).toBe(CORREO_CLIENTE);
    expect(cli?.portal_activo).toBe(false);

    ids.proveedor = await createProveedor(uid, { nombre: "Maderas de Prueba", terminos_pago_default: "15 días", email: "ventas@maderas.ejemplo.mx" });
    const prov = await getProveedor(ids.proveedor);
    expect(prov?.terminos_pago_default).toBe("15 días");
  });

  it("se actualizan y lo que no cambia se queda", async () => {
    await updateNegocio(ids.negocio, { rfc: "XAXX010101000" });
    expect((await getNegocio(ids.negocio))?.rfc).toBe("XAXX010101000");
    await updateCuenta(ids.banco, { nombre: "Banco Principal" });
    const banco = (await listCuentas(ids.negocio)).find((c) => c.id === ids.banco)!;
    expect(banco.nombre).toBe("Banco Principal");
    expect(banco.saldo_inicial).toBe(10000.5);
    await updateCliente(ids.cliente, { notas: "paga puntual" });
    const cli = await getCliente(ids.cliente);
    expect(cli?.notas).toBe("paga puntual");
    expect(cli?.email).toBe(CORREO_CLIENTE);
  });
});

describe("el proyecto: precio, ítems, partidas y los cachés que la API recalcula", () => {
  it("sin ítems, el precio se guarda como un solo ítem con el nombre del proyecto", async () => {
    ids.proyecto = await createProyecto(uid, {
      nombre: "Cocina de prueba", cliente_id: ids.cliente, cliente_nombre: "Cliente de Prueba", negocio_id: ids.negocio, negocio_nombre: "Taller de prueba",
      precio_venta: 5000, partidas: [{ proveedor_id: ids.proveedor, proveedor_nombre: "Maderas de Prueba", concepto: "Tablero", monto_acordado: 1200.75 }],
      estado: "activo", fecha_inicio: new Date(2026, 8, 1),
    });
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.precio_venta).toBe(5000);
    expect(p.items).toHaveLength(1);
    expect(p.items![0].nombre).toBe("Cocina de prueba");
    expect(p.items![0].monto).toBe(5000);
    expect(p.partidas).toHaveLength(1);
    expect(p.partidas[0]).toMatchObject({ monto_acordado: 1200.75, monto_pagado: 0, estado: "pendiente" });
    expect(p.compromiso_total).toBe(1200.75);
    expect(p.margen_proyectado).toBe(5000 - 1200.75);
    expect(p.cobrado).toBe(0);
    expect(p.cliente_nombre).toBe("Cliente de Prueba");
    expect(dia(p.fecha_inicio).getDate()).toBe(1);
  });

  it("un ingreso al producto y un egreso al proveedor: cobrado, pagado, partida y saldos, como Firestore los dejaba", async () => {
    const antes = (await getProyecto(ids.proyecto))!;
    ids.ingreso = await createMovimiento(uid, {
      tipo: "ingreso", monto: 2000, fecha: new Date(2026, 8, 2), cuenta_id: ids.banco, cuenta_nombre: "x", proyecto_id: ids.proyecto, proyecto_nombre: "x",
      contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "Cliente de Prueba",
      producto_id: antes.items![0].id, producto_nombre: "x", negocio_id: ids.negocio, descripcion: "Anticipo",
    });
    ids.egreso = await createMovimiento(uid, {
      tipo: "egreso", monto: 700.25, fecha: new Date(2026, 8, 3), cuenta_id: ids.caja, cuenta_nombre: "x", proyecto_id: ids.proyecto, proyecto_nombre: "x",
      contraparte_id: ids.proveedor, contraparte_tipo: "proveedor", contraparte_nombre: "Maderas de Prueba", negocio_id: ids.negocio, descripcion: "Anticipo tablero",
    });

    const p = (await getProyecto(ids.proyecto))!;
    expect(p.cobrado).toBe(2000);
    expect(p.pagado).toBe(700.25);
    expect(p.disponible).toBe(2000 - 700.25);
    expect(p.items![0].pagado).toBe(2000);
    expect(p.partidas[0]).toMatchObject({ monto_pagado: 700.25, estado: "parcial" });

    const cuentas = await listCuentas(ids.negocio);
    expect(cuentas.find((c) => c.id === ids.banco)!.saldo_actual).toBe(12000.5);
    expect(cuentas.find((c) => c.id === ids.caja)!.saldo_actual).toBe(-700.25);

    const movs = await listMovimientos(ids.negocio);
    expect(movs).toHaveLength(2);
    expect(movs[0].descripcion).toBe("Anticipo tablero"); // el más reciente primero
    expect(movs[0]).toMatchObject({ cuenta_nombre: "Caja", proyecto_nombre: "Cocina de prueba", contraparte_tipo: "proveedor" });
    expect(movs[1]).toMatchObject({ producto_nombre: "Cocina de prueba", contraparte_tipo: "cliente" });
  });

  it("editar: ítems por id, partidas por proveedor; el precio es la suma de los ítems", async () => {
    const antes = (await getProyecto(ids.proyecto))!;
    const cocina = antes.items![0].id;
    await updateProyecto(ids.proyecto, {
      nombre: "Cocina de prueba II",
      precio_venta: 999, // se ignora: hay ítems
      items: [{ id: cocina, nombre: "Cocina", monto: 6000, fecha_entrega: new Date(2026, 9, 15) }, { nombre: "Isla", monto: 1500 }],
      partidas: [{ proveedor_id: ids.proveedor, proveedor_nombre: "Maderas de Prueba", concepto: "Tablero y chapa", monto_acordado: 700.25 }],
      estado: "pausado",
    });
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.nombre).toBe("Cocina de prueba II");
    expect(p.estado).toBe("pausado");
    expect(p.items).toHaveLength(2);
    expect(p.precio_venta).toBe(7500);
    const c = p.items!.find((x) => x.id === cocina)!;
    expect(c.nombre).toBe("Cocina");
    expect(c.pagado).toBe(2000); // el ingreso sigue apuntando al mismo ítem
    expect(dia(c.fecha_entrega).getDate()).toBe(15);
    expect(p.partidas).toHaveLength(1);
    expect(p.partidas[0]).toMatchObject({ concepto: "Tablero y chapa", monto_acordado: 700.25, monto_pagado: 700.25, estado: "pagado" });
    expect(p.compromiso_total).toBe(700.25);
    expect(p.margen_proyectado).toBe(7500 - 700.25);
  });

  it("quitar un producto lo cancela (no se borra) y deja de contar", async () => {
    const antes = (await getProyecto(ids.proyecto))!;
    const cocina = antes.items!.find((x) => x.nombre === "Cocina")!;
    await updateProyecto(ids.proyecto, { items: [{ id: cocina.id, nombre: "Cocina", monto: 6000 }] });
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.items).toHaveLength(1);
    expect(p.precio_venta).toBe(6000);
    const lista = await listProyectos(ids.negocio);
    expect(lista).toHaveLength(1);
    expect(lista[0].negocio_nombre).toBe("Taller de prueba");
  });
});

describe("el portal del cliente", () => {
  it("«abrir portal»: el cliente entra con su PIN y ve su /peek", async () => {
    const cli = (await getCliente(ids.cliente))!;
    const r = await activarAccesoPortal(cli, CORREO_CLIENTE, "480217");
    expect(r.uid).toBeTruthy();
    expect(r.reactivado).toBe(false);
    expect(r.proyectos).toBe(1);
    expect(r.movimientos).toBe(1);
    const despues = (await getCliente(ids.cliente))!;
    expect(despues.portal_activo).toBe(true);
    expect(despues.uid).toBe(r.uid);
    expect(despues.portal_email).toBe(CORREO_CLIENTE);
    expect(await getClienteUid(ids.cliente)).toBe(r.uid);
    expect((await getProyecto(ids.proyecto))!.cliente_uid).toBe(r.uid);
    expect(await comoCliente("480217")).toEqual({ entrar: 200, peek: 200 });
  });

  it("cambiar el PIN aquí mismo: el viejo ya no abre, el nuevo sí", async () => {
    const cli = (await getCliente(ids.cliente))!;
    await cambiarPinPortal(cli, "275913");
    expect((await comoCliente("480217")).entrar).toBe(401);
    expect(await comoCliente("275913")).toEqual({ entrar: 200, peek: 200 });
  });

  it("desactivar cierra la puerta de verdad; reactivar la abre", async () => {
    await desactivarAccesoPortal((await getCliente(ids.cliente))!);
    const apagado = (await getCliente(ids.cliente))!;
    expect(apagado.portal_activo).toBe(false);
    expect(apagado.portal_email).toBe(null);
    expect(await getClienteUid(ids.cliente)).toBe(null);
    expect((await getProyecto(ids.proyecto))!.cliente_uid).toBe(null);
    expect(await comoCliente("275913")).toEqual({ entrar: 200, peek: 403 });

    const r = await activarAccesoPortal(apagado, CORREO_CLIENTE, "275913");
    expect(r.reactivado).toBe(true);
    expect(await comoCliente("275913")).toEqual({ entrar: 200, peek: 200 });
  });

  it("un PIN flojo no pasa", async () => {
    const cli = (await getCliente(ids.cliente))!;
    await expect(cambiarPinPortal(cli, "123456")).rejects.toThrow(/simple/);
  });
});

describe("gastos fijos", () => {
  it("se crean, se editan y se borran, con su cuenta y su estimado", async () => {
    ids.opex = await createOpex(uid, {
      nombre: "Renta", tipo: "egreso", monto: 1800, moneda: "MXN", frecuencia: "mensual", dia_del_mes: 5,
      fecha_inicio: new Date(2026, 0, 5), cuenta_id: ids.banco, cuenta_nombre: "x", activo: true, negocio_id: ids.negocio,
    });
    let o = (await listOpex(ids.negocio)).find((x) => x.id === ids.opex)!;
    expect(o).toMatchObject({ monto: 1800, frecuencia: "mensual", dia_del_mes: 5, cuenta_nombre: "Banco Principal", activo: true });
    await updateOpex(ids.opex, { monto: 1950.5, activo: false });
    o = (await listOpex(ids.negocio)).find((x) => x.id === ids.opex)!;
    expect(o).toMatchObject({ monto: 1950.5, activo: false, dia_del_mes: 5 });
    await deleteOpex(ids.opex);
    expect((await listOpex(ids.negocio)).find((x) => x.id === ids.opex)).toBeUndefined();
  });
});

describe("borrar: lo que se puede, lo que no, y con qué mensaje", () => {
  it("borrar un movimiento recalcula la partida y el saldo", async () => {
    await deleteMovimiento(ids.egreso);
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.pagado).toBe(0);
    expect(p.partidas[0]).toMatchObject({ monto_pagado: 0, estado: "pendiente" });
    expect((await listCuentas(ids.negocio)).find((c) => c.id === ids.caja)!.saldo_actual).toBe(0);
  });

  it("un proyecto con movimientos no se borra, y lo dice; sin ellos, se va y sus ítems quedan cancelados", async () => {
    await expect(deleteProyecto(ids.proyecto)).rejects.toThrow(/1 movimiento/);
    await deleteMovimiento(ids.ingreso);
    await deleteProyecto(ids.proyecto);
    expect(await getProyecto(ids.proyecto)).toBe(null);
    expect(await listProyectos(ids.negocio)).toHaveLength(0);
  });

  it("un cliente con ítems (aunque cancelados) contesta con un mensaje claro, no un 500", async () => {
    await expect(deleteCliente(ids.cliente)).rejects.toThrow(/No se puede borrar el cliente/);
  });

  it("proveedor, cuentas y negocio sí se van", async () => {
    await deleteProveedor(ids.proveedor);
    expect(await getProveedor(ids.proveedor)).toBe(null);
    await deleteCuenta(ids.caja);
    await deleteCuenta(ids.banco);
    expect(await listCuentas(ids.negocio)).toHaveLength(0);
    await deleteNegocio(ids.negocio, uid);
    expect(await getNegocio(ids.negocio)).toBe(null);
  });
});
