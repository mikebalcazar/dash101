/* Los ítems de un proyecto al editarlos: que se respeten los cambios, y que
 * dash101 NO fabrique ninguno.
 *
 * Mike lo reportó el 20-sep: al editar la lista de ítems dentro de un
 * proyecto y guardar, en vez de quedar la lista que se ve en pantalla,
 * quedaban los de antes MÁS los editados, y no había manera de borrar uno.
 * Eso infla el precio de venta del proyecto, que es la suma de sus ítems.
 *
 * Y el 2-oct decidió, con botones: «dash sólo lee». «ítems se pueden generar
 * en 2 lugares: quell, quote. dash únicamente los lee y puede sacarlos o
 * meterlos al alcance». Así que aquí los ítems se siembran por la API —como
 * entran de verdad— y lo que se mide de dash101 es que edite, saque y NUNCA
 * cree.
 *
 * Esta prueba recorre exactamente eso contra staging, con los mismos módulos
 * que usa la pantalla.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto, updateProyecto } from "@/lib/proyectos";
import { DASH_NO_GENERA_ITEMS } from "@/lib/api/escribir";
import { sembrarItems, type Semilla } from "./sembrar";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `it-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { cliente: "", proyecto: "" };

/** Deja el proyecto EXACTAMENTE con estas semillas: saca lo que haya y
 *  siembra lo nuevo por la API, como lo harían quell101 o quote101. */
async function dejarCon(proyecto: string, semillas: Semilla[]): Promise<string[]> {
  await updateProyecto(proyecto, { items: [] });
  return sembrarItems(ORG, proyecto, ids.cliente, semillas);
}

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de ítems" } });
  ids.cliente = await createCliente(uid, { nombre: "Cliente Uno"});
  ids.proyecto = await createProyecto(uid, {
    nombre: "Casa Uno", cliente_id: ids.cliente, cliente_nombre: "Cliente Uno",
    estado: "activo", fecha_inicio: new Date(2026, 8, 1), partidas: [],
  });
  await sembrarItems(ORG, ids.proyecto, ids.cliente, [
    { nombre: "Cocina", monto: 100 },
    { nombre: "Clóset", monto: 200 },
  ]);
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("dash101 no genera ítems (Mike, 2-oct)", () => {
  it("crear un proyecto con `items` o con `precio_venta` no fabrica ninguno", async () => {
    /* Antes del 2-oct, `precio_venta` sin ítems nacía como un ítem con el
     * nombre del proyecto («regla 1»), y `items` los creaba uno por uno. Ya
     * no: un proyecto nuevo de dash101 nace vacío y vale cero. */
    const p = await createProyecto(uid, {
      nombre: "Casa Vacía", cliente_id: ids.cliente, cliente_nombre: "Cliente Uno",
      estado: "activo", fecha_inicio: new Date(2026, 8, 1), partidas: [],
      precio_venta: 5000, items: [{ nombre: "Fantasma", monto: 5000 }],
    });
    const d = (await getProyecto(p))!;
    expect(d.items, "ni el de la regla 1 ni el de la lista").toHaveLength(0);
    expect(d.precio_venta).toBe(0);
  });

  it("un renglón sin id en la lista se rechaza completo, y no cambia nada", async () => {
    const antes = (await getProyecto(ids.proyecto))!;
    const cocina = antes.items!.find((x) => x.nombre === "Cocina")!;
    await expect(updateProyecto(ids.proyecto, {
      nombre: "Casa Uno renombrada",
      items: [{ id: cocina.id, nombre: "Cocina grande", monto: 999 }, { nombre: "Nuevo de dash", monto: 50 }],
    })).rejects.toThrow(DASH_NO_GENERA_ITEMS);
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.nombre, "ni el proyecto se tocó").toBe("Casa Uno");
    expect(d.items!.map((x) => x.nombre).sort(), "todo o nada: ni el nuevo ni el cambio").toEqual(["Clóset", "Cocina"]);
    expect(d.precio_venta).toBe(300);
  });

  it("un precio de venta a secas tampoco fabrica el ítem fantasma", async () => {
    await dejarCon(ids.proyecto, []);
    await updateProyecto(ids.proyecto, { precio_venta: 7000 });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items).toHaveLength(0);
    expect(d.precio_venta, "el precio es la suma de los ítems, y no hay").toBe(0);
    await dejarCon(ids.proyecto, [{ nombre: "Cocina", monto: 100 }, { nombre: "Clóset", monto: 200 }]);
  });
});

