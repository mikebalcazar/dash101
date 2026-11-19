/* El estado de cuenta para mandar, con la imagen de taller101.
 *
 * Mike, 19-nov-2026: «necesito poder imprimir en PDF el estado de cuenta del
 * cliente, necesito que en la portada traiga el saldo de cada proyecto y el
 * total y después el desglose de cada proyecto y sus pagos. Cada proyecto
 * empieza en hoja nueva. Importantísimo, que sea un documento formal con un
 * excelente diseño como si fuera casi de editorial de revista con la imagen
 * de taller101. También poder imprimir el estado de cuenta de proyecto por
 * proyecto.»
 *
 * Dos piezas: la PORTADA (a sangre, con el saldo de cada proyecto y el total)
 * y la HOJA DE UN PROYECTO (sus conceptos, sus pagos con su factura y su
 * saldo). El del cliente es una portada y una hoja por proyecto; el de un
 * proyecto, su portada y su hoja. Todo SIN IVA, como el estado de cuenta de
 * siempre (Mike, 18-nov-2026), con el IVA cobrado aparte.
 */

import { Fragment } from "react";
import {
  nombreDeFactura, tituloDelGrupo,
  type EstadoDelProyecto, type GrupoDelEstado,
} from "@/lib/estado-proyecto";

const MXN = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «$1,254,300.60», con los centavos chicos si se pide. */
export function Cifra({ n, chica }: { n: number; chica?: boolean }) {
  const negativo = n < 0;
  const [enteros, centavos] = MXN.format(Math.abs(n)).split(".");
  return (
    <span className="doc-cifra">
      {negativo ? "−" : ""}${enteros}
      {chica ? <small>.{centavos}</small> : `.${centavos}`}
    </span>
  );
}
const pesos = (n: number) => `${n < 0 ? "−" : ""}$${MXN.format(Math.abs(n))}`;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** El día que dice una fecha ISO, sin que la zona horaria lo mueva. */
const partes = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { a, m: (m || 1) - 1, d: d || 1 };
};
export const enLetras = (iso: string) => { const { a, m, d } = partes(iso); return `${d} de ${MESES[m]} de ${a}`; };
const corta = (iso: string) => { const { a, m, d } = partes(iso); return `${String(d).padStart(2, "0")} ${MES3[m]} ${a}`; };
const dosDigitos = (i: number) => String(i + 1).padStart(2, "0");

/** Un proyecto en la portada: lo contratado, lo pagado y el saldo, SIN IVA. */
export interface RenglonDePortada { id: string; nombre: string; precio: number; pagado: number; saldo: number; estado?: string }

export interface DatosDePortada {
  /** «Preparado para»: el cliente, o el proyecto en el de un proyecto. */
  titulo: string;
  subtitulo: string;
  generado_at: string;
  empresa: { nombre: string; rfc: string | null } | null;
  renglones: RenglonDePortada[];
  /** Pagos del cliente que no cuelgan de ningún proyecto. SIN IVA. */
  por_aplicar?: number;
  iva_cobrado: number;
}

/** Los renglones que caben en la portada; los demás siguen en la hoja de
 *  resumen. Con un cliente de cuatro o cinco obras todo cabe en la portada. */
const enPortada = (d: DatosDePortada) => (d.por_aplicar ? 4 : 5);

