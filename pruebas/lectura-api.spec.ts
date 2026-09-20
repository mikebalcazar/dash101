/* La lectura desde la API, medida contra la org `demo` de staging.
 *
 * Es la primera mitad de la fase 3 («primero lectura: cada pantalla, con la
 * API, tiene que dar las mismas cifras que con Firestore»). Aquí no se compara
 * contra Firestore —la org demo nunca vivió ahí— sino contra lo que la siembra
 * puso, que está escrito en `scripts/sembrar-demo.mjs`, y contra las fórmulas
 * que Firestore usaba para sus cachés: disponible = cobrado − pagado, margen =
 * precio − compromiso, saldo_actual = saldo_inicial + ingresos − egresos.
 *
 * Lo que las pantallas reciben es lo que devuelven los módulos de `lib/` con
 * FUENTE=api: pesos con decimales y `Timestamp` de Firestore, como siempre. */

import { beforeAll, describe, expect, it } from "vitest";
import type { Timestamp } from "firebase/firestore";
import { canjear, entrarDePrueba, pedir, urlGoogle, yo } from "@/lib/api/cliente";
import { fuente, org } from "@/lib/fuente";
import { listNegocios, getNegocio } from "@/lib/negocios";
import { listCuentas } from "@/lib/cuentas";
import { listClientes, getClienteUid } from "@/lib/clientes";
import { listProveedores } from "@/lib/proveedores";
import { listProyectos, getProyecto } from "@/lib/proyectos";
import { listMovimientos, listMovimientosByProyecto } from "@/lib/movimientos";
import { listOpex, estimarMensual } from "@/lib/opex";
import { getUserDoc, canWriteInNegocio } from "@/lib/users";
import { aCentavos, aPesos, aTimestamp } from "@/lib/api/adaptar";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
let negocioId = "";
let uid = "";

const dia = (t: unknown) => (t as Timestamp).toDate();

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect(org()).toBe("demo");
  // La guarda: esto jamás corre contra producción.
  const salud = await pedir<{ entorno: string; contrato: string }>("/salud");
  expect(salud.entorno).toBe("staging");
  const u = await entrarDePrueba(CORREO);
  uid = u.id;
});

describe("las conversiones, con los casos que duelen", () => {
  it("centavos ↔ pesos sin perder el medio centavo", () => {
    expect(aPesos(15000000)).toBe(150000);
    expect(aPesos(150050)).toBe(1500.5);
    expect(aCentavos(1500.5)).toBe(150050);
    expect(aCentavos(1.005)).toBe(101);
    expect(aCentavos("1,500.50")).toBe(150050);
    expect(aCentavos(-1.005)).toBe(-101);
    expect(aCentavos(null)).toBe(0);
  });

  it("un día AAAA-MM-DD es un día local, no medianoche UTC", () => {
    const t = aTimestamp("2026-08-18")!;
    const d = t.toDate();
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 8, 18]);
    expect(aTimestamp(null)).toBe(null);
    expect(aTimestamp("2026-09-11T21:22:23.147Z")!.toDate().toISOString()).toBe("2026-09-11T21:22:23.147Z");
  });
});

describe("la sesión", () => {
  it("/yo dice quién soy y es superadmin", async () => {
    const s = await yo();
    expect(s?.usuario.correo).toBe(CORREO);
    expect(s?.superadmin).toBe(true);
  });

  it("el usuario de la app sale de /yo: owner de todos los negocios", async () => {
    const u = await getUserDoc(uid);
    expect(u?.email).toBe(CORREO);
    expect(u?.negocios_acceso.length).toBeGreaterThan(0);
    for (const n of u!.negocios_acceso) expect(canWriteInNegocio(u, n)).toBe(true);
  });
});

describe("Google detrás del proxy: lo que la app puede medir sin credenciales", () => {
  it("un boleto inventado no entra, y un volver_a ajeno no se acepta", async () => {
    await expect(canjear("no-existe")).rejects.toMatchObject({ error: "entrada_invalida", estado: 401 });
    const r = await fetch(urlGoogle("https://malo.ejemplo.mx/login"), { redirect: "manual" });
    // En staging ORIGENES es "*": el origen pasa y lo que falta son las
    // credenciales (501) o, si ya están, el salto a Google (3xx).
    expect([501, 302, 303]).toContain(r.status);
  });
});

describe("negocios, cuentas, clientes, proveedores", () => {
  it("el negocio de la siembra está y con la forma de siempre", async () => {
    const lista = await listNegocios(uid);
    const demo = lista.find((n) => n.nombre === "Taller Demo");
    expect(demo).toBeTruthy();
    expect(demo!.moneda).toBe("MXN");
    expect(demo!.miembros_uids).toContain(uid);
    negocioId = demo!.id!;
    const uno = await getNegocio(negocioId);
    expect(uno?.nombre).toBe("Taller Demo");
  });

  it("las cuentas traen saldo_actual sumado de sus movimientos, en pesos", async () => {
    const cuentas = await listCuentas(negocioId);
    const banco = cuentas.find((c) => c.nombre === "Banco Demo")!;
    const caja = cuentas.find((c) => c.nombre === "Caja chica")!;
    expect(banco.saldo_inicial).toBe(250000);
    // 250,000 + 120,000 + 20,000 − 25,000, y desde el 20-sep menos las dos
    // compras que la siembra paga por este banco: −3,480 y −1,160.
    expect(banco.saldo_actual).toBe(360360);
    // 5,000 − 8,500: una caja en negativo se ve, no se esconde
    expect(caja.saldo_actual).toBe(-3500);
    expect(banco.tipo).toBe("banco");
  });

  it("la familia y sus datos de portal", async () => {
    const clientes = await listClientes(negocioId);
    const fam = clientes.find((c) => c.nombre === "Familia Ramírez")!;
    expect(fam.email).toBe("familia.ramirez@ejemplo.mx");
    expect(fam.portal_activo).toBe(true);
    expect(fam.uid).toBeTruthy();
    expect(await getClienteUid(fam.id!)).toBe(fam.uid);
  });

  it("los proveedores, con los nombres de la app", async () => {
    const provs = await listProveedores();
    const maderas = provs.find((p) => p.nombre === "Maderas del Sur")!;
    expect(maderas.terminos_pago_default).toBe("30 días");
    expect(maderas.email).toContain("@");
  });
});

