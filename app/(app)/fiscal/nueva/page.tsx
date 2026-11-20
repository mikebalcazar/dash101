"use client";

/* Fiscal · Nueva factura: armarla, revisarla, guardarla como prefactura y
 * timbrarla.
 *
 * Mike, 8-oct-2026: «generar y timbrar facturas»; con botones: Facturama,
 * v1 sólo factura de Ingreso y cancelación, todo de contado (PUE), nace de
 * un proyecto o libre.
 *
 * La pantalla no decide nada fiscal: el borrador va en centavos a la API,
 * que lo revisa (`/emitir/revisar`) y hace las cuentas; lo que ella diga es
 * lo que se enseña. Timbrar es un solo botón y una sola llamada; si
 * Facturama dice que no, se enseña campo por campo lo que dijo.
 *
 * Tercera vuelta (Mike, 15-oct-2026): el cliente escogido se queda a la
 * vista; la descripción crece con el texto; la clave del SAT dice qué
 * significa (división › clase › producto, informativo); un correo por campo
 * con su casilla de «mandar»; lo que se cambie del cliente se guarda en el
 * cliente (el mismo de toda la suite); guardar como PREFACTURA (sólo para
 * bajar su PDF) y timbrarla después; «nueva igual» desde una emitida; y la
 * fecha de expedición, hasta 72 h atrás (el SAT no admite más). */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { aCentavos, fis, ligaPdfPrefactura, mensajeDe, momento, motivoCorreo, pesos, type Fila } from "@/lib/bill";
import { buscarEn, catalogo, significado, type ClaveSat } from "@/lib/catalogo-sat";
import { org } from "@/lib/fuente";
import { useFiscal } from "@/components/fiscal/contexto";
import { Categorias } from "@/components/fiscal/categorias";
import { Sugeridor, type Sugerencia } from "@/components/fiscal/sugeridor";
import { Aviso, B, B_MAL, B_PRI, CAJA, CHICO, Cab, Campo, ConSigno, Err, Lista, Migas, Nota, Tarjeta, Vista, useAvisa, useCarga } from "@/components/fiscal/ui";

const USOS: [string, string][] = [["G01", "Adquisición de mercancías"], ["G02", "Devoluciones, descuentos o bonificaciones"], ["G03", "Gastos en general"], ["I01", "Construcciones"], ["I02", "Mobiliario y equipo de oficina por inversiones"], ["I03", "Equipo de transporte"], ["I04", "Equipo de cómputo"], ["I05", "Dados, troqueles, moldes, matrices y herramental"], ["I06", "Comunicaciones telefónicas"], ["I07", "Comunicaciones satelitales"], ["I08", "Otra maquinaria y equipo"], ["D01", "Honorarios médicos"], ["D02", "Gastos médicos por incapacidad"], ["D03", "Gastos funerales"], ["D04", "Donativos"], ["D05", "Intereses de créditos hipotecarios"], ["D06", "Aportaciones voluntarias al SAR"], ["D07", "Primas de seguros de gastos médicos"], ["D08", "Gastos de transportación escolar"], ["D09", "Depósitos en cuentas para el ahorro"], ["D10", "Pagos por servicios educativos"], ["S01", "Sin efectos fiscales"], ["CP01", "Pagos"], ["CN01", "Nómina"]];
const REGIMENES: [string, string][] = [["601", "General de Ley Personas Morales"], ["603", "Personas Morales con Fines no Lucrativos"], ["605", "Sueldos y Salarios"], ["606", "Arrendamiento"], ["607", "Enajenación o adquisición de bienes"], ["608", "Demás ingresos"], ["610", "Residentes en el Extranjero"], ["611", "Ingresos por Dividendos"], ["612", "Personas Físicas con Actividades Empresariales y Profesionales"], ["614", "Ingresos por intereses"], ["615", "Ingresos por obtención de premios"], ["616", "Sin obligaciones fiscales"], ["620", "Sociedades Cooperativas de Producción"], ["621", "Incorporación Fiscal"], ["622", "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras"], ["623", "Opcional para Grupos de Sociedades"], ["624", "Coordinados"], ["625", "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas"], ["626", "Régimen Simplificado de Confianza (RESICO)"]];
const FORMAS: [string, string][] = [["03", "Transferencia electrónica"], ["01", "Efectivo"], ["02", "Cheque nominativo"], ["04", "Tarjeta de crédito"], ["28", "Tarjeta de débito"], ["06", "Dinero electrónico"], ["17", "Compensación"], ["30", "Aplicación de anticipos"]];
const CAMPO: Record<string, string> = { "receptor.rfc": "RFC", "receptor.razon_social": "Razón social", "receptor.regimen_fiscal": "Régimen fiscal", "receptor.cp_fiscal": "Código postal", "receptor.uso_cfdi": "Uso del CFDI", forma_pago: "Forma de pago", renglones: "Los renglones", correos: "Correos" };
const DE_RENGLON: Record<string, string> = { clave_prod_serv: "clave del SAT", clave_unidad: "unidad", descripcion: "descripción", cantidad: "cantidad", precio_unitario: "precio", descuento: "descuento", iva: "IVA" };
const nombreCampo = (c: string): string => CAMPO[c] || (c || "").replace(/^renglones\[(\d+)\]\.(\w+)$/, (_, i, k) => `Renglón ${Number(i) + 1}, ${DE_RENGLON[k] || k}`) || "Borrador";
const errorDe = (e: unknown): string => {
  const d = (e as { detalle?: Fila })?.detalle;
  return d?.campo ? `${nombreCampo(d.campo)}: ${d.motivo}` : mensajeDe(e);
};