function TablaDeSaldos({ d, desde, hasta, totales }: { d: DatosDePortada; desde: number; hasta: number; totales: boolean }) {
  const precio = d.renglones.reduce((t, r) => t + r.precio, 0);
  const pagado = d.renglones.reduce((t, r) => t + r.pagado, 0);
  const saldo = d.renglones.reduce((t, r) => t + r.saldo, 0);
  const neto = saldo - (d.por_aplicar ?? 0);
  return (
    <table>
      <thead>
        <tr><th /><th>Proyecto</th><th>Contratado</th><th>Pagado</th><th>Saldo</th></tr>
      </thead>
      <tbody>
        {d.renglones.slice(desde, hasta).map((r, k) => {
          const i = desde + k;
          const pct = r.precio > 0 ? Math.min(100, Math.max(0, (r.pagado / r.precio) * 100)) : 0;
          return (
            <tr key={r.id} data-doc-renglon={r.nombre}>
              <td className="doc-num">{dosDigitos(i)}</td>
              <td className="doc-nombre">
                <strong>{r.nombre}</strong>
                <div className="doc-avance"><i style={{ width: `${pct}%` }} /></div>
                <div className="doc-avance-txt">{pct.toFixed(0)} % pagado</div>
              </td>
              <td><Cifra n={r.precio} /></td>
              <td><Cifra n={r.pagado} /></td>
              <td><strong><Cifra n={r.saldo} /></strong></td>
            </tr>
          );
        })}
        {totales && (
          <>
            <tr className="doc-total" data-doc-total>
              <td /><td>Total</td>
              <td><Cifra n={precio} /></td><td><Cifra n={pagado} /></td><td><Cifra n={saldo} /></td>
            </tr>
            {d.por_aplicar ? (
              <>
                <tr className="doc-resta">
                  <td /><td colSpan={3}>Menos pagos recibidos que aún no se aplican a un proyecto</td>
                  <td>−{pesos(d.por_aplicar).replace("−", "")}</td>
                </tr>
                <tr className="doc-neto">
                  <td /><td colSpan={3}>Saldo por cobrar</td><td><Cifra n={neto} /></td>
                </tr>
              </>
            ) : null}
          </>
        )}
      </tbody>
    </table>
  );
}

/** Si los proyectos no caben en la portada, la tabla sigue aquí. */
export function ResumenContinuacion({ d }: { d: DatosDePortada }) {
  if (d.renglones.length <= enPortada(d)) return null;
  return (
    <section className="doc-hoja doc-cuerpo" data-doc-resumen>
      <div className="doc-resumen" style={{ marginTop: 0 }}>
        <h2>Saldo por proyecto · continuación</h2>
        <TablaDeSaldos d={d} desde={enPortada(d)} hasta={d.renglones.length} totales />
      </div>
    </section>
  );
}

export function Portada({ d }: { d: DatosDePortada }) {
  const caben = d.renglones.length <= enPortada(d);
  const precio = d.renglones.reduce((t, r) => t + r.precio, 0);
  const pagado = d.renglones.reduce((t, r) => t + r.pagado, 0);
  const saldo = d.renglones.reduce((t, r) => t + r.saldo, 0);
  const neto = saldo - (d.por_aplicar ?? 0);
  return (
    <section className="doc-hoja doc-portada" data-doc-portada>
      <div className="doc-banda">
        <div className="doc-aro" aria-hidden />
        <div className="doc-banda-arriba">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/taller101-blanco.svg" alt="taller101" />
          <div className="doc-fecha">
            <div className="doc-ceja">Estado de cuenta</div>
            <div>{enLetras(d.generado_at)}</div>
          </div>
        </div>
        <div className="doc-para">
          <div className="doc-ceja">Preparado para</div>
          <h1 className="doc-titulo">{d.titulo}</h1>
          <p>{d.subtitulo}</p>
        </div>
        <div className="doc-banda-pie">
          <span>{d.renglones.length} {d.renglones.length === 1 ? "proyecto" : "proyectos"}</span>
          <span>Cifras en pesos · sin IVA</span>
        </div>
      </div>

      <div className="doc-portada-cuerpo">
        <div className="doc-gran-saldo">
          <div>
            <div className="doc-ceja">Saldo por cobrar</div>
            <Cifra n={d.por_aplicar ? neto : saldo} chica />
            <p>Al {enLetras(d.generado_at)}, sin IVA.</p>
          </div>
          <div className="doc-tres">
            <div><div className="doc-ceja">Contratado</div><Cifra n={precio} /></div>
            <div><div className="doc-ceja">Pagado</div><Cifra n={pagado} /></div>
            <div><div className="doc-ceja">IVA cobrado</div><Cifra n={d.iva_cobrado} /></div>
          </div>
        </div>

        <div className="doc-resumen">
          <h2>Saldo por proyecto</h2>
          <TablaDeSaldos d={d} desde={0} hasta={enPortada(d)} totales={caben} />
          {!caben && <div className="doc-sigue">Siguen {d.renglones.length - enPortada(d)} proyectos y el total en la hoja siguiente →</div>}
        </div>
      </div>

      <footer className="doc-portada-pie">
        <div>
          {d.empresa ? <><strong>{d.empresa.nombre}</strong>{d.empresa.rfc ? ` · RFC ${d.empresa.rfc}` : ""}<br /></> : null}
          Los conceptos se cotizan antes de IVA y los pagos se cuentan sin IVA; el IVA cobrado va aparte.
          El desglose de cada proyecto empieza en la hoja siguiente.
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/taller101-azul.svg" alt="taller101" />
      </footer>
    </section>
  );
}

