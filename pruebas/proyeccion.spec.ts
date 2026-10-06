/* El flujo proyectado por bloques · motor puro (lib/proyeccion.ts).
 *
 * Mike, 6-oct: «presentar por bloques de tiempo, ya sea por semana, por
 * quincena, por mes, por trimestre, por semestre y por año. Quiero ver
 * todos los gastos y los cobros que están planeados para esa semana. (…)
 * programar la nómina para que también se considere en los gastos».
 *
 * LO QUE DE VERDAD APORTA: que los bloques corten donde deben (la quincena
 * el 16, el trimestre en octubre, el año en enero), que el primer bloque
 * cuente desde HOY y no desde que empieza el bloque —si no, con bloques de
 * un año se restaría dos veces lo que ya pasó—, que la nómina programada
 * caiga en cada fecha de pago y que un corte abierto la sustituya en vez de
 * sumarse, y que una orden vencida o sin fecha caiga en el primer bloque.
 * Nada de esto lo revisa la pantalla: sólo pinta lo que sale de aquí.
 */

import { describe, expect, it } from "vitest";
import type { Opex } from "@/types/schema";
import {
  cobrosDeProyectos, etiquetaDeLapso, inicioDeBloque, lapsos, nominaOcurreEn, planear, primerBloqueBajoUmbral, proyectar,
  siguienteBloque,
} from "@/lib/proyeccion";
import type { ProgramaDeNomina } from "@/lib/nomina";

/** Un Timestamp de Firestore se parece a esto, y es todo lo que el motor usa. */
const ts = (dia: string) => ({ toDate: () => new Date(dia + "T12:00:00") }) as unknown as Opex["fecha_inicio"];
const d = (dia: string) => new Date(dia + "T00:00:00");
const dia = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

const opex = (o: Partial<Opex> & { nombre: string; monto: number }): Opex => ({
  tipo: "egreso", moneda: "MXN", frecuencia: "mensual", dia_del_mes: 1, fecha_inicio: ts("2026-01-01"),
  activo: true, creado_at: ts("2026-01-01"), creado_por: "x", id: o.nombre, ...o,
});

const HOY = d("2026-10-06"); // martes

describe("los bloques cortan donde deben", () => {
  it("la semana empieza en lunes; la quincena el 1 y el 16; el trimestre, semestre y año donde todos saben", () => {
    expect(dia(inicioDeBloque("semana", HOY))).toBe("2026-10-05");
    expect(dia(inicioDeBloque("semana", d("2026-10-11")))).toBe("2026-10-05"); // domingo cierra la semana
    expect(dia(inicioDeBloque("quincena", d("2026-10-15")))).toBe("2026-10-01");
    expect(dia(inicioDeBloque("quincena", d("2026-10-16")))).toBe("2026-10-16");
    expect(dia(inicioDeBloque("mes", HOY))).toBe("2026-10-01");
    expect(dia(inicioDeBloque("trimestre", HOY))).toBe("2026-10-01");
    expect(dia(inicioDeBloque("trimestre", d("2026-09-30")))).toBe("2026-07-01");
    expect(dia(inicioDeBloque("semestre", HOY))).toBe("2026-07-01");
    expect(dia(inicioDeBloque("anio", HOY))).toBe("2026-01-01");
  });

  it("el siguiente bloque sigue sin huecos, también en febrero y al cruzar el año", () => {
    expect(dia(siguienteBloque("quincena", d("2026-02-16")))).toBe("2026-03-01");
    expect(dia(siguienteBloque("quincena", d("2026-02-01")))).toBe("2026-02-16");
    expect(dia(siguienteBloque("mes", d("2026-12-01")))).toBe("2027-01-01");
    expect(dia(siguienteBloque("trimestre", d("2026-10-01")))).toBe("2027-01-01");
    expect(dia(siguienteBloque("semestre", d("2026-07-01")))).toBe("2027-01-01");
    expect(dia(siguienteBloque("anio", d("2026-01-01")))).toBe("2027-01-01");
    expect(dia(siguienteBloque("semana", d("2026-12-28")))).toBe("2027-01-04");
  });

  it("los lapsos cubren el horizonte ENTERO —el último bloque es el que contiene hoy + N meses, completo— y cada fin es un milisegundo antes del siguiente inicio", () => {
    /* Tres meses desde el 6 de octubre llegan al 6 de enero, así que la
     * 1.ª quincena de enero entra entera. Un bloque nunca se parte: uno que
     * dijera «2027» con sólo diez meses adentro mentiría. */
    const ls = lapsos("quincena", HOY, 3);
    expect(dia(ls[0].inicio)).toBe("2026-10-01");
    expect(ls.length, "de octubre a la 1.ª quincena de enero: siete").toBe(7);
    expect(dia(ls[6].inicio)).toBe("2027-01-01");
    for (let i = 1; i < ls.length; i++) expect(ls[i].inicio.getTime() - ls[i - 1].fin.getTime()).toBe(1);
    expect(lapsos("anio", HOY, 12).map((l) => l.inicio.getFullYear())).toEqual([2026, 2027]);
    expect(lapsos("semana", HOY, 12)).toHaveLength(53);
  });

  it("y se llaman como la gente los llama", () => {
    const l = (b: Parameters<typeof lapsos>[0], desde: string) => etiquetaDeLapso(b, lapsos(b, d(desde), 1)[0]);
    expect(l("semana", "2026-10-06")).toMatch(/^Semana del 5 oct/);
    expect(l("quincena", "2026-10-06")).toBe("1.ª quincena de octubre");
    expect(l("quincena", "2026-10-20")).toBe("2.ª quincena de octubre");
    expect(l("mes", "2026-10-06")).toBe("Octubre 2026");
    expect(l("trimestre", "2026-10-06")).toBe("4.º trimestre 2026");
    expect(l("semestre", "2026-03-06")).toBe("1.º semestre 2026");
    expect(l("anio", "2026-10-06")).toBe("2026");
  });
});