const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
/** La hora del centro de México (la del SAT, UTC−6 fijo) como la espera
 *  <input type=datetime-local>: AAAA-MM-DDTHH:mm. Lo que se escribe en ese
 *  campo es hora del centro, no la del navegador: así una máquina en otra
 *  zona no manda una fecha «futura» a la API. */
const localIso = (d: Date) => new Date(d.getTime() - 6 * 3600_000).toISOString().slice(0, 16);

interface Renglon { k: number; clave_prod_serv: string; clave_unidad: string; unidad: string; descripcion: string; cantidad: string; precio_unitario: string; descuento: string; iva: string }
interface Correo { k: number; valor: string; mandar: boolean }
let siguiente = 1;
const renglonNuevo = (x: Partial<Renglon> = {}): Renglon => ({ k: siguiente++, clave_prod_serv: "", clave_unidad: "H87", unidad: "Pieza", descripcion: "", cantidad: "1", precio_unitario: "", descuento: "", iva: "16", ...x });
const correoNuevo = (valor = "", mandar = true): Correo => ({ k: siguiente++, valor, mandar });

/* ─────────────── un renglón ─────────────── */

function FilaRenglon({ r, pon, quitar }: { r: Renglon; pon: (cambios: Partial<Renglon>) => void; quitar: () => void }) {
  const [nombreClave, setNombreClave] = useState("");
  const [categorias, setCategorias] = useState(false);
  // Qué significa la clave que está escrita (informativo).
  useEffect(() => {
    const k = r.clave_prod_serv.trim();
    if (k.length !== 8) { setNombreClave(k ? "" : ""); return; }
    let vivo = true;
    catalogo("prodserv").then((cat) => {
      if (!vivo) return;
      const x = cat.filas.find((c) => c.k === k);
      setNombreClave(x ? significado(cat, x) : "No está en el catálogo del SAT");
    }, () => {});
    return () => { vivo = false; };
  }, [r.clave_prod_serv]);

  const c = Number(r.cantidad), p = aCentavos(r.precio_unitario, true);
  const importe = Number.isFinite(c) && p !== null ? (Math.round(c * p) / 100).toFixed(2) : "";

  return (
    <div className="border border-black/10 rounded-xl p-3 mb-2" data-renglon>
      <div className="grid grid-cols-2 md:grid-cols-12 gap-2">
        <Campo e="Clave SAT" className="md:col-span-3">
          <div className="flex gap-1">
            <div className="flex-1 min-w-0">
              <Sugeridor className={CAJA} name="clave_prod_serv" inputMode="numeric" maxLength={8} placeholder="Buscar…" required
                valor={r.clave_prod_serv} alCambiar={(v) => pon({ clave_prod_serv: v })} minimo={2}
                traer={async (q) => buscarEn((await catalogo("prodserv")).filas, q)}
                alEscoger={(x) => pon({ clave_prod_serv: x.k })} />
            </div>
            <button type="button" className={`${B} ${CHICO}`} data-categorias title="Buscar por categorías" onClick={() => setCategorias(true)}>☰</button>
          </div>
        </Campo>
        <Campo e="Unidad" className="md:col-span-2">
          <Sugeridor className={CAJA} name="clave_unidad" maxLength={3} autoCapitalize="characters" required
            valor={r.clave_unidad} alCambiar={(v) => pon({ clave_unidad: v.toUpperCase(), unidad: "" })} minimo={1}
            traer={async (q) => buscarEn((await catalogo("unidades")).filas, q, 20)}
            alEscoger={(x) => pon({ clave_unidad: x.k, unidad: x.t })}
            onBlur={async () => {
              const k = r.clave_unidad.trim().toUpperCase();
              if (!k || r.unidad) return;
              const x = (await catalogo("unidades").catch(() => ({ filas: [] as ClaveSat[] }))).filas.find((u) => u.k === k);
              pon({ unidad: x ? x.t : "" });
            }} />
        </Campo>
        <Campo e="Descripción" className="col-span-2 md:col-span-7">
          <Sugeridor multilinea className={CAJA} name="descripcion" maxLength={1000} placeholder="Escribe, o escoge de lo ya facturado…" required
            valor={r.descripcion} alCambiar={(v) => pon({ descripcion: v })} minimo={0} alEnfocar callado
            traer={async (q) => ((await fis(`/conceptos?q=${encodeURIComponent(q)}`)).filas || []).map((k: Fila): Sugerencia => ({
              k: k.clave_prod_serv, t: k.descripcion, c: k,
              x: `${k.clave_unidad} · ${pesos(k.precio_unitario)} · ${k.iva === null ? "no objeto" : `IVA ${k.iva} %`} · ${k.veces} ${k.veces === 1 ? "vez" : "veces"}`,
            }))}
            alEscoger={(x) => {
              const k = x.c as Fila;
              pon({ descripcion: k.descripcion, clave_prod_serv: k.clave_prod_serv, clave_unidad: k.clave_unidad, unidad: k.unidad || "", precio_unitario: (k.precio_unitario / 100).toFixed(2), iva: k.iva === null ? "no" : String(k.iva) });
            }} />
        </Campo>
        <Campo e="Cantidad" className="md:col-span-2"><input className={CAJA} name="cantidad" inputMode="decimal" required value={r.cantidad} onChange={(e) => pon({ cantidad: e.target.value })} /></Campo>
        <Campo e="Precio unitario" className="md:col-span-3"><ConSigno><input className={CAJA} name="precio_unitario" inputMode="decimal" placeholder="0.00" required value={r.precio_unitario} onChange={(e) => pon({ precio_unitario: e.target.value })} /></ConSigno></Campo>
        <Campo e="Importe" className="md:col-span-2"><ConSigno><input className={CAJA} name="importe" readOnly tabIndex={-1} value={importe} /></ConSigno></Campo>
        <Campo e="Descuento" className="md:col-span-2"><ConSigno><input className={CAJA} name="descuento" inputMode="decimal" placeholder="0.00" value={r.descuento} onChange={(e) => pon({ descuento: e.target.value })} /></ConSigno></Campo>
        <Campo e="Impuesto" className="md:col-span-2">
          <select className={CAJA} name="iva" value={r.iva} onChange={(e) => pon({ iva: e.target.value })}>
            <option value="16">IVA 16 %</option><option value="0">IVA 0 %</option><option value="no">No objeto</option>
          </select>
        </Campo>
        <div className="col-span-2 md:col-span-1 flex items-end justify-end">
          <button type="button" className={`${B_MAL} ${CHICO}`} data-quitar aria-label="Quitar renglón" onClick={quitar}>×</button>
        </div>
      </div>
      {(nombreClave || r.unidad) && (
        <p className="text-[11px] text-ink-muted mt-2 flex flex-wrap gap-x-4">
          {nombreClave && <span data-nombre-clave title={nombreClave}>{nombreClave}</span>}
          {r.unidad && <span data-nombre-unidad>{r.clave_unidad} · {r.unidad}</span>}
        </p>
      )}
      {categorias && <Categorias alCerrar={() => setCategorias(false)} alEscoger={(x) => pon({ clave_prod_serv: x.k })} />}
    </div>
  );
}

