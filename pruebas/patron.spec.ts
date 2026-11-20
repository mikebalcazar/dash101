/* patron101 dentro de dash101: lo que NO le pregunta a la API.
 *
 * Las cuentas de intereses las hace la API (`/inversion/simular`) y se miden
 * allá. Aquí se mide lo que sí hace este lado: leer lo que alguien tecleó y
 * decírselo a la API sin inventar nada —lo que no se entiende va en `null`,
 * para que sea la API la que lo rechace con sus palabras—, y escribir el
 * monto con letra del pagaré. */

import { describe, expect, it } from "vitest";
import { aPuntos, anual, comoSePaga, condDe, enPuntos, leerCond, pesosCorto, sumarDias, tasa } from "@/lib/patron";
import { montoConLetra } from "@/lib/pagare";

describe("la tasa: puntos base adentro, por ciento afuera", () => {
  it("lee «2.5» como 250 y lo devuelve como «2.5»", () => {
    expect(aPuntos("2.5")).toBe(250);
    expect(aPuntos(" 18 % ")).toBe(1800);
    expect(enPuntos(250)).toBe("2.5");
    expect(enPuntos(null)).toBe("");
  });
  it("lo que no es una tasa no se adivina: null", () => {
    expect(aPuntos("")).toBeNull();
    expect(aPuntos("dos")).toBeNull();
    expect(aPuntos("2.555")).toBeNull();
    expect(aPuntos("-2")).toBeNull();
  });
  it("se dice con su tipo", () => {
    expect(tasa("mensual", 250)).toBe("2.5 % mensual");
    expect(tasa("anual", 1800)).toBe("18 % anual");
    expect(tasa("fija", 300)).toBe("3 % por todo el plazo");
  });
  it("la equivalencia anual la da la API, y no se repite si ya es anual", () => {
    expect(anual({ tipo_tasa: "mensual", ejemplo: { tasa_anual_pb: 2400 } })).toBe("24 % anual");
    expect(anual({ tipo_tasa: "fija", ejemplo: { tasa_anual_pb: 1825 } })).toBe("18.3 % anual");
    expect(anual({ tipo_tasa: "anual", ejemplo: { tasa_anual_pb: 1800 } })).toBe("");
    expect(anual({ tipo_tasa: "mensual" })).toBe("");
  });
});

describe("las condiciones: de la caja a la API", () => {
  const base = condDe({ tipo_tasa: "mensual", tasa_pb: 200, esquema: "unico", fecha_inicio: "2026-11-22", fecha_vencimiento: "2026-12-22", monto: 5_000_000 });

  it("de lo que da la API a lo que va en las cajas, en pesos y en por ciento", () => {
    expect(base).toMatchObject({ monto: "50000", tasa: "2", esquema: "unico", fecha_vencimiento: "2026-12-22", frecuencia: "mensual", num_pagos: "" });
  });
  it("un solo pago: lleva vencimiento y nada de parcialidades", () => {
    expect(leerCond(base)).toEqual({
      tipo_tasa: "mensual", tasa_pb: 200, esquema: "unico", fecha_inicio: "2026-11-22",
      frecuencia: null, num_pagos: null, fecha_primer_pago: null, fecha_vencimiento: "2026-12-22", monto: 5_000_000,
    });
  });
  it("parcialidades: lleva frecuencia y número de pagos, y el vencimiento se quita aunque la caja lo conserve", () => {
    const r = leerCond({ ...base, esquema: "parcialidades", frecuencia: "quincenal", num_pagos: "6" });
    expect(r).toMatchObject({ esquema: "parcialidades", frecuencia: "quincenal", num_pagos: 6, fecha_vencimiento: null });
  });
  it("lo que no se entiende va en null: la API lo rechaza con sus palabras", () => {
    const r = leerCond({ ...base, monto: "cincuenta mil", tasa: "x", esquema: "parcialidades", num_pagos: "seis" });
    expect(r.monto).toBeNull();
    expect(r.tasa_pb).toBeNull();
    expect(r.num_pagos).toBeNull();
  });
  it("el monto con comas se lee; con tres decimales, no", () => {
    expect(leerCond({ ...base, monto: "$50,000.50" }).monto).toBe(5_000_050);
    expect(leerCond({ ...base, monto: "50000.505" }).monto).toBeNull();
  });
  it("una ronda no manda monto; su ejemplo simula con uno fijo", () => {
    expect("monto" in leerCond(base, false)).toBe(false);
    expect(leerCond({ ...base, monto: "" }, 1_000_000).monto).toBe(1_000_000);
  });
  it("cómo se paga, en una frase", () => {
    expect(comoSePaga({ esquema: "unico", fecha_vencimiento: "2026-12-22" })).toBe("Un solo pago el 22 dic 2026");
    expect(comoSePaga({ esquema: "parcialidades", num_pagos: 6, frecuencia: "quincenal" })).toBe("6 pagos, cada 15 días");
  });
});

describe("dinero y fechas", () => {
  it("las cifras cerradas van sin centavos; las otras, con", () => {
    expect(pesosCorto(4_000_000)).toBe("$40,000");
    expect(pesosCorto(4_000_050)).toBe("$40,000.50");
    expect(pesosCorto(-150_000)).toBe("−$1,500");
  });
  it("sumar días cruza de mes y de año sin depender del reloj", () => {
    expect(sumarDias("2026-11-19", 33)).toBe("2026-12-22");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("el monto con letra del pagaré", () => {
  it.each([
    [5_000_000, "CINCUENTA MIL PESOS 00/100 M.N."],
    [5_000_050, "CINCUENTA MIL PESOS 50/100 M.N."],
    [100, "UN PESO 00/100 M.N."],
    [2_100_000, "VEINTIÚN MIL PESOS 00/100 M.N."],
    [100_000_000, "UN MILLÓN DE PESOS 00/100 M.N."],
    [123_456_789, "UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE PESOS 89/100 M.N."],
    [10_000, "CIEN PESOS 00/100 M.N."],
    [10_100, "CIENTO UN PESOS 00/100 M.N."],
  ])("%i centavos → %s", (centavos, letra) => {
    expect(montoConLetra(centavos)).toBe(letra);
  });
});