describe("lo planeado cae en su fecha", () => {
  const renta = opex({ nombre: "Renta", monto: 20_000, dia_del_mes: 1 });
  const luz = opex({ nombre: "Luz", monto: 1_500, dia_del_mes: 31 });
  const iguala = opex({ nombre: "Iguala", monto: 8_000, tipo: "ingreso", frecuencia: "semanal", dia_semana: 5 });

  it("el primer bloque cuenta de HOY en adelante, no desde que empieza el bloque", () => {
    /* Hoy es 6 de octubre: la renta del día 1 ya pasó y el saldo de hoy ya
     * la trae. Con bloques de un año, contar enero a octubre restaría dos
     * veces. */
    const porMes = proyectar(100_000, { opex: [renta] }, { bloque: "mes", meses: 3, hoy: HOY });
    expect(porMes[0].egresos, "octubre: la renta del 1 ya pasó").toBe(0);
    expect(porMes[1].egresos).toBe(20_000);
    const porAnio = proyectar(100_000, { opex: [renta] }, { bloque: "anio", meses: 12, hoy: HOY });
    expect(porAnio[0].egresos, "2026: sólo noviembre y diciembre").toBe(40_000);
    expect(porAnio[1].egresos, "2027 entero: el bloque no se parte").toBe(240_000);
  });

  it("un OPEX del día 31 cae el último día en los meses cortos, y el semanal cada viernes", () => {
    const p = proyectar(0, { opex: [luz, iguala] }, { bloque: "mes", meses: 3, hoy: HOY });
    const nov = p[1];
    expect(nov.planeados.find((x) => x.nombre === "Luz")!.fecha.getDate()).toBe(30);
    expect(nov.planeados.filter((x) => x.nombre === "Iguala")).toHaveLength(4);
    expect(nov.ingresos).toBe(32_000);
  });

  it("el saldo se arrastra de un bloque al siguiente y el aviso dice dónde cruza cero", () => {
    const p = proyectar(25_000, { opex: [renta] }, { bloque: "mes", meses: 4, hoy: HOY });
    expect(p.map((b) => b.saldo_final), "de octubre a febrero, que contiene el 6 de febrero").toEqual([25_000, 5_000, -15_000, -35_000, -55_000]);
    expect(etiquetaDeLapso("mes", primerBloqueBajoUmbral(p)!)).toBe("Diciembre 2026");
    expect(primerBloqueBajoUmbral(proyectar(1_000_000, { opex: [renta] }, { bloque: "mes", meses: 4, hoy: HOY }))).toBeNull();
  });
});

