"use client";

/* Fiscal · Ajustes: con qué datos factura la empresa y lo que da el contador
 * para cada año.
 *
 * Lo de aquí mueve la cuenta de los impuestos, así que sólo lo cambia quien
 * dirige la empresa o quien lleva la contabilidad; los demás lo ven. El RFC
 * es el de la empresa, el mismo que ven las demás apps de la suite. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { aCentavos, aCoeficiente, emp, enCoeficiente, enPesos, enPorciento, fis, mensajeDe, type Fila } from "@/lib/bill";
import { useFiscal } from "@/components/fiscal/contexto";
import { Aviso, B, B_MAL, B_PRI, CAJA, Cab, Campo, ConSigno, Dato, Datos, Err, Et, Mesero, Nota, Tarjeta, Vista, useAvisa, useCarga } from "@/components/fiscal/ui";

const REGIMENES: [string, string][] = [["601", "General de Ley Personas Morales"], ["626", "Régimen Simplificado de Confianza (RESICO)"], ["603", "Personas Morales con Fines no Lucrativos"], ["612", "Persona Física con Actividad Empresarial"], ["621", "Incorporación Fiscal"]];

/** Los valores de un formulario, que arrancan de lo que llegó de la API y se
 *  vuelven a poner cuando llega otra cosa (otro año, después de guardar). */
function useForma<T extends Record<string, string>>(inicial: T, llave: string) {
  const [v, setV] = useState<T>(inicial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setV(inicial); }, [llave]);
  const pon = (k: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return { v, pon, setV };
}

function Guardar({ ocupado, texto = "Guardar", id }: { ocupado: boolean; texto?: string; id?: string }) {
  return <button className={B_PRI} id={id} disabled={ocupado}>{ocupado ? "Guardando…" : texto}</button>;
}

function Empresa({ cfg, admin, dirige, despues }: { cfg: Fila; admin: boolean; dirige: boolean; despues: () => void }) {
  const avisa = useAvisa();
  const f = useForma({ rfc: cfg.rfc || "", cp: cfg.cp || "", razon_social: cfg.razon_social || "", regimen: cfg.regimen || "" }, JSON.stringify(cfg));
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <Tarjeta titulo="La empresa">
      <form id="f-empresa" className="space-y-3" onSubmit={async (ev) => {
        ev.preventDefault();
        const rfc = f.v.rfc.toUpperCase().replace(/[\s.-]/g, "");
        if (dirige && rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) { setError("Ese RFC no tiene forma de RFC. Son 12 caracteres para una empresa, 13 para una persona."); return; }
        setOcupado(true); setError("");
        try {
          if (dirige && rfc !== (cfg.rfc || "")) await emp("/empresa", { method: "PATCH", body: { rfc: rfc || null } });
          await fis("/config", { method: "PUT", body: { regimen: f.v.regimen, cp: f.v.cp.trim(), razon_social: f.v.razon_social } });
          avisa("Guardado."); despues();
        } catch (e) { setError(mensajeDe(e)); } finally { setOcupado(false); }
      }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo e="RFC" chico={<>Con él se sabe si una factura la emitiste o la recibiste. {dirige ? "" : "Lo cambia quien dirige la empresa."}</>}>
            <input className={CAJA} name="rfc" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} value={f.v.rfc} onChange={f.pon("rfc")} disabled={!dirige} placeholder="ABC010101AB1" />
          </Campo>
          <Campo e="Código postal fiscal"><input className={CAJA} name="cp" inputMode="numeric" maxLength={5} value={f.v.cp} onChange={f.pon("cp")} disabled={!admin} /></Campo>
        </div>
        <Campo e="Razón social" chico="Sin «S.A. de C.V.»: desde la versión 4.0 la factura lleva el nombre sin el régimen de capital.">
          <input className={CAJA} name="razon_social" value={f.v.razon_social} onChange={f.pon("razon_social")} disabled={!admin} placeholder="Como viene en la constancia de situación fiscal" />
        </Campo>
        <Campo e="Régimen fiscal" chico="Los impuestos de aquí están hechos para el 601 (persona moral, régimen general). Con otro régimen las cuentas no aplican.">
          <select className={CAJA} name="regimen" value={f.v.regimen} onChange={f.pon("regimen")} disabled={!admin}>
            <option value="">Sin escoger</option>
            {REGIMENES.map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
          </select>
        </Campo>
        <Err>{error}</Err>
        {admin && <div className="flex justify-end"><Guardar ocupado={ocupado} id="b-empresa" /></div>}
      </form>
    </Tarjeta>
  );
}

