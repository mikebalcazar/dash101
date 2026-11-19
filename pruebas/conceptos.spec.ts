/* El precio del proyecto por aparte de los ítems, desde dash101 · contrato 0.105.0
 *
 * Mike, 18-nov-2026: «Vamos a separar la contabilidad. Ya no va a ir ligada
 * a los ítems.» Con botones: conceptos de cobro con opción a importar de las
 * cotizaciones del proyecto de quote, un concepto por renglón, y la segunda
 * cotización como un grupo que suma. Y «poner en dash los pagos pendientes de
 * cada proyecto a cada contratista».
 *
 * Mide la capa que usan las pantallas, contra staging: que el dinero vaya y
 * venga en PESOS, que la importación agrupe como se pidió, y que lo que se
 * debe a los contratistas sea lo acordado menos lo pagado.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiBase, fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto } from "@/lib/proyectos";
import { createProveedor } from "@/lib/proveedores";
import {
  borrarConcepto, borrarPlantilla, cambiarConcepto, cotizacionesParaImportar, crearConcepto, crearPlantilla, guardarHoja, importarCotizacion,
  listarConceptos, listarPlantillas, pagosPendientes,
} from "@/lib/conceptos";
import { estadoDelProyecto } from "@/lib/estado-proyecto";
import { agrupar } from "@/components/conceptos-de-cobro";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `cc-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { cliente: "", proyecto: "", proveedor: "", cot1: "", cot2: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;
  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Conceptos de cobro", apps: { dash: true, cotizador: true } } });
  ids.cliente = await createCliente(uid, { nombre: "Familia Ruiz" });
  ids.proveedor = await createProveedor(uid, { nombre: "Herrería Juárez" } as never);
  ids.proyecto = await createProyecto(uid, {
    cliente_id: ids.cliente, cliente_nombre: "Familia Ruiz", nombre: "Casa Ruiz", estado: "activo",
    partidas: [{ proveedor_id: ids.proveedor, proveedor_nombre: "Herrería Juárez", concepto: "Barandal", monto_acordado: 30_000 }],
    fecha_inicio: new Date(2026, 10, 1),
  });
  /* Las cotizaciones las guarda quote101, con el precio de cada renglón
   * (G115): se escriben como quote101, con su propio frasco de galletas para
   * no pisar la sesión de dash101. El código de staging viene en la
   * respuesta; pedirlo otra vez no tira la sesión que ya está abierta. */
  const base = apiBase();
  const json = { "Content-Type": "application/json" };
  const codigo = await (await fetch(`${base}/auth/codigo`, { method: "POST", headers: json, body: JSON.stringify({ correo: CORREO }) })).json() as { data: { codigo_prueba: string } };
  const entrada = await fetch(`${base}/auth/entrar`, { method: "POST", headers: json, body: JSON.stringify({ correo: CORREO, codigo: codigo.data.codigo_prueba }) });
  const galletaQuote = (entrada.headers.get("set-cookie") ?? "").split(";")[0];
  const cot = async (nombre: string, renglones: Array<[string, number, number]>) => {
    const r = await fetch(`${base}/orgs/${ORG}/cotizaciones`, {
      method: "POST", headers: { ...json, "X-App": "cotizador101", Cookie: galletaQuote },
      body: JSON.stringify({ cliente_id: ids.cliente, total: 0, datos: { nombre, proyecto_id: ids.proyecto, versiones: [],
        renglones: renglones.map(([n, c, p], i) => ({ linea: i + 1, nombre: n, cantidad: c, precio_unitario: p })) } }),
    });
    const b = await r.json() as { data: { id: string } };
    expect(r.status, JSON.stringify(b)).toBe(201);
    return b.data.id;
  };
  ids.cot1 = await cot("Planta baja", [["Cocina", 1, 15_000_000], ["Puertas", 4, 650_000]]);
  ids.cot2 = await cot("Planta alta", [["Clósets", 3, 2_200_000]]);
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("los conceptos de cobro", () => {
  it("un proyecto nuevo tiene el precio por cargar", async () => {
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.precio_por_cargar).toBe(true);
    expect(p.precio_venta).toBe(0);
  });

  it("se capturan en PESOS, el importe lo multiplica la API y el precio es la suma", async () => {
    const c = await crearConcepto(ids.proyecto, { descripcion: "Anticipo de diseño", cantidad: 1, precio_unitario: 5_000.5 });
    expect(c.importe).toBe(5_000.5);
    const cambiado = await cambiarConcepto(c.id, { cantidad: 2 });
    expect(cambiado.importe).toBe(10_001);
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.precio_venta).toBe(10_001);
    expect(p.precio_por_cargar).toBe(false);
    await borrarConcepto(c.id);
    expect((await getProyecto(ids.proyecto))!.precio_por_cargar).toBe(true);
  });
});

