/* La lista de ítems con el estilo de quell101 (6-oct-2026): las cuentas.
 *
 * Mike: «en dash quiero que la lista de ítems tenga el mismo estilo. Hoy en
 * dash es muy cansado a la vista como está». */
import { describe, expect, it } from "vitest";
import { avanceDe, colorDeTipo, embudo, estadoDeCobro, nombreDeTipo, sumarAvances } from "@/lib/lista-items";

const ETAPAS = ["Compras", "Fabricación", "Flete", "Instalación", "Entrega"].map((n, i) => ({ clave: `e${i}`, nombre: n, abre_punchlist: i === 3 }));
const av = (piezas: number, hechas: number, menor: number) => ({ piezas, hechas, menor, en_punchlist: 0, n_pend: 0, n_proc: 0, n_total: 0 });

describe("la lista de ítems con el estilo de quell101", () => {
  it("el color de cada tipo es el mismo que en quell101", () => {
    expect(colorDeTipo("mueble")).toBe("#2C5AA0");
    expect(colorDeTipo("Puerta")).toBe("#B4622A");
    expect(colorDeTipo("acabado")).toBe("#4B7F52");
    expect(colorDeTipo("servicio")).toBe("#6B4E9B");
    expect(colorDeTipo(null)).toBe("#1C3557");
    expect(nombreDeTipo("mueble")).toBe("Mueble");
    expect(nombreDeTipo("")).toBe("Ítem");
  });

  it("una pieza: los tramos llenos, el porcentaje y la etapa en la que va", () => {
    expect(avanceDe(av(1, 4, 4), ETAPAS)).toEqual({ llenos: 4, pct: 80, etapa: "Entrega" });
    expect(avanceDe(av(1, 5, 5), ETAPAS)).toEqual({ llenos: 5, pct: 100, etapa: "Entregado" });
    expect(avanceDe(av(1, 0, 0), ETAPAS)).toEqual({ llenos: 0, pct: 0, etapa: "Compras" });
  });

  it("veinte puertas: el porcentaje es de todas y la etapa la pone la más atrasada", () => {
    // 19 entregadas (5 etapas) y una en compras (0): 95 de 100 etapas.
    expect(avanceDe(av(20, 95, 0), ETAPAS)).toEqual({ llenos: 0, pct: 95, etapa: "Compras" });
  });

  it("sin piezas en ningún plano no se inventa avance", () => {
    expect(avanceDe(undefined, ETAPAS)).toBeNull();
    expect(avanceDe(av(0, 0, 0), ETAPAS)).toBeNull();
    expect(avanceDe(av(1, 2, 2), [])).toBeNull();
  });

  it("las piezas de un producto se suman y manda la más atrasada", () => {
    expect(sumarAvances([av(1, 5, 5), av(1, 2, 2), undefined])).toEqual(av(2, 7, 2));
    expect(sumarAvances([undefined, av(0, 0, 0)])).toBeUndefined();
  });

  it("los recuadros de arriba cuentan ítems que llevan cumplida cada etapa", () => {
    const avance = { etapas: ETAPAS, items: { a: av(1, 5, 5), b: av(1, 2, 2), c: av(3, 3, 0) } };
    expect(embudo(["a", "b", "c", "d"], avance).map((x) => x.n)).toEqual([2, 2, 1, 1, 1]);
    expect(embudo(["a"], null)).toEqual([]);
    expect(embudo(["x", "y"], avance), "un proyecto sin piezas en ningún plano no pinta ceros").toEqual([]);
  });

  it("la pastilla del cobro", () => {
    expect(estadoDeCobro(1000, 1000)).toEqual({ texto: "Cobrado", tono: "ok" });
    expect(estadoDeCobro(1000, 400)).toEqual({ texto: "Cobrado 40%", tono: "parcial" });
    expect(estadoDeCobro(1000, 999.9)).toEqual({ texto: "Cobrado", tono: "ok" });
    expect(estadoDeCobro(1000, 0)).toEqual({ texto: "Sin cobro", tono: "nada" });
    expect(estadoDeCobro(0, 0)).toEqual({ texto: "Sin cobro", tono: "nada" });
  });
});
