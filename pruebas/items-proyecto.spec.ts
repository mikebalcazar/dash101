/* Los ítems de un proyecto al editarlos: que se respeten los cambios.
 *
 * Mike lo reportó el 20-sep: al editar la lista de ítems dentro de un
 * proyecto y guardar, en vez de quedar la lista que se ve en pantalla,
 * quedaban los de antes MÁS los editados, y no había manera de borrar uno.
 * Eso infla el precio de venta del proyecto, que es la suma de sus ítems.
 *
 * Esta prueba recorre exactamente eso contra staging, con los mismos módulos
 * que usa la pantalla.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto, updateProyecto } from "@/lib/proyectos";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `it-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cliente: "", proyecto: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de ítems" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "Cliente Uno", negocio_id: ids.negocio });
  ids.proyecto = await createProyecto(uid, {
    nombre: "Casa Uno", cliente_id: ids.cliente, cliente_nombre: "Cliente Uno",
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    precio_venta: 0, estado: "activo", fecha_inicio: new Date(2026, 8, 1), partidas: [],
    items: [
      { nombre: "Cocina", monto: 100 },
      { nombre: "Clóset", monto: 200 },
    ],
  });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("editar la lista de ítems de un proyecto", () => {
  it("nace con los dos que se pidieron, y el precio es su suma", async () => {
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.items).toHaveLength(2);
    expect(p.precio_venta).toBe(300);
  });

  it("se cambia uno, se borra otro y se agrega uno nuevo: queda LO QUE SE VE", async () => {
    const p = (await getProyecto(ids.proyecto))!;
    const cocina = p.items!.find((x) => x.nombre === "Cocina")!;

    await updateProyecto(ids.proyecto, {
      items: [
        // el que se queda, con otro monto
        { id: cocina.id, nombre: "Cocina", monto: 150 },
        // uno nuevo, sin id
        { nombre: "Isla", monto: 50 },
        // y «Clóset» ya no viene: se borró en la pantalla
      ],
    });

    const d = (await getProyecto(ids.proyecto))!;
    const nombres = d.items!.map((x) => x.nombre).sort();
    expect(nombres, "quedan exactamente los dos de la lista").toEqual(["Cocina", "Isla"]);
    expect(d.items!.find((x) => x.nombre === "Cocina")!.monto).toBe(150);
    expect(d.precio_venta, "y el precio es la suma de lo que quedó").toBe(200);
  });

  it("guardar dos veces seguidas lo mismo no duplica nada", async () => {
    const antes = (await getProyecto(ids.proyecto))!;
    const mismos = antes.items!.map((x) => ({ id: x.id, nombre: x.nombre, monto: x.monto }));
    await updateProyecto(ids.proyecto, { items: mismos });
    await updateProyecto(ids.proyecto, { items: mismos });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items).toHaveLength(antes.items!.length);
    expect(d.precio_venta).toBe(antes.precio_venta);
  });

  it("guardar con la MISMA forma que manda la pantalla no duplica", async () => {
    /* La pantalla no manda sólo `items`: manda también nombre,
     * descripción, precio_venta, estado, fecha y partidas, todo junto. Esta
     * prueba usa esa forma exacta, porque es la que reportó Mike. */
    const antes = (await getProyecto(ids.proyecto))!;
    const filas = antes.items!.map((x) => ({
      id: x.id, nombre: x.nombre, descripcion: x.descripcion || undefined,
      monto: x.monto, fecha_entrega: null,
    }));
    await updateProyecto(ids.proyecto, {
      nombre: antes.nombre,
      descripcion: antes.descripcion ?? "",
      precio_venta: antes.precio_venta,
      estado: antes.estado,
      fecha_inicio: new Date(2026, 8, 1),
      items: filas,
      partidas: [],
    });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items!.map((x) => x.nombre).sort()).toEqual(antes.items!.map((x) => x.nombre).sort());
    expect(d.precio_venta).toBe(antes.precio_venta);
  });

  it("la cantidad viaja y el precio de venta NO se multiplica otra vez", async () => {
    /* Mike, 20-sep: «a veces son 20 puertas del mismo acabado y precio».
     * `monto` es el importe de la LÍNEA —las 20 juntas—; si alguien lo
     * tratara como el precio de una, el precio de venta del proyecto saldría
     * multiplicado por veinte y nadie lo notaría hasta cobrarle al cliente. */
    await updateProyecto(ids.proyecto, {
      items: [{ nombre: "Puerta de clóset", monto: 30_000, cantidad: 20 }],
    });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items).toHaveLength(1);
    expect(d.items![0].cantidad).toBe(20);
    expect(d.items![0].monto).toBe(30_000);
    expect(d.precio_venta, "la suma es del importe de la línea").toBe(30_000);
  });

  it("sin decir cantidad, es uno: lo que ya existía no cambia", async () => {
    await updateProyecto(ids.proyecto, { items: [{ nombre: "Barra", monto: 8_000 }] });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items![0].cantidad).toBe(1);
    expect(d.precio_venta).toBe(8_000);
  });

  it("el que se quita deja de verse, y los cancelados no estorban al siguiente guardado", async () => {
    /* Mike, tercera vez el 20-sep: «sigue agregando todo lo que aparece en la
     * lista de ítems. No hay forma de quitar/eliminar ítems».
     *
     * Quitar CANCELA —la API contesta 403 `items_nunca_se_borran` si se
     * intenta borrar, y hace bien: un ítem borrado deja el historial sin
     * cuadrar—. Lo que estaba mal era que al guardar se pedía la lista del
     * proyecto CON los cancelados, y la API tope cada lista en 500 filas por
     * fecha: en un proyecto muy editado, los cancelados empujan a los vivos
     * recientes fuera del tope, sus ids dejan de verse, y se vuelven a crear.
     *
     * Aquí se mide lo que se puede medir barato: que el quitado deje de
     * verse, que siga existiendo cancelado —el rastro no se pierde— y que el
     * siguiente guardado no lo reviva ni agregue copias. */
    await updateProyecto(ids.proyecto, {
      items: [{ nombre: "Se queda", monto: 100 }, { nombre: "Se va", monto: 50 }],
    });
    const antes = (await getProyecto(ids.proyecto))!.items!;
    const seVa = antes.find((p) => p.nombre === "Se va")!;
    const sobreviven = antes
      .filter((p) => p.nombre !== "Se va")
      .map((p) => ({ id: p.id, nombre: p.nombre, monto: p.monto }));

    await updateProyecto(ids.proyecto, { items: sobreviven });

    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items!.map((p) => p.nombre)).toEqual(["Se queda"]);
    expect(d.precio_venta).toBe(100);

    // Sigue existiendo, cancelado: el rastro no se pierde.
    const todos = await pedir<{ filas: Array<{ id: string; estado: string }> }>(
      `/orgs/${ORG}/items?proyecto_id=${encodeURIComponent(ids.proyecto)}`,
    );
    expect(todos.filas.find((i) => i.id === seVa.id)?.estado).toBe("cancelado");

    // Y guardar otra vez no lo revive ni agrega copias.
    await updateProyecto(ids.proyecto, { items: sobreviven });
    const otra = (await getProyecto(ids.proyecto))!;
    expect(otra.items!.map((p) => p.nombre)).toEqual(["Se queda"]);
    expect(otra.precio_venta).toBe(100);
  });

  it("un id que ya no sale en la lista se revive, NO se duplica", async () => {
    /* El corazón del defecto, reproducido barato: se cancela un ítem por la
     * espalda —como pasaba solo cuando el tope de 500 dejaba fuera a los
     * vivos— y se guarda la pantalla con ese mismo id adentro. Antes se creaba
     * una copia; ahora se actualiza el que ya estaba. */
    await updateProyecto(ids.proyecto, { items: [{ nombre: "Cocina", monto: 100 }] });
    const p1 = (await getProyecto(ids.proyecto))!.items![0];

    await pedir(`/orgs/${ORG}/items/${p1.id}`, { method: "PATCH", body: { estado: "cancelado" } });

    await updateProyecto(ids.proyecto, { items: [{ id: p1.id, nombre: "Cocina", monto: 120 }] });

    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items, "uno solo, no dos").toHaveLength(1);
    expect(d.items![0].id, "y es el mismo de antes, revivido").toBe(p1.id);
    expect(d.items![0].monto).toBe(120);
    expect(d.precio_venta).toBe(120);
  });

  it("se pueden dejar en cero: un proyecto sin ítems vale cero", async () => {
    await updateProyecto(ids.proyecto, { items: [] });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items).toHaveLength(0);
    expect(d.precio_venta).toBe(0);
  });
});