describe("importar de quote101", () => {
  it("la lista trae las dos cotizaciones con su subtotal en pesos", async () => {
    const cs = await cotizacionesParaImportar(ids.proyecto);
    const baja = cs.find((c) => c.id === ids.cot1)!;
    expect(baja).toMatchObject({ nombre: "Planta baja", fuente: "quote", renglones: 2, subtotal: 150_000 + 4 * 6_500, importados: 0 });
  });

  it("un concepto por renglón; la segunda cotización es otro grupo, y suma", async () => {
    expect((await importarCotizacion(ids.proyecto, ids.cot1)).conceptos).toBe(2);
    expect((await importarCotizacion(ids.proyecto, ids.cot2)).conceptos).toBe(1);
    const grupos = agrupar(await listarConceptos(ids.proyecto));
    expect(grupos.map((g) => [g.numero, g.nombre, g.importe])).toEqual([[1, "Planta baja", 176_000], [2, "Planta alta", 66_000]]);
    expect((await getProyecto(ids.proyecto))!.precio_venta).toBe(242_000);
    const e = await estadoDelProyecto(ids.proyecto);
    expect(e.grupos.map((g) => g.importe)).toEqual([176_000, 66_000]);
    expect(e.totales.subtotal).toBe(242_000);
  });

  it("dos veces no, salvo que se pida reemplazar", async () => {
    await expect(importarCotizacion(ids.proyecto, ids.cot1)).rejects.toThrow(/ya_importada/);
    const r = await importarCotizacion(ids.proyecto, ids.cot1, true);
    expect(r.reemplazados).toBe(2);
    expect((await getProyecto(ids.proyecto))!.precio_venta).toBe(242_000);
  });
});

describe("lo que se les debe a los contratistas", () => {
  it("por proyecto y por contratista, en pesos", async () => {
    const d = await pagosPendientes();
    expect(d.total).toBe(30_000);
    expect(d.proyectos[0]).toMatchObject({ nombre: "Casa Ruiz", pendiente: 30_000 });
    expect(d.contratistas[0]).toMatchObject({ nombre: "Herrería Juárez", pendiente: 30_000, proyectos: 1 });
    expect((await pagosPendientes(ids.proyecto)).total).toBe(30_000);
  });
});

/* 0.106.0 · Mike, 18-nov-2026, con botones: «Hoja dentro de dash». La hoja
 * se guarda completa y en PESOS; la API la pasa a centavos y suma. */
describe("la hoja del presupuesto", () => {
  it("se guarda completa: los importados se quedan con su grupo, uno nuevo nace, y el precio es la suma", async () => {
    const antes = await listarConceptos(ids.proyecto);
    const r = await guardarHoja(ids.proyecto, [
      ...antes.map((c) => ({ id: c.id, nombre: c.nombre, descripcion: c.descripcion, cantidad: c.cantidad, precio_unitario: c.precio_unitario })),
      // 0.108.0 · el producto aparte de la descripción.
      { nombre: "Flete", descripcion: "A Santa Fe, en camioneta", cantidad: 1, precio_unitario: 3_000.5 },
    ]);
    expect(r).toMatchObject({ creados: 1, cambiados: antes.length, quitados: 0 });
    expect(r.conceptos.at(-1)).toMatchObject({ nombre: "Flete", descripcion: "A Santa Fe, en camioneta", importe: 3_000.5, cotizacion_id: null });
    expect((await getProyecto(ids.proyecto))!.precio_venta).toBe(242_000 + 3_000.5);
    expect(agrupar(r.conceptos).map((g) => g.nombre)).toEqual(["Planta baja", "Planta alta", "Otros conceptos"]);
  });

  it("lo que no viene se quita", async () => {
    const hoy = await listarConceptos(ids.proyecto);
    const r = await guardarHoja(ids.proyecto, hoy.filter((c) => c.nombre !== "Flete"));
    expect(r.quitados).toBe(1);
    expect((await getProyecto(ids.proyecto))!.precio_venta).toBe(242_000);
  });

  it("una plantilla guarda sus renglones en pesos y se vuelve a leer igual", async () => {
    const nombre = `Prueba ${Date.now().toString(36)}`;
    const p = await crearPlantilla(nombre, [{ nombre: "Cocina", descripcion: "Integral, nogal", cantidad: 1, precio_unitario: 150_000.25 }]);
    try {
      expect(p.renglones).toEqual([{ nombre: "Cocina", seccion: "", descripcion: "Integral, nogal", cantidad: 1, precio_unitario: 150_000.25 }]);
      expect((await listarPlantillas()).find((x) => x.id === p.id)?.nombre).toBe(nombre);
    } finally {
      await borrarPlantilla(p.id);
    }
    expect((await listarPlantillas()).some((x) => x.id === p.id)).toBe(false);
  });
});