function Ejercicio({ ej, anio, admin, despues }: { ej: Fila; anio: number; admin: boolean; despues: () => void }) {
  const avisa = useAvisa();
  const f = useForma({
    coeficiente: enCoeficiente(ej.coeficiente), perdidas: enPesos(ej.perdidas || ""), iva_a_favor_inicial: enPesos(ej.iva_a_favor_inicial || ""),
    ajuste_deducciones: enPesos(ej.ajuste_deducciones || ""), ajuste_ingresos: enPesos(ej.ajuste_ingresos || ""), nota: ej.nota || "",
  }, `${anio}:${JSON.stringify(ej)}`);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const dinero = (k: "perdidas" | "iva_a_favor_inicial" | "ajuste_deducciones" | "ajuste_ingresos") =>
    <ConSigno><input className={CAJA} name={k} inputMode="decimal" autoComplete="off" value={f.v[k]} onChange={f.pon(k)} disabled={!admin} placeholder="0.00" /></ConSigno>;
  return (
    <Tarjeta titulo="Lo que da el contador" id="t-ejercicio">
      <Mesero antes={`/fiscal/ajustes?anio=${anio - 1}`} despues={`/fiscal/ajustes?anio=${anio + 1}`}>{anio}</Mesero>
      <form id="f-ejercicio" className="space-y-3" onSubmit={async (ev) => {
        ev.preventDefault();
        const coeficiente = aCoeficiente(f.v.coeficiente);
        if (coeficiente === undefined) { setError("El coeficiente va como 0.0523: hasta cuatro decimales y menor que 1."); return; }
        const cuerpo: Fila = { coeficiente, nota: f.v.nota };
        for (const k of ["perdidas", "iva_a_favor_inicial", "ajuste_deducciones", "ajuste_ingresos"] as const) {
          const c = aCentavos(f.v[k], true);
          if (c === null) { setError("Revisa los montos: sólo números, con punto para los centavos."); return; }
          cuerpo[k] = c;
        }
        setOcupado(true); setError("");
        try { await fis(`/ejercicios/${anio}`, { method: "PUT", body: cuerpo }); avisa(`Guardado para ${anio}.`); despues(); }
        catch (e) { setError(mensajeDe(e)); } finally { setOcupado(false); }
      }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo e="Coeficiente de utilidad" chico="Sale de la última declaración anual. Con él se calcula el ISR provisional de cada mes; sin él, no se calcula.">
            <input className={CAJA} name="coeficiente" inputMode="decimal" autoComplete="off" value={f.v.coeficiente} onChange={f.pon("coeficiente")} disabled={!admin} placeholder="0.0523" />
          </Campo>
          <Campo e="Pérdidas de años anteriores" chico="Lo que todavía se puede restar.">{dinero("perdidas")}</Campo>
          <Campo e="IVA a favor al empezar el año" chico="El saldo a favor que venía de diciembre.">{dinero("iva_a_favor_inicial")}</Campo>
          <Campo e="Deducciones sin factura" chico="Depreciación, nómina sin timbrar, PTU: lo del año que no está en ninguna factura.">{dinero("ajuste_deducciones")}</Campo>
          <Campo e="Ingresos sin factura" chico="Ingresos acumulables que no se facturaron.">{dinero("ajuste_ingresos")}</Campo>
          <Campo e="Nota"><input className={CAJA} name="nota" value={f.v.nota} onChange={f.pon("nota")} disabled={!admin} placeholder="De dónde salieron estos números" /></Campo>
        </div>
        <Nota>Tasa de ISR: {enPorciento(ej.tasa_isr)}.</Nota>
        <Err>{error}</Err>
        {admin && <div className="flex justify-end"><Guardar ocupado={ocupado} id="b-ejercicio" /></div>}
      </form>
    </Tarjeta>
  );
}

function Facturama({ pac, rfcEmpresa, dirige, despues }: { pac: Fila; rfcEmpresa: string | null; dirige: boolean; despues: () => void }) {
  const avisa = useAvisa();
  const c = pac.cuenta;
  const [cambiando, setCambiando] = useState(false);
  const cuenta = useForma({ usuario: "", clave: "", sandbox: "true", serie: c?.serie || "A" }, String(c?.usuario));
  const serie = useForma({ serie: c?.serie || "", folio_siguiente: String(c?.folio_siguiente ?? "") }, `${c?.serie}:${c?.folio_siguiente}`);
  const [error, setError] = useState("");
  const [errorSerie, setErrorSerie] = useState("");
  const [ocupado, setOcupado] = useState("");
  const corre = async (cual: string, fn: () => Promise<void>, alError: (m: string) => void = (m) => avisa(m, true)) => {
    setOcupado(cual); alError("");
    try { await fn(); } catch (e) { alError(mensajeDe(e)); } finally { setOcupado(""); }
  };
  return (
    <Tarjeta titulo="Facturama (para timbrar)" der={c ? (c.sandbox ? "cuenta de pruebas" : "cuenta de verdad") : undefined} id="t-pac">
      {c ? (
        <>
          <Datos>
            <Dato e="Usuario">{c.usuario}</Dato>
            <Dato e="Ambiente">{c.sandbox ? "Pruebas (sandbox): los timbres no valen" : "Producción"}</Dato>
            <Dato e="Serie y folio que sigue">{c.serie}-{c.folio_siguiente}</Dato>
            <Dato e="Perfil en Facturama">{c.perfil ? (c.perfil.error ? <Et tono="mal">No se pudo leer</Et> : <>{c.perfil.rfc || ""} · {c.perfil.csd ? <Et tono="bien">Con sello (CSD)</Et> : <Et tono="mal">Sin sello (CSD)</Et>}</>) : "—"}</Dato>
          </Datos>
          {c.perfil && c.perfil.csd === false && <Aviso tono="ojo" className="mt-3">Facturama no tiene el sello (CSD) de la empresa: sin él no timbra. Se carga en el portal de Facturama (Perfil fiscal → Certificados).</Aviso>}
          {c.perfil && c.perfil.rfc && rfcEmpresa && c.perfil.rfc !== rfcEmpresa && !c.sandbox && <Aviso tono="mal" className="mt-3">Esa cuenta factura con otro RFC.</Aviso>}
          <Nota>{pac.emitidas} factura{pac.emitidas === 1 ? "" : "s"} timbrada{pac.emitidas === 1 ? "" : "s"} desde aquí. La contraseña está guardada cifrada; no se puede ver.</Nota>
          {dirige && (
            <form id="f-serie" className="mt-3 space-y-3" onSubmit={(ev) => {
              ev.preventDefault();
              void corre("serie", async () => { await fis("/pac", { method: "PATCH", body: { serie: serie.v.serie, folio_siguiente: Number(serie.v.folio_siguiente) } }); avisa("Guardado."); despues(); }, setErrorSerie);
            }}>
              <div className="grid grid-cols-2 gap-3">
                <Campo e="Serie"><input className={CAJA} name="serie" maxLength={10} autoCapitalize="characters" value={serie.v.serie} onChange={serie.pon("serie")} /></Campo>
                <Campo e="Folio que sigue"><input className={CAJA} name="folio_siguiente" inputMode="numeric" value={serie.v.folio_siguiente} onChange={serie.pon("folio_siguiente")} /></Campo>
              </div>
              <Err>{errorSerie}</Err>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={B} id="b-perfil-pac" disabled={ocupado === "perfil"} onClick={() => void corre("perfil", async () => { await fis("/pac/perfil", { method: "POST" }); avisa("Perfil leído."); despues(); })}>Volver a leer el perfil</button>
                <button type="button" className={B} id="b-otra-pac" onClick={() => setCambiando(true)}>Cambiar la cuenta</button>
                <button type="button" className={B_MAL} id="b-quitar-pac" disabled={ocupado === "quitar"} onClick={() => {
                  if (!confirm("¿Quitar la cuenta de Facturama? Ya no se podrá timbrar ni cancelar desde aquí hasta poner otra. Las facturas timbradas se quedan.")) return;
                  void corre("quitar", async () => { await fis("/pac", { method: "DELETE" }); avisa("Cuenta quitada."); despues(); });
                }}>Quitar</button>
                <Guardar ocupado={ocupado === "serie"} texto="Guardar serie y folio" id="b-serie" />
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-ink-dim mb-2">Con la cuenta de Facturama de la empresa se timbran las facturas desde aquí. Primero una cuenta de pruebas (sandbox, gratis, timbres sin valor); cuando se contrate la de verdad, se cambia aquí.</p>
          {!dirige && <Aviso>La cuenta la pone quien dirige la empresa.</Aviso>}
        </>
      )}
      {dirige && (!c || cambiando) && (
        <form id="f-pac" className="mt-3 space-y-3" onSubmit={(ev) => {
          ev.preventDefault();
          void corre("pac", async () => {
            try {
              const r = await fis("/pac", { method: "PUT", body: { usuario: cuenta.v.usuario.trim(), clave: cuenta.v.clave, sandbox: cuenta.v.sandbox === "true", serie: cuenta.v.serie } });
              avisa(`Cuenta de Facturama guardada (${r.cuenta.perfil?.rfc || r.cuenta.usuario}).`); setCambiando(false); despues();
            } finally { cuenta.setV((x) => ({ ...x, clave: "" })); }
          }, setError);
        }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo e="Usuario de Facturama"><input className={CAJA} name="usuario" autoComplete="off" required value={cuenta.v.usuario} onChange={cuenta.pon("usuario")} /></Campo>
            <Campo e="Contraseña" chico="Se usa para entrar a Facturama y se guarda cifrada."><input className={CAJA} name="clave" type="password" autoComplete="off" required value={cuenta.v.clave} onChange={cuenta.pon("clave")} /></Campo>
            <Campo e="Ambiente">
              <select className={CAJA} name="sandbox" value={cuenta.v.sandbox} onChange={cuenta.pon("sandbox")}>
                <option value="true">Pruebas (apisandbox.facturama.mx)</option>
                <option value="false">Producción (api.facturama.mx)</option>
              </select>
            </Campo>
            <Campo e="Serie"><input className={CAJA} name="serie" maxLength={10} autoCapitalize="characters" value={cuenta.v.serie} onChange={cuenta.pon("serie")} /></Campo>
          </div>
          <Err>{error}</Err>
          <div className="flex justify-end gap-2">
            {c && <button type="button" className={B} id="b-cancelar-pac" onClick={() => setCambiando(false)}>Cancelar</button>}
            <Guardar ocupado={ocupado === "pac"} texto="Probar y guardar" id="b-pac" />
          </div>
        </form>
      )}
    </Tarjeta>
  );
}

function Pdf({ pdf, dirige }: { pdf: Fila; dirige: boolean }) {
  const avisa = useAvisa();
  const f = useForma({ beneficiario: pdf.beneficiario || "", banco: pdf.banco || "", clabe: pdf.clabe || "", cuenta: pdf.cuenta || "", leyenda: pdf.leyenda || "" }, JSON.stringify(pdf));
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const caja = (k: "beneficiario" | "banco" | "clabe" | "cuenta" | "leyenda", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <input className={CAJA} name={k} value={f.v[k]} onChange={f.pon(k)} disabled={!dirige} {...extra} />;
  return (
    <Tarjeta titulo="El PDF de la factura" id="t-pdf">
      <p className="text-[11px] text-ink-muted mb-3">El PDF se arma con el logotipo y los datos de contacto de la empresa. Aquí va lo demás: a dónde te pagan y una leyenda al pie.</p>
      <form id="f-pdf" className="space-y-3" onSubmit={async (ev) => {
        ev.preventDefault();
        setOcupado(true); setError("");
        try {
          await fis("/pdf-config", { method: "PUT", body: { beneficiario: f.v.beneficiario, banco: f.v.banco, clabe: f.v.clabe.replace(/\s/g, ""), cuenta: f.v.cuenta, leyenda: f.v.leyenda } });
          avisa("Guardado: sale en el PDF de cada factura.");
        } catch (e) { setError(mensajeDe(e)); } finally { setOcupado(false); }
      }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo e="Beneficiario">{caja("beneficiario", { maxLength: 200, placeholder: "Como está la cuenta en el banco" })}</Campo>
          <Campo e="Banco">{caja("banco", { maxLength: 60, placeholder: "BBVA" })}</Campo>
          <Campo e="CLABE">{caja("clabe", { inputMode: "numeric", maxLength: 18, placeholder: "18 dígitos" })}</Campo>
          <Campo e="Número de cuenta (opcional)">{caja("cuenta", { maxLength: 30 })}</Campo>
        </div>
        <Campo e="Leyenda al pie (opcional)">{caja("leyenda", { maxLength: 500, placeholder: "Gracias por su preferencia. Mande su comprobante de pago a…" })}</Campo>
        <Err>{error}</Err>
        {dirige ? <div className="flex justify-end"><Guardar ocupado={ocupado} id="b-pdf" /></div> : <Nota>Lo cambia quien dirige la empresa.</Nota>}
      </form>
    </Tarjeta>
  );
}

export default function AjustesFiscalesPage() {
  const q = useSearchParams();
  const { hoy, administra: admin, dirige } = useFiscal();
  const anio = /^\d{4}$/.test(q.get("anio") || "") ? Number(q.get("anio")) : Number(hoy.slice(0, 4));
  const carga = useCarga(async () => {
    const [cfg, ej, pac, pdf] = await Promise.all([fis("/config"), fis(`/ejercicios/${anio}`), fis("/pac"), fis("/pdf-config").catch(() => ({}))]);
    return { cfg, ej, pac, pdf } as Record<"cfg" | "ej" | "pac" | "pdf", Fila>;
  }, String(anio));
  const otra = () => void carga.otra();
  const x = carga.d;
  return (
    <div>
      <Cab titulo="Ajustes fiscales" sub="Los datos fiscales de la empresa y lo que da el contador." />
      <Vista carga={carga}>
        {x && (
          <>
            {!admin && <Aviso>Puedes verlos. Los cambia quien dirige la empresa o quien lleva la contabilidad.</Aviso>}
            <Empresa cfg={x.cfg} admin={admin} dirige={dirige} despues={otra} />
            <Ejercicio ej={x.ej} anio={anio} admin={admin} despues={otra} />
            <Facturama pac={x.pac} rfcEmpresa={x.cfg.rfc} dirige={dirige} despues={otra} />
            <Pdf pdf={x.pdf} dirige={dirige} />
            <Tarjeta titulo="El SAT">
              <p className="text-[11px] text-ink-muted mb-3">Con la FIEL de la empresa, las facturas emitidas y recibidas se bajan solas del SAT cada noche. Se sube en su propia sección.</p>
              <Link className={B} href="/fiscal/sat">Ir al SAT</Link>
            </Tarjeta>
          </>
        )}
      </Vista>
    </div>
  );
}