/** Los conceptos de un grupo, con un subtítulo cada vez que cambia la sección. */
function Conceptos({ g }: { g: GrupoDelEstado }) {
  return (
    <>
      {g.conceptos.map((c, k) => (
        <Fragment key={c.id}>
          {c.seccion && c.seccion !== g.conceptos[k - 1]?.seccion && (
            <tr className="doc-seccion"><td colSpan={5}>{c.seccion}</td></tr>
          )}
          <tr>
            <td className="doc-producto">{c.nombre || c.descripcion}</td>
            <td className="doc-desc">{c.nombre ? c.descripcion : ""}</td>
            <td className="der">{Number.isInteger(c.cantidad) ? c.cantidad : c.cantidad.toFixed(2)}</td>
            <td className="der">{pesos(c.precio_unitario)}</td>
            <td className="der">{pesos(c.importe)}</td>
          </tr>
        </Fragment>
      ))}
    </>
  );
}

/** La hoja de un proyecto: cabeza, indicadores, conceptos, pagos y cierre. */
export function HojaDeProyecto({ e, numero }: { e: EstadoDelProyecto; numero: number }) {
  const t = e.totales;
  const precio = t.precio_por_cargar ? 0 : t.total;
  const saldo = t.saldo ?? 0;
  const pct = precio > 0 ? Math.min(100, Math.max(0, (t.cobrado / precio) * 100)) : 0;
  const varios = e.grupos.length > 1 || e.grupos.some((g) => g.cotizacion_id);
  const conceptos = e.grupos.reduce((n, g) => n + g.conceptos.length, 0);
  const fechas = [e.proyecto.fecha_inicio && `desde el ${enLetras(e.proyecto.fecha_inicio)}`, e.proyecto.fecha_cierre && `cerrado el ${enLetras(e.proyecto.fecha_cierre)}`].filter(Boolean).join(" · ");
  return (
    <section className="doc-hoja doc-cuerpo doc-proyecto" data-doc-proyecto={e.proyecto.nombre}>
      <header className="doc-cabeza">
        <div className="doc-numero">{dosDigitos(numero)}</div>
        <div>
          <div className="doc-ceja">Proyecto</div>
          <h2 className="doc-titulo">{e.proyecto.nombre}</h2>
          <p>{[e.cliente?.nombre, fechas].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <div className="doc-indicadores">
        <div><div className="doc-ceja">Contratado</div><Cifra n={precio} chica /></div>
        <div><div className="doc-ceja">Pagado</div><Cifra n={t.cobrado} chica /></div>
        <div className="doc-saldo"><div className="doc-ceja">Saldo</div><Cifra n={saldo} chica /></div>
        <div>
          <div className="doc-ceja">Avance de pago</div>
          <span className="doc-cifra">{pct.toFixed(0)} %</span>
          <div className="doc-avance"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {e.facturas_por_completar.map((f) => (
        <div className="doc-aviso" key={f.id} data-doc-aviso={nombreDeFactura(f)}>
          <strong>Factura {nombreDeFactura(f)}: faltan {pesos(f.falta_sin_iva)} de pago</strong> ({pesos(f.falta)} con IVA) para completarla.
          La factura es de {pesos(f.subtotal)} sin IVA y sus pagos cubren {pesos(f.ligado)} con IVA.
        </div>
      ))}

      <section className="doc-apartado">
        <header><h3>Conceptos</h3><span>{conceptos} {conceptos === 1 ? "concepto" : "conceptos"} · sin IVA</span></header>
        {conceptos === 0 ? (
          <p className="doc-gris">Este proyecto todavía no tiene conceptos de cobro.</p>
        ) : (
          <table className="doc-tabla">
            <thead><tr><th>Producto</th><th>Descripción</th><th className="der">Cant.</th><th className="der">P. unitario</th><th className="der">Importe</th></tr></thead>
            <tbody>
              {e.grupos.map((g, i) => (
                <Fragment key={g.cotizacion_id ?? `g${i}`}>
                  {varios && <tr className="doc-grupo"><td colSpan={5}>{tituloDelGrupo(g)}</td></tr>}
                  <Conceptos g={g} />
                  {varios && (
                    <tr className="doc-subtotal"><td colSpan={4} className="der">Suma de {tituloDelGrupo(g).toLowerCase()}</td><td className="der">{pesos(g.importe)}</td></tr>
                  )}
                </Fragment>
              ))}
              <tr className="doc-suma"><td colSpan={4}>Total contratado</td><td className="der">{pesos(precio)}</td></tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="doc-apartado">
        <header><h3>Pagos</h3><span>{e.movimientos.length} {e.movimientos.length === 1 ? "pago" : "pagos"}</span></header>
        {e.movimientos.length === 0 ? (
          <p className="doc-gris">Todavía no hay pagos.</p>
        ) : (
          <table className="doc-tabla">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Factura</th><th className="der">Sin IVA</th><th className="der">IVA</th><th className="der">Depositado</th></tr></thead>
            <tbody>
              {e.movimientos.map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{corta(m.fecha)}</td>
                  <td>{m.descripcion || "Pago"}</td>
                  <td>{m.facturas.length
                    ? <span className="doc-folio">{m.facturas.map(nombreDeFactura).join(", ")}</span>
                    : <span className="doc-sin">Sin factura</span>}</td>
                  <td className="der">{pesos(m.sin_iva)}</td>
                  <td className="der">{pesos(m.iva)}</td>
                  <td className="der">{pesos(m.monto)}</td>
                </tr>
              ))}
              <tr className="doc-suma">
                <td colSpan={3}>Total pagado</td>
                <td className="der">{pesos(t.cobrado)}</td><td className="der">{pesos(t.iva_cobrado)}</td><td className="der">{pesos(t.cobrado_con_iva)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <div className="doc-cierre">
        <div>
          <dl>
            <dt>Contratado</dt><dd>{pesos(precio)}</dd>
            <dt>Pagado</dt><dd>{pesos(t.cobrado)}</dd>
            <div className="doc-final" style={{ display: "contents" }}><dt>Saldo</dt><dd>{pesos(saldo)}</dd></div>
          </dl>
        </div>
      </div>
      <p className="doc-nota">Cifras en pesos mexicanos. Los conceptos y los pagos se cuentan sin IVA; el IVA de cada pago va en su columna y no cambia el saldo.</p>
    </section>
  );
}

/** El renglón de portada que le toca a un proyecto. */
export const renglonDe = (e: EstadoDelProyecto): RenglonDePortada => ({
  id: e.proyecto.id, nombre: e.proyecto.nombre, estado: e.proyecto.estado,
  precio: e.totales.precio_por_cargar ? 0 : e.totales.total,
  pagado: e.totales.cobrado, saldo: e.totales.saldo ?? 0,
});