describe("editar la lista de ítems de un proyecto", () => {
  it("nace con los dos que se sembraron, y el precio es su suma", async () => {
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.items).toHaveLength(2);
    expect(p.precio_venta).toBe(300);
  });

  it("se cambia uno y se quita otro: queda LO QUE SE VE", async () => {
    const p = (await getProyecto(ids.proyecto))!;
    const cocina = p.items!.find((x) => x.nombre === "Cocina")!;

    await updateProyecto(ids.proyecto, {
      items: [
        // el que se queda, con otro monto
        { id: cocina.id, nombre: "Cocina", monto: 150 },
        // y «Clóset» ya no viene: se quitó en la pantalla
      ],
    });

    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items!.map((x) => x.nombre), "queda exactamente el de la lista").toEqual(["Cocina"]);
    expect(d.items![0].monto).toBe(150);
    expect(d.precio_venta, "y el precio es la suma de lo que quedó").toBe(150);
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
     * descripción, estado, fecha y partidas, todo junto. Esta prueba usa esa
     * forma exacta, porque es la que reportó Mike. */
    const antes = (await getProyecto(ids.proyecto))!;
    const filas = antes.items!.map((x) => ({
      id: x.id, nombre: x.nombre, descripcion: x.descripcion || undefined,
      monto: x.monto, fecha_entrega: null,
    }));
    await updateProyecto(ids.proyecto, {
      nombre: antes.nombre,
      descripcion: antes.descripcion ?? "",
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
    const [puerta] = await dejarCon(ids.proyecto, [{ nombre: "Puerta de clóset", monto: 1_500 }]);
    await updateProyecto(ids.proyecto, {
      items: [{ id: puerta, nombre: "Puerta de clóset", monto: 30_000, cantidad: 20 }],
    });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items).toHaveLength(1);
    expect(d.items![0].cantidad).toBe(20);
    expect(d.items![0].monto).toBe(30_000);
    expect(d.precio_venta, "la suma es del importe de la línea").toBe(30_000);
  });

  it("sin decir cantidad, es uno: lo que ya existía no cambia", async () => {
    const [barra] = await dejarCon(ids.proyecto, [{ nombre: "Barra", monto: 8_000 }]);
    await updateProyecto(ids.proyecto, { items: [{ id: barra, nombre: "Barra", monto: 8_000 }] });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items![0].cantidad).toBe(1);
    expect(d.precio_venta).toBe(8_000);
  });

  it("el que se quita deja de verse, y los sacados no estorban al siguiente guardado", async () => {
    /* Mike, tercera vez el 20-sep: «sigue agregando todo lo que aparece en la
     * lista de ítems. No hay forma de quitar/eliminar ítems».
     *
     * Quitar SACA DEL ALCANCE —la API contesta 403 `items_nunca_se_borran`
     * si se intenta borrar, y hace bien: un ítem borrado deja el historial
     * sin cuadrar—. Lo que estaba mal era que al guardar se pedía la lista
     * del proyecto CON los sacados, y la API tope cada lista en 500 filas por
     * fecha: en un proyecto muy editado, los sacados empujan a los vivos
     * recientes fuera del tope, sus ids dejan de verse, y se volvían a crear.
     *
     * Aquí se mide lo que se puede medir barato: que el quitado deje de
     * verse, que siga existiendo fuera del alcance —el rastro no se pierde— y
     * que el siguiente guardado no lo reviva ni agregue copias. */
    await dejarCon(ids.proyecto, [{ nombre: "Se queda", monto: 100 }, { nombre: "Se va", monto: 50 }]);
    const antes = (await getProyecto(ids.proyecto))!.items!;
    const seVa = antes.find((p) => p.nombre === "Se va")!;
    const sobreviven = antes
      .filter((p) => p.nombre !== "Se va")
      .map((p) => ({ id: p.id, nombre: p.nombre, monto: p.monto }));

    await updateProyecto(ids.proyecto, { items: sobreviven });

    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items!.map((p) => p.nombre)).toEqual(["Se queda"]);
    expect(d.precio_venta).toBe(100);

    // Sigue existiendo, fuera del alcance: el rastro no se pierde. Desde la
    // 0.64.0 ya no hay 'cancelado': queda cotizado, con la fecha en que lo
    // sacaron.
    const todos = await pedir<{ filas: Array<{ id: string; estado: string; alcance?: string; cancelado_at?: string | null }> }>(
      `/orgs/${ORG}/items?proyecto_id=${encodeURIComponent(ids.proyecto)}`,
    );
    const fuera = todos.filas.find((i) => i.id === seVa.id);
    expect(fuera?.estado).toBe("cotizado");
    expect(fuera?.alcance).toBe("fuera");
    expect(fuera?.cancelado_at, "y quedó dicho que lo sacaron").toBeTruthy();

    // Y guardar otra vez no lo revive ni agrega copias.
    await updateProyecto(ids.proyecto, { items: sobreviven });
    const otra = (await getProyecto(ids.proyecto))!;
    expect(otra.items!.map((p) => p.nombre)).toEqual(["Se queda"]);
    expect(otra.precio_venta).toBe(100);
  });

  it("un id que ya no sale en la lista se revive, NO se duplica", async () => {
    /* El corazón del defecto, reproducido barato: se saca un ítem por la
     * espalda —como pasaba solo cuando el tope de 500 dejaba fuera a los
     * vivos— y se guarda la pantalla con ese mismo id adentro. Antes se creaba
     * una copia; ahora se actualiza el que ya estaba. */
    const [p1] = await dejarCon(ids.proyecto, [{ nombre: "Cocina", monto: 100 }]);

    await pedir(`/orgs/${ORG}/items/${p1}`, { method: "PATCH", body: { estado: "cancelado" } });

    await updateProyecto(ids.proyecto, { items: [{ id: p1, nombre: "Cocina", monto: 120 }] });

    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items, "uno solo, no dos").toHaveLength(1);
    expect(d.items![0].id, "y es el mismo de antes, revivido").toBe(p1);
    expect(d.items![0].monto).toBe(120);
    expect(d.precio_venta).toBe(120);
  });

  it("un id que de veras no existe truena: no se inventa un ítem", async () => {
    await expect(updateProyecto(ids.proyecto, {
      items: [{ id: "no-existe-" + Date.now().toString(36), nombre: "Inventado", monto: 1 }],
    })).rejects.toThrow();
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items!.map((p) => p.nombre), "la lista sigue como estaba").toEqual(["Cocina"]);
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
   * sacados —los más viejos— llenan las 500 y empujan a los vivos fuera
   * de la respuesta. La pantalla decía «Sin ítems» y no faltaba nada.
   *
   * Sembrar 500 sacados contra staging sería lento y no mediría nada más
   * que esto: aquí se mide la regla que lo arregla, que es que la lectura
   * pida SÓLO LOS VIVOS y exija la lista completa. */

  it("la lectura del proyecto pide sólo los vivos: un sacado no ocupa lugar", async () => {
    await dejarCon(ids.proyecto, [{ nombre: "Se queda", monto: 400 }, { nombre: "Se va", monto: 600 }]);
    const antes = (await getProyecto(ids.proyecto))!;
    const seVa = antes.items!.find((p) => p.nombre === "Se va")!;
    await updateProyecto(ids.proyecto, {
      items: antes.items!.filter((p) => p.nombre !== "Se va").map((p) => ({ id: p.id, nombre: p.nombre, monto: p.monto })),
    });

    // La lista del proyecto, tal como la pide la pantalla: el sacado no
    // viene, ni siquiera para que lo tire el adaptador después.
    const crudo = await pedir<{ total: number; filas: Array<{ id: string; estado: string }> }>(
      `/orgs/${ORG}/items?proyecto_id=${encodeURIComponent(ids.proyecto)}&estado=vendido`,
    );
    expect(crudo.filas.some((i) => i.id === seVa.id), "el sacado no ocupa lugar en la respuesta").toBe(false);
    expect(crudo.total, "«total» cuenta sólo los vivos cuando se filtra").toBe(crudo.filas.length);

    const d = (await getProyecto(ids.proyecto))!;
    expect(d.items!.map((p) => p.nombre)).toEqual(["Se queda"]);
    expect(d.precio_venta).toBe(400);
  });

  it("«total» delata una lista cortada: es la única seña que da la API", async () => {
    /* Sin esto no hay arreglo posible: una respuesta topada se ve idéntica a
     * una completa —200, `filas`, y nada más—. Se comprueba con un tope
     * chiquito, que es el mismo mecanismo con el que se cae una de 500. */
    await dejarCon(ids.proyecto, [{ nombre: "Uno", monto: 10 }, { nombre: "Dos", monto: 20 }, { nombre: "Tres", monto: 30 }]);
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

describe("la partida (pestaña) del ítem viaja al editar (29-sep)", () => {
  /* Mike, 29-sep: «dividir por partidas (…) pestañas, tipo los libros de
   * Excel». La partida es un campo del ítem que la pantalla vieja no
   * conocía y, como mandaba la lista sin él, la API lo tomaba por vacío y lo
   * quitaba al guardar. Ahora viaja si se manda, y si no se manda no se toca.
   * La regla del «no se toca» importa: cualquier pantalla vieja que guarde
   * la lista sin partida borraría las pestañas de todo el proyecto. */
  let proyecto = "";

  it("un ítem sembrado en una partida la trae", async () => {
    proyecto = await createProyecto(uid, {
      nombre: "Casa con partidas", cliente_id: ids.cliente, cliente_nombre: "Cliente Uno",
      estado: "activo", fecha_inicio: new Date(2026, 8, 1), partidas: [],
    });
    await sembrarItems(ORG, proyecto, ids.cliente, [{ nombre: "Barra", monto: 100, partida: "Cocina" }, { nombre: "Puerta", monto: 50 }]);
    const p = (await getProyecto(proyecto))!;
    const barra = p.items!.find((i) => i.nombre === "Barra")!;
    const puerta = p.items!.find((i) => i.nombre === "Puerta")!;
    expect(barra.partida).toBe("Cocina");
    expect(puerta.partida ?? "", "sin decir nada, sin partida").toBe("");
  });

  it("guardar la lista SIN mandar la partida no la borra", async () => {
    const antes = (await getProyecto(proyecto))!;
    await updateProyecto(proyecto, {
      items: antes.items!.map((i) => ({ id: i.id, nombre: i.nombre, monto: i.monto })),
    });
    const p = (await getProyecto(proyecto))!;
    expect(p.items!.find((i) => i.nombre === "Barra")!.partida).toBe("Cocina");
  });

  it("y mandarla la cambia, o la quita con vacío", async () => {
    const antes = (await getProyecto(proyecto))!;
    await updateProyecto(proyecto, {
      items: antes.items!.map((i) => ({ id: i.id, nombre: i.nombre, monto: i.monto, partida: i.nombre === "Barra" ? "Baño" : "Recámaras" })),
    });
    let p = (await getProyecto(proyecto))!;
    expect(p.items!.map((i) => [i.nombre, i.partida]).sort()).toEqual([["Barra", "Baño"], ["Puerta", "Recámaras"]]);
    await updateProyecto(proyecto, {
      items: p.items!.map((i) => ({ id: i.id, nombre: i.nombre, monto: i.monto, partida: "" })),
    });
    p = (await getProyecto(proyecto))!;
    expect(p.items!.every((i) => (i.partida ?? "") === "")).toBe(true);
  });
});
