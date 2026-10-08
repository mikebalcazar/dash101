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
  cobrosDeProyectos, compromisosDeProyectos, etiquetaDeLapso, inicioDeBloque, lapsos, nominaOcurreEn, planear, primerBloqueBajoUmbral, proyectar,
  rondaParaCubrir, siguienteBloque,
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

describe("los compromisos con proveedores entran en su fecha esperada, con lo pagado y las órdenes descontados (0.73.0)", () => {
  /* Mike, 6-oct: «el costo de cada fase, así de ahí se pobla la lista de
   * compromisos de gastos en el proyecto para la proyección del flujo». Lo
   * que se mide: que lo que falta sea acordado − pagado − órdenes pendientes
   * que ya apuntan a la partida (para no contar dos veces), que la que no
   * tiene fecha quede fuera y se diga cuánto es, y que caigan como egreso. */
  const partidas = [
    { id: "a", proyecto_nombre: "Cocina", proveedor_nombre: "Maderas", concepto: "MW-01 · Entrega de material", monto_acordado: 30_000, monto_pagado: 10_000, fecha_esperada: "2026-10-20" },
    { id: "b", proyecto_nombre: "Cocina", proveedor_nombre: "Goyo", concepto: "MW-01 · Fabricación", monto_acordado: 30_000, monto_pagado: 0, fecha_esperada: "2026-11-25" },
    { id: "c", proyecto_nombre: "Cocina", proveedor_nombre: "Herrería", concepto: null, monto_acordado: 8_000, monto_pagado: 0, fecha_esperada: null },
    { id: "d", proyecto_nombre: "Cocina", proveedor_nombre: "Vidrio", concepto: "Pagada", monto_acordado: 5_000, monto_pagado: 5_000, fecha_esperada: "2026-10-30" },
  ];

  it("lo que falta es acordado − pagado − órdenes pendientes de esa partida; la pagada no entra; la sin fecha se cuenta aparte", () => {
    const r = compromisosDeProyectos(partidas, [{ partida_id: "a", monto: 5_000 }, { partida_id: null, monto: 999 }]);
    expect(r.compromisos.map((c) => [c.id, c.monto])).toEqual([["a", 15_000], ["b", 30_000]]);
    expect(r.compromisos[0].nombre).toBe("Cocina · MW-01 · Entrega de material (Maderas)");
    expect(r.sin_fecha).toBe(8_000);
    expect(r.cuantos_sin_fecha).toBe(1);
  });

  it("caen como egreso en su fecha; la vencida, en el primer bloque y marcada", () => {
    const r = compromisosDeProyectos([...partidas, { id: "z", proyecto_nombre: "Clóset", proveedor_nombre: null, concepto: "Vieja", monto_acordado: 1_000, monto_pagado: 0, fecha_esperada: "2026-09-01" }]);
    const p = proyectar(0, { opex: [], compromisos: r.compromisos }, { bloque: "mes", meses: 3, hoy: HOY });
    expect(p[0].planeados.map((x) => [x.id, x.vencido])).toEqual([["z", true], ["a", false]]);
    expect(p[0].egresos).toBe(21_000);
    expect(p[1].egresos).toBe(30_000);
    expect(p[0].planeados.every((x) => x.clase === "compromiso" && x.tipo === "egreso")).toBe(true);
  });
});

describe("los préstamos de investor101 entran al flujo: lo que va a salir y lo que va a entrar (0.82.0)", () => {
  /* Mike, 8-oct: «esto se tiene que reflejar en la proyección de flujos de
   * dash». Lo que se mide: que el pago a un inversionista caiga como egreso
   * en su fecha y el depósito aceptado como ingreso en la suya; que un pago
   * vencido caiga en el primer bloque marcado «vencido»; y que un depósito
   * cuya fecha estimada ya pasó NO se llame vencido —nadie le debe nada a la
   * empresa—, sino «por confirmar». */
  const prestamos = [
    { id: "dep", nombre: "PRE-000001 · depósito de Ana", tipo: "ingreso" as const, monto: 50_000, fecha: "2026-10-09" },
    { id: "pago", nombre: "PRE-000001 · pago 1 de 1 a Ana", tipo: "egreso" as const, monto: 51_050, fecha: "2026-10-30" },
    { id: "viejo", nombre: "PRE-000000 · pago 2 de 2 a Beto", tipo: "egreso" as const, monto: 5_200, fecha: "2026-10-01" },
    { id: "tarde", nombre: "PRE-000002 · depósito de Caro", tipo: "ingreso" as const, monto: 20_000, fecha: "2026-10-02" },
    { id: "lejos", nombre: "PRE-000003 · pago 9 de 9", tipo: "egreso" as const, monto: 1, fecha: "2028-01-01" },
  ];

  it("cada uno en su fecha y con su signo; lo vencido y lo por confirmar, en el primer bloque y dicho", () => {
    const p = proyectar(10_000, { opex: [], prestamos }, { bloque: "semana", meses: 1, hoy: HOY });
    const todos = p.flatMap((b) => b.planeados);
    expect(todos.every((x) => x.clase === "prestamo")).toBe(true);
    expect(todos.map((x) => x.id).sort()).toEqual(["dep", "pago", "tarde", "viejo"]); // «lejos» queda fuera del horizonte
    const de = (id: string) => todos.find((x) => x.id === id)!;
    expect([de("viejo").tipo, de("viejo").vencido, de("viejo").por_confirmar, dia(de("viejo").fecha)]).toEqual(["egreso", true, false, "2026-10-06"]);
    expect([de("tarde").tipo, de("tarde").vencido, de("tarde").por_confirmar, dia(de("tarde").fecha)]).toEqual(["ingreso", false, true, "2026-10-06"]);
    expect([de("dep").vencido, de("dep").por_confirmar, dia(de("dep").fecha)]).toEqual([false, false, "2026-10-09"]);
    // La semana de hoy: entran 50,000 + 20,000 y salen 5,200.
    expect([p[0].ingresos, p[0].egresos, p[0].saldo_final]).toEqual([70_000, 5_200, 74_800]);
    // Y la semana del 26 de octubre sale el pago con su interés.
    const cuarta = p.find((b) => b.planeados.some((x) => x.id === "pago"))!;
    expect(dia(cuarta.inicio)).toBe("2026-10-26");
    expect(cuarta.saldo_final).toBe(74_800 - 51_050);
  });

  it("sin la fuente (quien mira no dirige la empresa) la proyección sale igual, sin préstamos", () => {
    const con = proyectar(0, { opex: [], prestamos: null }, { bloque: "mes", meses: 2, hoy: HOY });
    expect(con.every((b) => b.planeados.length === 0)).toBe(true);
  });
});