describe("la nómina programada entra como gasto", () => {
  const semanal: ProgramaDeNomina = { activo: true, frecuencia: "semanal", dia_semana: 6, dia_del_mes: null, monto: 18_500, nota: "", actualizado_at: null };
  const quincenal: ProgramaDeNomina = { ...semanal, frecuencia: "quincenal", dia_semana: null };
  const mensual: ProgramaDeNomina = { ...semanal, frecuencia: "mensual", dia_semana: null, dia_del_mes: 31 };

  it("cada sábado, el 15 y el último del mes, o el día dicho recortado al mes corto", () => {
    expect(nominaOcurreEn(d("2026-10-10"), semanal)).toBe(true);
    expect(nominaOcurreEn(d("2026-10-09"), semanal)).toBe(false);
    expect(nominaOcurreEn(d("2026-10-15"), quincenal)).toBe(true);
    expect(nominaOcurreEn(d("2026-10-31"), quincenal)).toBe(true);
    expect(nominaOcurreEn(d("2026-11-30"), quincenal)).toBe(true);
    expect(nominaOcurreEn(d("2026-10-30"), quincenal)).toBe(false);
    expect(nominaOcurreEn(d("2026-02-28"), mensual)).toBe(true);
    expect(nominaOcurreEn(d("2026-10-10"), { ...semanal, activo: false })).toBe(false);
  });

  it("la semanal cae cuatro o cinco veces al mes, con el monto estimado, y se marca como estimada", () => {
    const p = proyectar(0, { opex: [], nomina: { programa: semanal, borradores: [] } }, { bloque: "mes", meses: 2, hoy: HOY });
    const oct = p[0].planeados;
    expect(oct.map((x) => x.fecha.getDate()), "los sábados que quedan de octubre").toEqual([10, 17, 24, 31]);
    expect(oct.every((x) => x.clase === "nomina" && x.estimado && x.monto === 18_500)).toBe(true);
    expect(p[0].egresos).toBe(74_000);
  });

  it("un corte abierto SUSTITUYE la estimación de su periodo, con su total de verdad; uno vencido cae en el primer bloque", () => {
    const borradores = [
      { id: "r1", periodo_inicio: "2026-10-05", periodo_fin: "2026-10-11", total: 21_300 },
      { id: "r0", periodo_inicio: "2026-09-28", periodo_fin: "2026-10-04", total: 17_900 },
    ];
    const p = proyectar(0, { opex: [], nomina: { programa: semanal, borradores } }, { bloque: "semana", meses: 1, hoy: HOY });
    const estaSemana = p[0].planeados;
    expect(estaSemana.filter((x) => x.estimado), "el sábado 10 ya tiene corte: no se estima").toHaveLength(0);
    expect(estaSemana.find((x) => x.id === "r1")).toMatchObject({ monto: 21_300, vencido: false });
    expect(estaSemana.find((x) => x.id === "r0")).toMatchObject({ monto: 17_900, vencido: true });
    expect(p[0].egresos).toBe(21_300 + 17_900);
    expect(p[1].planeados, "la semana siguiente vuelve a estimarse").toHaveLength(1);
    expect(p[1].planeados[0].estimado).toBe(true);
  });
});

describe("las órdenes de compra pendientes entran en su fecha máxima de pago", () => {
  it("en su fecha; vencida o sin fecha, en el primer bloque y marcada", () => {
    const ordenes = [
      { id: "a", nombre: "OC-1 · Maderas", monto: 5_000, fecha_maxima_pago: "2026-10-20" },
      { id: "b", nombre: "OC-2 · Herrajes", monto: 2_000, fecha_maxima_pago: "2026-09-30" },
      { id: "c", nombre: "OC-3 · Vidrio", monto: 3_000, fecha_maxima_pago: null },
      { id: "d", nombre: "OC-4 · Lejos", monto: 9_000, fecha_maxima_pago: "2027-06-01" },
    ];
    const p = proyectar(0, { opex: [], ordenes }, { bloque: "semana", meses: 1, hoy: HOY });
    const primera = p[0].planeados;
    expect(primera.map((x) => x.id).sort()).toEqual(["b", "c"]);
    expect(primera.find((x) => x.id === "b")!.vencido).toBe(true);
    expect(primera.find((x) => x.id === "c")!.sin_fecha).toBe(true);
    expect(p[2].planeados.map((x) => x.id), "la semana del 19 al 25").toEqual(["a"]);
    expect(p.flatMap((b) => b.planeados).some((x) => x.id === "d"), "fuera del horizonte: no entra").toBe(false);
  });

  it("y todo lo planeado sale ordenado por fecha", () => {
    const todo = planear(
      { opex: [opex({ nombre: "Renta", monto: 1, dia_del_mes: 20 })], ordenes: [{ id: "a", nombre: "OC", monto: 1, fecha_maxima_pago: "2026-10-12" }] },
      HOY, d("2026-10-31"),
    );
    expect(todo.map((x) => x.id)).toEqual(["a", "Renta"]);
  });
});

