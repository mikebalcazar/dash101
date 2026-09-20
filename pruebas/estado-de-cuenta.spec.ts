/* El estado de cuenta de un cliente, del lado de dash101 · contrato 0.29.0.
 *
 * Mike, 20-sep: «saldo global, y por proyecto, y poder exportarlo en un PDF
 * para enviar reportes».
 *
 * LO QUE DE VERDAD MIDE ESTE ARCHIVO. Esto es un documento que se le manda a
 * un cliente, así que lo que no puede fallar no es que se vea bonito:
 *
 *   · que el dinero llegue en PESOS. La API guarda centavos; si la
 *     conversión se cayera, el estado de cuenta diría cien veces más o cien
 *     veces menos y el documento seguiría cuadrando consigo mismo. Eso se
 *     manda por correo antes de que alguien lo note;
 *   · que el total SEA la suma de los renglones impresos. Un papel cuyo
 *     total no cuadra con su propia tabla es peor que no mandar nada;
 *   · que un anticipo sin proyecto aparezca, porque si no el cliente suma su
 *     lado y reclama.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createCuenta } from "@/lib/cuentas";
import { createProyecto } from "@/lib/proyectos";
import { createMovimiento } from "@/lib/movimientos";
import { estadoDeCuenta } from "@/lib/estado-cuenta";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `ec-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", holcim: "", casa: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Estado de cuenta" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, negocio_id: ids.negocio, moneda: "MXN" });
  ids.holcim = await createCliente(uid, { nombre: "HOLCIM", negocio_id: ids.negocio, rfc: "HOL010101AAA" });
  ids.casa = await createProyecto(uid, {
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    cliente_id: ids.holcim, cliente_nombre: "HOLCIM",
    nombre: "Planta Norte", estado: "activo", precio_venta: 500_000,
    partidas: [], fecha_inicio: new Date(2026, 0, 15),
    productos: [{ nombre: "Alcance", monto: 500_000, cantidad: 1 }],
  });

  const cobrar = (monto: number, proyecto_id: string | null, fecha: Date) =>
    createMovimiento(uid, {
      tipo: "ingreso", monto, fecha,
      cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
      proyecto_id, proyecto_nombre: proyecto_id ? "Planta Norte" : null,
      contraparte_id: ids.holcim, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
      negocio_id: ids.negocio,
    });
  await cobrar(200_000, ids.casa, new Date(2026, 1, 1));
  await cobrar(80_000, null, new Date(2026, 0, 5)); // el anticipo suelto
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("el estado de cuenta, como lo pinta la pantalla", () => {
  it("el dinero llega en PESOS, no en centavos", async () => {
    /* Si esto se cayera, el documento diría $50,000,000 en vez de $500,000 y
     * cuadraría consigo mismo. Se manda por correo antes de que alguien lo
     * note. */
    const d = await estadoDeCuenta(ids.holcim);
    expect(d.totales.vendido).toBe(500_000);
    expect(d.totales.cobrado, "200,000 + 80,000").toBe(280_000);
    expect(d.totales.saldo).toBe(220_000);
    expect(d.proyectos[0].precio_venta).toBe(500_000);
    expect(d.proyectos[0].pagos[0].monto).toBe(200_000);
  });

  it("el total ES la suma de los renglones que se imprimen", async () => {
    /* Un papel cuyo total no cuadra con su propia tabla es peor que no
     * mandar nada: quien lo recibe deja de creerle a los dos números. */
    const d = await estadoDeCuenta(ids.holcim);
    const deProyectos = d.proyectos.reduce((t, p) => t + p.cobrado, 0);
    const deSueltos = d.otros_pagos.reduce((t, c) => t + c.monto, 0);
    expect(deProyectos + deSueltos).toBe(d.totales.cobrado);
    expect(d.proyectos.reduce((t, p) => t + p.precio_venta, 0)).toBe(d.totales.vendido);
    expect(d.totales.vendido - d.totales.cobrado).toBe(d.totales.saldo);
    for (const p of d.proyectos) {
      expect(p.pagos.reduce((t, c) => t + c.monto, 0), `los cobros de ${p.nombre}`).toBe(p.cobrado);
    }
  });

  it("el anticipo sin proyecto sale con su renglón, no se pierde", async () => {
    const d = await estadoDeCuenta(ids.holcim);
    expect(d.totales.sin_proyecto).toBe(80_000);
    expect(d.otros_pagos).toHaveLength(1);
    expect(d.otros_pagos[0].monto).toBe(80_000);
  });

  it("trae con qué encabezar el documento y con qué justificar cada cobro", async () => {
    const d = await estadoDeCuenta(ids.holcim);
    expect(d.cliente.nombre).toBe("HOLCIM");
    expect(d.cliente.rfc).toBe("HOL010101AAA");
    const uno = d.proyectos[0].pagos[0];
    expect(uno.fecha, "la fecha del cobro").toBeTruthy();
    expect(typeof uno.facturado, "y si ya tiene factura").toBe("boolean");
  });
});