describe("el tope de 500 no puede esconder ítems (lo de HOLCIM)", () => {
  /* Mike, 20-sep, con la pantalla enfrente: «ya no aparecen los ítems pero el
   * total de venta del proyecto se quedó con todos los ítems sumando, ese
   * margen proyectado está mal».
   *
   * El margen no estaba mal: el precio de venta lo suma la API en la base
   * sobre los ítems vivos, y esa cifra era la correcta. La que mentía era la
   * LISTA. Se pedían los ítems del proyecto sin filtrar el estado, y la API
   * tope cada lista en 500 filas ordenadas de la más vieja a la más nueva:
   * en un proyecto al que se le editaron los ítems muchas veces, los
   * cancelados —los más viejos— llenan las 500 y empujan a los vivos fuera
   * de la respuesta. La pantalla decía «Sin ítems» y no faltaba nada.
   *
   * Sembrar 500 cancelados contra staging sería lento y no mediría nada más
   * que esto: aquí se mide la regla que lo arregla, que es que la lectura
   * pida SÓLO LOS VIVOS y exija la lista completa. */

  it("la lectura del proyecto pide sólo los vivos: un cancelado no ocupa lugar", async () => {
    await updateProyecto(ids.proyecto, {
      items: [{ nombre: "Se queda", monto: 400 }, { nombre: "Se va", monto: 600 }],
    });
    const antes = (await getProyecto(ids.proyecto))!;
    const seVa = antes.items!.find((p) => p.nombre === "Se va")!;
    await updateProyecto(ids.proyecto, {
      items: antes.items!.filter((p) => p.nombre !== "Se va").map((p) => ({ id: p.id, nombre: p.nombre, monto: p.monto })),
    });

    // La lista del proyecto, tal como la pide la pantalla: el cancelado no
    // viene, ni siquiera para que lo tire el adaptador después.
    const crudo = await pedir<{ total: number; filas: Array<{ id: string; estado: string }> }>(
      `/orgs/${ORG}/items?proyecto_id=${encodeURIComponent(ids.proyecto)}&estado=vendido`,
    );
    expect(crudo.filas.some((i) => i.id === seVa.id), "el cancelado no ocupa lugar en la respuesta").toBe(false);
    expect(crudo.total, "«total» cuenta sólo los vivos cuando se filtra").toBe(crudo.filas.length);

    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items!.map((p) => p.nombre)).toEqual(["Se queda"]);
    expect(d.precio_venta).toBe(400);
  });

  it("«total» delata una lista cortada: es la única seña que da la API", async () => {
    /* Sin esto no hay arreglo posible: una respuesta topada se ve idéntica a
     * una completa —200, `filas`, y nada más—. Se comprueba con un tope
     * chiquito, que es el mismo mecanismo con el que se cae una de 500. */
    await updateProyecto(ids.proyecto, {
      items: [{ nombre: "Uno", monto: 10 }, { nombre: "Dos", monto: 20 }, { nombre: "Tres", monto: 30 }],
    });
    const cortada = await pedir<{ total: number; filas: unknown[] }>(
      `/orgs/${ORG}/items?proyecto_id=${encodeURIComponent(ids.proyecto)}&estado=vendido&limite=1`,
    );
    expect(cortada.filas).toHaveLength(1);
    expect(cortada.total, "y aun así dice que hay tres").toBe(3);

    // Y la pantalla, que usa `listarCompleto`, los trae todos de todos modos.
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items).toHaveLength(3);
    expect(d.precio_venta).toBe(60);
  });
});