/* ─────────────── la forma ─────────────── */

function Forma({ ini }: { ini: Fila }) {
  const { pac, pre, prefactura, de, clienteDeArranque, q } = ini;
  const router = useRouter();
  const avisa = useAvisa();
  const { administra: admin } = useFiscal();
  const base: Fila | null = prefactura?.borrador || de?.borrador || null;
  const r0: Fila = base ? base.receptor : pre.receptor;
  const sinCuenta = !pac.cuenta;
  const puede = pac.puede_emitir && !sinCuenta;
  const proyectoId: string | null = q.proyecto || prefactura?.proyecto_id || de?.proyecto_id || null;
  const prefacturaId: string | null = prefactura && !prefactura.cfdi_id ? prefactura.id : null;
  const ahora = useRef(new Date()).current;

  const [renglones, setRenglones] = useState<Renglon[]>(() => (base
    ? base.renglones.map((x: Fila) => renglonNuevo({
        clave_prod_serv: x.clave_prod_serv || "", clave_unidad: x.clave_unidad || "H87", unidad: x.unidad || "", descripcion: x.descripcion || "",
        cantidad: String(x.cantidad ?? 1), precio_unitario: (x.precio_unitario / 100).toFixed(2), descuento: x.descuento ? (x.descuento / 100).toFixed(2) : "", iva: x.iva === null ? "no" : String(x.iva),
      }))
    : [pre.proyecto
      ? renglonNuevo({ descripcion: `Mobiliario sobre medida · ${pre.proyecto.nombre}`, clave_prod_serv: "56101500", clave_unidad: "E48", unidad: "Unidad de servicio" })
      : renglonNuevo()]));
  const [rec, setRec] = useState({ rfc: r0.rfc || "", razon_social: r0.razon_social || "", regimen_fiscal: r0.regimen_fiscal || "", cp_fiscal: r0.cp_fiscal || "", uso_cfdi: r0.uso_cfdi || "G03" });
  const [cliente, setCliente] = useState<{ id: string; nombre: string } | null>(clienteDeArranque ? { id: clienteDeArranque.id, nombre: clienteDeArranque.nombre } : null);
  const [buscaCliente, setBuscaCliente] = useState<string>(clienteDeArranque?.nombre || "");
  const [correos, setCorreos] = useState<Correo[]>(() => { const l: string[] = clienteDeArranque?.correos || []; return (l.length ? l : [""]).map((c) => correoNuevo(c)); });
  const [formaPago, setFormaPago] = useState<string>(base?.forma_pago || "03");
  const [fecha, setFecha] = useState(localIso(ahora));
  const [observaciones, setObservaciones] = useState<string>(base?.observaciones || "");
  const [cuentas, setCuentas] = useState<Fila | null>(null);
  const [error, setError] = useState("");
  const [motivos, setMotivos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState("");

  const borrador = useCallback(() => ({
    receptor: { ...rec },
    forma_pago: formaPago, observaciones: observaciones || null,
    fecha: fecha ? fecha.slice(0, 16) : null,
    renglones: renglones.map((x) => ({
      descripcion: x.descripcion, clave_prod_serv: x.clave_prod_serv.trim(), clave_unidad: x.clave_unidad.trim().toUpperCase(),
      unidad: x.unidad || null,
      cantidad: Number(x.cantidad), precio_unitario: aCentavos(x.precio_unitario, true), descuento: aCentavos(x.descuento, true) || 0,
      iva: x.iva === "no" ? null : Number(x.iva),
    })),
  }), [rec, formaPago, observaciones, fecha, renglones]);

  /** Pide las cuentas a la API. `suave`: mientras se escribe, sin regañar por lo que falta. */
  const turno = useRef(0);
  const revisar = useCallback(async (suave: boolean): Promise<Fila | null> => {
    const mio = ++turno.current;
    setMotivos([]);
    const b = borrador();
    if (b.renglones.some((x) => x.precio_unitario === null)) { if (!suave) setError("Revisa los precios: sólo números, con punto para los centavos."); setCuentas(null); return null; }
    try {
      const r = await fis("/emitir/revisar", { body: { borrador: b } });
      if (mio !== turno.current) return null;
      setError(""); setCuentas(r.cuentas);
      return r;
    } catch (e) {
      if (mio !== turno.current) return null;
      setCuentas(null);
      const m = mensajeDe(e);
      if (!suave || !/falta|escoger|forma de RFC|al menos un/i.test(m)) setError(errorDe(e));
      return null;
    }
  }, [borrador]);
  // Mientras se escribe, las cuentas se piden solas (con calma).
  useEffect(() => {
    const t = setTimeout(() => void revisar(true), 400);
    return () => clearTimeout(t);
  }, [revisar]);

  /** Todos los correos (se guardan en el cliente) y a cuáles mandar. Un correo mal escrito detiene. */
  const losCorreos = (): { todos: string[]; enviarA: string[] } | null => {
    const todos: string[] = [], enviarA: string[] = [];
    for (const c of correos) {
      const v = c.valor.trim().toLowerCase();
      if (!v) continue;
      if (!correoValido(v)) { setError(`«${v}» no tiene forma de correo.`); return null; }
      if (!todos.includes(v)) todos.push(v);
      if (c.mandar && !enviarA.includes(v)) enviarA.push(v);
    }
    return { todos, enviarA };
  };

  const ponRec = (k: keyof typeof rec) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setRec((x) => ({ ...x, [k]: e.target.value }));
  const quitarCliente = () => { setCliente(null); setBuscaCliente(""); };

  const vistaPrevia = async () => {
    if (!(await revisar(false))) return;
    try { sessionStorage.setItem("dash-fiscal-previa", JSON.stringify({ org: org(), borrador: borrador() })); } catch { setError("El navegador no deja guardar el borrador para la vista previa."); return; }
    const ventana = window.open("/imprimir/factura-previa", "_blank");
    if (!ventana) setError("El navegador bloqueó la pestaña de la vista previa: permite ventanas emergentes para dash101.");
  };
  const guardarPrefactura = async () => {
    if (!(await revisar(false))) return;
    const c = losCorreos(); if (!c) return;
    setOcupado("prefactura");
    try {
      const r = await fis(prefacturaId ? `/prefacturas/${encodeURIComponent(prefacturaId)}` : "/prefacturas", { method: prefacturaId ? "PUT" : "POST", body: { borrador: borrador(), proyecto_id: proyectoId, cliente_id: cliente?.id ?? null, correos: c.todos } });
      avisa(prefacturaId ? "Prefactura guardada." : "Guardada como prefactura. Bájala en PDF para mandarla de muestra.");
      if (!prefacturaId) router.replace(`/fiscal/nueva?prefactura=${encodeURIComponent(r.id)}`);
    } catch (e) { setError(errorDe(e)); } finally { setOcupado(""); }
  };
  const timbrar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!puede) return;
    const ok = await revisar(false);
    if (!ok) return;
    const c = losCorreos(); if (!c) return;
    const enviar = c.enviarA.length > 0;
    if (!confirm(`¿Timbrar esta factura por ${pesos(ok.cuentas.total)} a ${ok.borrador.receptor.razon_social}?${enviar ? `\n\nSe manda a: ${c.enviarA.join(", ")}` : ""}${pac.cuenta.sandbox ? "\n\n(Cuenta de pruebas: sin valor fiscal.)" : "\n\nUna vez timbrada, sólo se puede cancelar."}`)) return;
    setOcupado("timbrar");
    try {
      const r = await fis("/emitir", { body: { borrador: borrador(), proyecto_id: proyectoId, cliente_id: cliente?.id ?? null, prefactura_id: prefacturaId, correos: c.todos, enviar, enviar_a: c.enviarA } });
      avisa(`Timbrada: ${r.folio}.${r.correo ? (r.correo.enviado ? ` Mandada a ${r.correo.a.join(", ")}.` : ` No se mandó por correo: ${motivoCorreo(r.correo.motivo)}`) : ""}`, !!(r.correo && !r.correo.enviado));
      router.push(`/fiscal/facturas/${encodeURIComponent(r.cfdi_id)}`);
    } catch (e) {
      const x = e as { cual?: string; detalle?: Fila };
      setError(x.cual === "pac_rechaza" ? `Facturama no la timbró (folio ${x.detalle?.folio || ""}):` : errorDe(e));
      setMotivos(x.detalle?.motivos || (x.detalle?.que_hacer ? [x.detalle.que_hacer] : []));
      setOcupado("");
    }
  };

  const titulo = prefacturaId ? "Prefactura" : "Nueva factura";
  const subtitulo = prefacturaId ? `Guardada ${momento(prefactura.actualizada_at)}. Cámbiala, baja su PDF, o tímbrala: entonces se vuelve factura real con la fecha de ese momento.`
    : de ? `Igual a la ${de.serie}-${de.folio}, con la fecha de hoy. Cambia lo que haga falta y timbra.`
    : pre.proyecto ? <>Del proyecto <b>{pre.proyecto.nombre}</b>{pre.proyecto.facturado ? ` · ya facturado ${pesos(pre.proyecto.facturado)}` : ""}</> : "Factura de ingreso, de contado (PUE), en pesos.";

  return (
    <div>
      <Migas href="/fiscal/facturas?lado=emitidas">Facturas emitidas</Migas>
      <Cab titulo={titulo} sub={subtitulo} />
      {sinCuenta
        ? <Aviso tono="ojo">Para timbrar hace falta la cuenta de Facturama de la empresa. {pac.puede_configurar ? <>Se pone en <Link className="underline" href="/fiscal/ajustes">Ajustes</Link>.</> : "La pone quien dirige la empresa."}</Aviso>
        : pac.cuenta.sandbox ? <Aviso><b>Cuenta de pruebas (sandbox).</b> Lo que timbres aquí NO tiene valor fiscal: sirve para probar. Cuando contrates la cuenta de verdad, se cambia en Ajustes.</Aviso> : null}
      {!pac.puede_emitir && <Aviso>Puedes armarla y ver las cuentas. Timbra quien dirige la empresa o quien lleva la contabilidad.</Aviso>}

      <form id="f-nueva" onSubmit={timbrar}>
        <Tarjeta titulo="Qué" der={cuentas ? "cuentas de la API" : undefined} id="t-renglones" realce>
          <div id="renglones">
            {renglones.map((r) => (
              <FilaRenglon key={r.k} r={r}
                pon={(cambios) => setRenglones((l) => l.map((x) => (x.k === r.k ? { ...x, ...cambios } : x)))}
                quitar={() => { if (renglones.length === 1) { avisa("Una factura lleva al menos un renglón.", true); return; } setRenglones((l) => l.filter((x) => x.k !== r.k)); }} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <button type="button" className={`${B} ${CHICO}`} id="b-renglon" onClick={() => setRenglones((l) => [...l, renglonNuevo()])}>+ Renglón</button>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted tabular-nums">
              <span>Subtotal <b className="text-ink-dim" id="c-subtotal">{cuentas ? pesos(cuentas.subtotal) : "—"}</b></span>
              <span>Descuento <b className="text-ink-dim" id="c-descuento">{cuentas ? pesos(cuentas.descuento) : "—"}</b></span>
              <span>IVA <b className="text-ink-dim" id="c-iva">{cuentas ? pesos(cuentas.iva) : "—"}</b></span>
              <span className="text-sm">Total <b className="text-ink-dim" id="c-total">{cuentas ? pesos(cuentas.total) : "—"}</b></span>
            </div>
          </div>
          <Nota>Clave y unidad salen del catálogo oficial del SAT: escribe para buscar, o abre ☰ para ir por categorías. La descripción sugiere lo ya facturado.</Nota>
        </Tarjeta>

        <Tarjeta titulo="A quién" der={cliente ? <span id="c-cliente">Cliente: {cliente.nombre}</span> : undefined}>
          <Campo e="Cliente" chico="Al escoger uno se llena lo de abajo. Lo que cambies aquí se guarda en el cliente (el mismo de toda la suite). Con un RFC nuevo se da de alta." className="mb-3">
            <div className="flex gap-1">
              <div className="flex-1 min-w-0">
                <Sugeridor className={CAJA} name="buscar_cliente" placeholder="Nombre o RFC de un cliente…" minimo={0} alEnfocar
                  valor={buscaCliente} alCambiar={setBuscaCliente}
                  traer={async (t) => ((await fis(`/clientes?q=${encodeURIComponent(t)}`)).filas || []).map((c: Fila): Sugerencia => ({ k: c.rfc || "—", t: c.razon_social || c.nombre, x: c.razon_social && c.razon_social !== c.nombre ? c.nombre : "", c }))}
                  alEscoger={(x) => {
                    const c = x.c as Fila;
                    setCliente({ id: c.id, nombre: c.nombre }); setBuscaCliente(c.nombre);
                    setRec({ rfc: c.rfc || "", razon_social: c.razon_social || c.nombre || "", regimen_fiscal: c.regimen_fiscal || "", cp_fiscal: c.cp_fiscal || "", uso_cfdi: c.uso_cfdi || "G03" });
                    const l: string[] = c.correos || [];
                    setCorreos((l.length ? l : [""]).map((v) => correoNuevo(v)));
                  }}
                  onFocus={(e) => { if (cliente) (e.target as HTMLInputElement).select(); }}
                  onBlur={() => { if (cliente && !buscaCliente.trim()) quitarCliente(); else if (cliente) setBuscaCliente(cliente.nombre); }} />
              </div>
              {cliente && <button type="button" className={`${B} ${CHICO}`} id="b-quitar-cliente" title="Quitar el cliente escogido" onClick={quitarCliente}>×</button>}
            </div>
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Campo e="RFC" chico="XAXX010101000 = público en general.">
              <input className={CAJA} name="rfc" autoCapitalize="characters" spellCheck={false} maxLength={20} placeholder="ABC010101AB1" required value={rec.rfc} onChange={ponRec("rfc")}
                onBlur={() => {
                  // «Público en general»: con el RFC genérico el SAT exige nombre, régimen y uso fijos.
                  if (rec.rfc.toUpperCase().replace(/[\s.-]/g, "") !== "XAXX010101000") return;
                  setRec((x) => ({ ...x, razon_social: "PUBLICO EN GENERAL", regimen_fiscal: "616", uso_cfdi: "S01", cp_fiscal: x.cp_fiscal || pac.cuenta?.perfil?.cp || "" }));
                }} />
            </Campo>
            <Campo e="Razón social"><input className={CAJA} name="razon_social" placeholder="Como en la constancia, sin S.A. de C.V." required value={rec.razon_social} onChange={ponRec("razon_social")} /></Campo>
            <Campo e="Régimen fiscal">
              <select className={CAJA} name="regimen_fiscal" required value={rec.regimen_fiscal} onChange={ponRec("regimen_fiscal")}>
                <option value="">Escoger…</option>
                {REGIMENES.map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
              </select>
            </Campo>
            <Campo e="C.P. fiscal"><input className={CAJA} name="cp_fiscal" inputMode="numeric" maxLength={5} placeholder="64000" required value={rec.cp_fiscal} onChange={ponRec("cp_fiscal")} /></Campo>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Campo e="Uso del CFDI">
              <select className={CAJA} name="uso_cfdi" required value={rec.uso_cfdi} onChange={ponRec("uso_cfdi")}>
                {USOS.map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
              </select>
            </Campo>
            <div>
              <span className="block text-xs font-medium text-ink-muted mb-1">Correos del cliente</span>
              <div id="correos" className="space-y-2">
                {correos.map((c) => (
                  <div key={c.k} className="flex items-center gap-2" data-correo>
                    <input className={`${CAJA} ${c.valor.trim() && !correoValido(c.valor.trim()) ? "!border-mauve-900" : ""}`} type="email" name="correo" placeholder="contabilidad@cliente.com" autoComplete="off"
                      value={c.valor} onChange={(e) => setCorreos((l) => l.map((x) => (x.k === c.k ? { ...x, valor: e.target.value } : x)))} />
                    <label className="flex items-center gap-1 text-[11px] text-ink-muted whitespace-nowrap" title="Mandarle la factura al timbrar">
                      <input type="checkbox" name="enviar_a" checked={c.mandar} onChange={(e) => setCorreos((l) => l.map((x) => (x.k === c.k ? { ...x, mandar: e.target.checked } : x)))} /> mandar
                    </label>
                    <button type="button" className={`${B} ${CHICO}`} data-quitar-correo aria-label="Quitar correo"
                      onClick={() => setCorreos((l) => { const n = l.filter((x) => x.k !== c.k); return n.length ? n : [correoNuevo()]; })}>×</button>
                  </div>
                ))}
              </div>
              <button type="button" className={`${B} ${CHICO} mt-2`} id="b-correo" onClick={() => setCorreos((l) => [...l, correoNuevo()])}>+ Correo</button>
              <small className="block text-[11px] text-ink-muted mt-1">Uno por campo. Con la casilla marcada, al timbrar le llega la factura (PDF y XML). Se guardan en el cliente.</small>
            </div>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Cómo y cuándo">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Campo e="Método de pago" chico="Todo de contado (PUE) en esta versión.">
              <select className={CAJA} name="metodo_pago" disabled value="PUE" onChange={() => {}}><option value="PUE">PUE · Pago en una sola exhibición</option></select>
            </Campo>
            <Campo e="Forma de pago">
              <select className={CAJA} name="forma_pago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                {FORMAS.map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
              </select>
            </Campo>
            <Campo e="Fecha de expedición" chico="Hora del centro (la del SAT). Por omisión, ahora; se admite hasta 72 horas atrás.">
              <input className={CAJA} type="datetime-local" name="fecha" step={60} value={fecha} onChange={(e) => setFecha(e.target.value)}
                min={localIso(new Date(ahora.getTime() - 72 * 3600_000))} max={localIso(new Date(ahora.getTime() + 5 * 60_000))} />
            </Campo>
            <Campo e="Observaciones (sólo en el PDF)"><input className={CAJA} name="observaciones" maxLength={1000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></Campo>
          </div>
          <Err>{error}</Err>
          {motivos.length > 0 && <Lista id="motivos-pac">{motivos.map((m, i) => <li key={i} className="py-2 text-sm text-ink-dim">{m}</li>)}</Lista>}
          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <button type="button" className={B} id="b-revisar" onClick={() => void revisar(false)}>Revisar</button>
            <button type="button" className={B} id="b-previa" onClick={() => void vistaPrevia()}>Vista previa (PDF)</button>
            {admin && <button type="button" className={B} id="b-prefactura" disabled={ocupado === "prefactura"} onClick={() => void guardarPrefactura()}>{prefacturaId ? "Guardar cambios de la prefactura" : "Guardar como prefactura"}</button>}
            {prefacturaId && <a className={B} id="b-pdf-prefactura" target="_blank" rel="noopener" href={ligaPdfPrefactura(prefacturaId)}>Bajar PDF de la prefactura</a>}
            <button className={B_PRI} id="b-timbrar" disabled={!puede || ocupado === "timbrar"}>{ocupado === "timbrar" ? "Timbrando…" : "Timbrar"}</button>
          </div>
          <Nota>La prefactura es una muestra para que el cliente la revise (sin folio fiscal, sin correo). Al timbrar, Facturama la sella ante el SAT y queda como factura emitida. Después sólo se puede cancelar.</Nota>
        </Tarjeta>
      </form>
    </div>
  );
}

export default function NuevaFacturaPage() {
  const sp = useSearchParams();
  const q = { proyecto: sp.get("proyecto") || "", cliente: sp.get("cliente") || "", prefactura: sp.get("prefactura") || "", de: sp.get("de") || "" };
  const llave = JSON.stringify(q);
  // De dónde arranca: un proyecto, un cliente, una prefactura guardada, o una emitida para «nueva igual».
  const carga = useCarga<Fila>(async () => {
    const vacio = { proyecto: null, cliente: null, receptor: { rfc: "", razon_social: "", regimen_fiscal: "", cp_fiscal: "", uso_cfdi: "G03" } };
    const [pac, pre, prefactura, de] = await Promise.all([
      fis("/pac"),
      fis(`/emitir/prellenar?${q.proyecto ? `proyecto_id=${encodeURIComponent(q.proyecto)}` : ""}${q.cliente ? `&cliente_id=${encodeURIComponent(q.cliente)}` : ""}`).catch(() => vacio),
      q.prefactura ? fis(`/prefacturas/${encodeURIComponent(q.prefactura)}`).catch(() => null) : null,
      q.de ? fis(`/emisiones/${encodeURIComponent(q.de)}`).catch(() => null) : null,
    ]);
    const base = prefactura?.borrador || de?.borrador || null;
    const clienteId = prefactura?.cliente_id || de?.cliente_id || pre.cliente?.id || null;
    // Con cliente de arranque, se conoce su nombre y sus correos.
    let clienteDeArranque = pre.cliente;
    if (clienteId && (!clienteDeArranque || clienteDeArranque.id !== clienteId)) {
      const rfc = (base ? base.receptor : pre.receptor)?.rfc || "";
      clienteDeArranque = ((await fis(`/clientes?q=${encodeURIComponent(rfc)}`).catch(() => ({ filas: [] }))).filas || []).find((c: Fila) => c.id === clienteId) || null;
    }
    return { pac, pre, prefactura, de, clienteDeArranque, q };
  }, llave);
  return <Vista carga={carga}>{carga.d && <Forma key={llave} ini={carga.d} />}</Vista>;
}
