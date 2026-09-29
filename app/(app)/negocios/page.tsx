"use client";

/* El negocio de la empresa: UNO.
 *
 * Mike, 29-sep-2026: «borres de dash (y de todas las plataformas) la opción
 * de agregar diferentes negocios. Ya no vamos a tener esa funcionalidad (los
 * otros negocios son como TUYS y vibehome). Todo es para un negocio nada
 * más.» Y escogió, con botones, FUSIONAR lo que ya existe en uno.
 *
 * Tres estados, y sólo el tercero es trabajo:
 *   · sin negocio → se crea el primero (la única alta que sigue existiendo);
 *   · uno → se enseña y se edita;
 *   · varios → esta pantalla los junta. Quien dirige escoge cuál se queda,
 *     ve qué se movería (en seco, sin escribir), escribe el nombre del que
 *     se queda para confirmar, y entonces sí. No se deshace, y se dice.
 */

import { useState } from "react";
import Link from "next/link";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { fusionarNegocios, type FusionDeNegocios } from "@/lib/negocios";
import { IconBuildingStore, IconPlus, IconArrowsJoin, IconAlertTriangle } from "@tabler/icons-react";

const NOMBRES: Record<string, string> = {
  clientes: "clientes", proyectos: "proyectos", items: "ítems", cuentas: "cuentas", movimientos: "movimientos",
  cotizaciones: "cotizaciones", productos: "productos del catálogo", ordenes: "órdenes", cfdi: "facturas",
  rayas: "cortes de raya", conciliaciones: "conciliaciones", opex: "gastos fijos",
};