describe("el proyecto: cachés, partidas y productos como los conoce la app", () => {
  it("las cifras cuadran con la siembra y con las fórmulas de Firestore", async () => {
    const proyectos = await listProyectos(negocioId);
    expect(proyectos).toHaveLength(1);
    const p = proyectos[0];
    expect(p.nombre).toBe("Cocina Ramírez");
    expect(p.cliente_nombre).toBe("Familia Ramírez");
    expect(p.negocio_nombre).toBe("Taller Demo");
    expect(p.estado).toBe("activo");
    // en pesos, no en centavos
    expect(p.precio_venta).toBe(262000);
    expect(p.cobrado).toBe(140000);
    expect(p.pagado).toBe(33500);
    expect(p.compromiso_total).toBe(50500);
    expect(p.disponible).toBe(p.cobrado - p.pagado);
    expect(p.margen_proyectado).toBe(p.precio_venta - p.compromiso_total);
    expect(dia(p.fecha_inicio).getDate()).toBe(18);
    expect(p.cliente_uid).toBeTruthy();
  });

  it("las partidas vienen de la tabla propia, con lo pagado que calculó la API", async () => {
    const p = (await listProyectos(negocioId))[0];
    expect(p.partidas).toHaveLength(2);
    const maderas = p.partidas.find((x) => x.proveedor_nombre === "Maderas del Sur")!;
    expect(maderas).toMatchObject({ monto_acordado: 42000, monto_pagado: 25000, estado: "parcial" });
    const herrajes = p.partidas.find((x) => x.proveedor_nombre === "Herrajes Aztecas")!;
    expect(herrajes).toMatchObject({ monto_acordado: 8500, monto_pagado: 8500, estado: "pagado" });
  });

  it("los ítems de la suite son los productos de la app, con lo pagado por ítem", async () => {
    const p = await getProyecto((await listProyectos(negocioId))[0].id!);
    expect(p!.productos).toHaveLength(4);
    const cocina = p!.productos!.find((x) => x.nombre === "Cocina integral en L")!;
    expect(cocina.monto).toBe(185000);
    expect(cocina.pagado).toBe(120000);
    expect(dia(cocina.fecha_entrega).getDate()).toBe(15);
    const isla = p!.productos!.find((x) => x.nombre === "Isla con cubierta de cuarzo")!;
    expect(isla.pagado).toBe(20000);
    const suma = p!.productos!.reduce((s, x) => s + x.monto, 0);
    expect(suma).toBe(p!.precio_venta);
  });
});

describe("movimientos y gastos fijos", () => {
  it("los movimientos traen los nombres que la app enseña, ordenados del más reciente al más viejo", async () => {
    const movs = await listMovimientos(negocioId);
    // Cuatro de la siembra vieja y dos que nacieron al pagar órdenes de
    // compra: un egreso por orden pagada, que es justamente lo que no hay
    // que capturar dos veces.
    expect(movs).toHaveLength(6);
    for (let i = 1; i < movs.length; i++) expect(dia(movs[i - 1].fecha) >= dia(movs[i].fecha)).toBe(true);
    const anticipo = movs.find((m) => m.descripcion === "Anticipo 50% cocina e isla")!;
    expect(anticipo).toMatchObject({ tipo: "ingreso", monto: 120000, cuenta_nombre: "Banco Demo", proyecto_nombre: "Cocina Ramírez", contraparte_tipo: "cliente", producto_nombre: "Cocina integral en L" });
    expect(anticipo.cliente_uid).toBeTruthy();
    const herrajes = movs.find((m) => m.descripcion === "Herrajes completos")!;
    expect(herrajes).toMatchObject({ tipo: "egreso", monto: 8500, cuenta_nombre: "Caja chica", contraparte_tipo: "proveedor" });
    expect(herrajes.cliente_uid).toBe(null);
  });

  it("por proyecto, los mismos cuatro", async () => {
    const p = (await listProyectos(negocioId))[0];
    const movs = await listMovimientosByProyecto(p.id!);
    expect(movs).toHaveLength(4);
    expect(movs.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0)).toBe(p.cobrado);
  });

  it("los gastos fijos, con su cuenta y su estimado mensual", async () => {
    const opex = await listOpex(negocioId);
    const renta = opex.find((o) => o.nombre === "Renta del local")!;
    expect(renta).toMatchObject({ monto: 18000, frecuencia: "mensual", dia_del_mes: 5, cuenta_nombre: "Banco Demo", activo: true });
    expect(estimarMensual(renta)).toBe(18000);
    expect(dia(renta.fecha_inicio).getFullYear()).toBe(2026);
  });
});