describe("los cobros de proyectos entran por su plan de pagos, con lo cobrado descontado (0.72.0)", () => {
  /* Mike escogió con botones (6-oct): «plan de pagos por proyecto». Lo que
   * se mide: que lo cobrado cubra las parcialidades EN ORDEN DE FECHA, que
   * lo que sobra de cada una sea el cobro que falta, que lo por cobrar sin
   * parcialidad quede sin fecha y se diga cuánto es, y que un proyecto
   * cobrado de más no reste ni invente cobros negativos. */
  const cocina = { id: "p1", nombre: "Cocina", precio_venta: 1_000_000, cobrado: 450_000 };
  const plan = [
    { id: "c", proyecto_id: "p1", concepto: "Entrega", fecha: "2026-12-15", monto: 300_000 },
    { id: "a", proyecto_id: "p1", concepto: "Anticipo", fecha: "2026-10-20", monto: 400_000 },
    { id: "b", proyecto_id: "p1", concepto: "Avance", fecha: "2026-11-15", monto: 300_000 },
  ];

  it("lo cobrado cubre primero la parcialidad más vieja; lo que sobra de cada una es lo que falta", () => {
    const r = cobrosDeProyectos([cocina], plan);
    expect(r.cobros.map((c) => [c.id, c.monto])).toEqual([["b", 250_000], ["c", 300_000]]);
    expect(r.cobros[0].nombre).toBe("Cocina · Avance");
    expect(r.sin_fecha, "el plan cubre todo el precio").toBe(0);
    expect(r.proyectos_sin_fecha).toBe(0);
  });

  it("lo por cobrar que ningún plan fecha queda sin fecha, y se dice de cuántos proyectos", () => {
    const closet = { id: "p2", nombre: "Clóset", precio_venta: 200_000, cobrado: 0 };
    const r = cobrosDeProyectos([cocina, closet], [...plan, { id: "d", proyecto_id: "p2", concepto: "", fecha: "2026-11-01", monto: 50_000 }]);
    expect(r.cobros.find((c) => c.id === "d")).toMatchObject({ nombre: "Clóset · Parcialidad", monto: 50_000 });
    expect(r.sin_fecha).toBe(150_000);
    expect(r.proyectos_sin_fecha).toBe(1);
    const sinPlan = cobrosDeProyectos([closet], []);
    expect(sinPlan.cobros).toEqual([]);
    expect(sinPlan.sin_fecha).toBe(200_000);
  });

  it("cobrado de más: nada pendiente, nada negativo", () => {
    const r = cobrosDeProyectos([{ ...cocina, cobrado: 1_200_000 }], plan);
    expect(r.cobros).toEqual([]);
    expect(r.sin_fecha).toBe(0);
  });

  it("en la proyección caen en su fecha como ingreso; la vencida, en el primer bloque y marcada", () => {
    const r = cobrosDeProyectos([{ ...cocina, cobrado: 0 }], [
      ...plan,
      { id: "z", proyecto_id: "p1", concepto: "Vieja", fecha: "2026-09-01", monto: 10_000 },
    ]);
    const p = proyectar(0, { opex: [], cobros: r.cobros }, { bloque: "mes", meses: 3, hoy: HOY });
    expect(p[0].planeados.map((x) => [x.id, x.vencido])).toEqual([["z", true], ["a", false]]);
    expect(p[0].ingresos).toBe(410_000);
    expect(p[1].ingresos).toBe(300_000);
    expect(p[2].ingresos).toBe(300_000);
    expect(p[0].planeados.every((x) => x.clase === "cobro" && x.tipo === "ingreso")).toBe(true);
  });
});