describe("cubrir un hueco del flujo con una ronda de investor101", () => {
  /* Mike, 8-oct: «taller tiene un periodo de falta de flujo (necesita pagar
   * 30k durante las siguientes 3 semanas (90k total)) (…) desde dash donde
   * tenemos déficit de flujos, poder seleccionar esa parte y generar una
   * ronda de inversión para cubrir ese flujo». Su ejemplo, tal cual: tres
   * nóminas de 30 mil, sin dinero en la cuenta, y un cobro grande después. */
  const fuentes = {
    opex: [opex({ nombre: "Nómina", monto: 30_000, frecuencia: "semanal", dia_semana: 5, fecha_inicio: ts("2026-10-01"), fecha_fin: ts("2026-10-23") as never })],
    cobros: [{ id: "c", nombre: "Obra · Finiquito", monto: 150_000, fecha: "2026-11-05" }],
  };
  const p = proyectar(0, fuentes, { bloque: "semana", meses: 2, hoy: HOY });

  it("el ejemplo: tres semanas a 30 mil dejan un hueco de 90 mil, que se recupera con el cobro", () => {
    expect(p.slice(0, 5).map((b) => b.saldo_final)).toEqual([-30_000, -60_000, -90_000, -90_000, 60_000]);
    const r = rondaParaCubrir(p, [0, 1, 2], HOY)!;
    expect(r.deficit).toBe(90_000);
    expect(r.fecha_inicio).toBe("2026-10-06"); // el hueco ya empezó: el dinero hace falta hoy
    expect([r.desde, r.hasta]).toEqual(["2026-10-06", "2026-10-25"]);
    expect(r.se_recupera).toBe(true);
    expect(r.fecha_vencimiento).toBe("2026-11-08"); // el cierre de la semana en que entra el cobro
  });

  it("marcando sólo una parte, la ronda cubre lo más hondo de ESA parte, y el dinero hace falta el día antes", () => {
    const r = rondaParaCubrir(p, [1], HOY)!;
    expect(r.deficit).toBe(60_000);
    expect(r.fecha_inicio).toBe("2026-10-11"); // el domingo antes de la semana del 12
    expect([r.desde, r.hasta]).toEqual(["2026-10-12", "2026-10-18"]);
    // No importa en qué orden se marquen.
    expect(rondaParaCubrir(p, [2, 0], HOY)!.deficit).toBe(90_000);
  });

  it("si en el horizonte el saldo no vuelve, propone treinta días después y lo dice", () => {
    const sin = proyectar(0, { opex: fuentes.opex }, { bloque: "semana", meses: 2, hoy: HOY });
    const r = rondaParaCubrir(sin, [0, 1, 2], HOY)!;
    expect(r.se_recupera).toBe(false);
    expect(r.fecha_vencimiento).toBe("2026-11-24"); // 25-oct + 30 días
  });

  it("sin nada marcado, o marcando bloques que no cierran en negativo, no hay ronda que proponer", () => {
    expect(rondaParaCubrir(p, [], HOY)).toBeNull();
    expect(rondaParaCubrir(p, [4, 5], HOY)).toBeNull();
    // Los centavos del hueco se redondean hacia arriba: se pide lo que alcanza.
    const fino = proyectar(-1000.4, { opex: [] }, { bloque: "semana", meses: 1, hoy: HOY });
    expect(rondaParaCubrir(fino, [0], HOY)!.deficit).toBe(1001);
  });
});

describe("la liga a patron101 (por dentro, investor101)", () => {
  it("en el dominio propio va a patron101; en workers.dev el Worker conserva su nombre", async () => {
    const { hostDePatron } = await import("@/lib/inversion");
    expect(hostDePatron("dash101.taller101.com")).toBe("patron101.taller101.com");
    expect(hostDePatron("dash101-staging.mike-929.workers.dev")).toBe("investor101-staging.mike-929.workers.dev");
    expect(hostDePatron("dash101.mike-929.workers.dev")).toBe("investor101.mike-929.workers.dev");
  });
});