export default function NegociosPage() {
  const { negocios, activo, loading, refresh, setActivo } = useNegocioActivo();
  const [queda, setQueda] = useState<string>("");
  const [ensayo, setEnsayo] = useState<FusionDeNegocios | null>(null);
  const [confirma, setConfirma] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [hecho, setHecho] = useState<FusionDeNegocios | null>(null);
  const [error, setError] = useState("");

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (negocios.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-medium text-ink-dim mb-5">Negocio</h2>
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconBuildingStore size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">El negocio de la empresa</p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Todo lo que captures —clientes, proyectos, cuentas, movimientos— va en él.
          </p>
          <Link
            href="/negocios/nuevo"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Dar de alta el negocio
          </Link>
        </div>
      </div>
    );
  }

  if (negocios.length === 1 || hecho) {
    const n = hecho ? negocios.find((x) => x.id === hecho.queda.id) ?? negocios[0] : negocios[0];
    return (
      <div>
        <h2 className="text-lg font-medium text-ink-dim mb-5">Negocio</h2>
        {hecho && (
          <div className="mb-4 text-xs text-mint-900 bg-mint-50 rounded-xl px-3 py-2" data-fusion-hecha>
            Listo: {hecho.se_fueron.map((s) => `«${s.nombre}»`).join(", ")} {hecho.se_fueron.length === 1 ? "pasó" : "pasaron"} a
            «{hecho.queda.nombre}» y ya no {hecho.se_fueron.length === 1 ? "existe" : "existen"}.{" "}
            {resumen(hecho.movidos)}
          </div>
        )}
        <Link
          href={`/negocios/${n.id}`}
          className="block max-w-lg bg-white border border-black/5 rounded-2xl p-4 hover:border-black/20 transition"
          data-negocio-unico={n.id}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-mint-50 text-mint-900 flex items-center justify-center flex-shrink-0">
              <IconBuildingStore size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-dim truncate">{n.nombre}</p>
              <p className="text-[11px] text-ink-muted">
                {n.moneda}
                {n.rfc ? ` · ${n.rfc}` : ""}
                {" · "}toca para editar
              </p>
            </div>
          </div>
        </Link>
        <p className="text-[11px] text-ink-muted mt-3 max-w-lg">
          La suite trabaja con un solo negocio por empresa. No hay nada más que dar de alta aquí.
        </p>
      </div>
    );
  }

  /* Varios: hay que juntarlos. */
  const elegido = negocios.find((n) => n.id === queda) ?? null;
  const ensayar = async () => {
    if (!elegido) return;
    setError(""); setTrabajando(true);
    try { setEnsayo(await fusionarNegocios(elegido.id!, true)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo revisar."); }
    finally { setTrabajando(false); }
  };
  const fusionar = async () => {
    if (!elegido || confirma.trim() !== elegido.nombre) return;
    setError(""); setTrabajando(true);
    try {
      const r = await fusionarNegocios(elegido.id!, false);
      setHecho(r);
      setActivo(elegido);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo fusionar."); }
    finally { setTrabajando(false); }
  };

  return (
    <div className="max-w-2xl" data-fusion-de-negocios>
      <h2 className="text-lg font-medium text-ink-dim">Negocio</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-5">
        Esta empresa tiene {negocios.length} negocios y la suite trabaja con uno solo.
      </p>

      <div className="bg-white border border-black/5 rounded-2xl p-4 space-y-4">
        <div className="flex gap-2 items-start text-xs text-ink-dim">
          <IconAlertTriangle size={16} className="text-mauve-900 shrink-0 mt-0.5" />
          <p>
            Escoge cuál se queda. Todo lo de los demás (clientes, proyectos, ítems, cuentas, movimientos,
            cotizaciones, catálogo, órdenes, facturas, raya) pasa a él y los demás se borran.{" "}
            <b>No se deshace.</b> Un producto del catálogo con el mismo código en dos negocios queda en uno.
          </p>
        </div>

        <fieldset>
          <legend className="text-xs font-medium text-ink-dim mb-2">El que se queda</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {negocios.map((n) => (
              <label
                key={n.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                  queda === n.id ? "border-ink bg-cream/60" : "border-black/10 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="queda"
                  value={n.id}
                  checked={queda === n.id}
                  onChange={() => { setQueda(n.id!); setEnsayo(null); setConfirma(""); }}
                />
                <span className="min-w-0">
                  <span className="block text-ink-dim truncate">{n.nombre}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {n.moneda}{activo?.id === n.id ? " · el que estás viendo" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-2 flex-wrap items-center">
          <button
            type="button"
            data-ensayar-fusion
            disabled={!elegido || trabajando}
            onClick={() => void ensayar()}
            className="text-xs px-3 py-1.5 rounded-xl border border-black/10 bg-white text-ink-dim disabled:opacity-40"
          >
            {trabajando && !ensayo ? "Revisando…" : "Ver qué se movería"}
          </button>
        </div>

        {ensayo && elegido && (
          <div className="rounded-xl bg-cream/60 p-3 text-xs text-ink-dim space-y-2" data-ensayo-fusion>
            <p>
              Se {ensayo.se_fueron.length === 1 ? "va" : "van"}{" "}
              {ensayo.se_fueron.map((s) => `«${s.nombre}»`).join(", ")}. {resumen(ensayo.movidos)}
              {ensayo.productos_fusionados
                ? ` ${ensayo.productos_fusionados} ${ensayo.productos_fusionados === 1 ? "producto repetido queda" : "productos repetidos quedan"} en el catálogo de «${elegido.nombre}».`
                : ""}
              {" "}Todavía no se movió nada.
            </p>
            <label className="block">
              <span className="block mb-1">Para confirmar, escribe el nombre del que se queda: <b>{elegido.nombre}</b></span>
              <input
                type="text"
                aria-label="Nombre del negocio que se queda"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                className="w-full max-w-xs bg-white border border-black/10 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-ink/40"
              />
            </label>
            <button
              type="button"
              data-fusionar
              disabled={confirma.trim() !== elegido.nombre || trabajando}
              onClick={() => void fusionar()}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-ink text-cream disabled:opacity-40"
            >
              <IconArrowsJoin size={13} />
              {trabajando ? "Fusionando…" : `Fusionar en «${elegido.nombre}»`}
            </button>
          </div>
        )}

        {error && <p className="text-xs text-mauve-900">{error}</p>}
      </div>
    </div>
  );
}

function resumen(movidos: Record<string, number>): string {
  const partes = Object.entries(movidos)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${NOMBRES[t] ?? t}`);
  return partes.length ? `Se mueven ${partes.join(", ")}.` : "No hay nada que mover.";
}
