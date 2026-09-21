"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getProyecto, updateProyecto, deleteProyecto } from "@/lib/proyectos";
import { listProveedores } from "@/lib/proveedores";
import type {
  Proyecto,
  Proveedor,
  EstadoProyecto,
  PartidaProyecto,
} from "@/types/schema";
import { ESTADO_PROYECTO_LABELS } from "@/types/schema";
import { formatMonto, formatMontoExact } from "@/lib/format";
import { Timestamp } from "firebase/firestore";
import { IconArrowLeft, IconTrash, IconPlus, IconEdit, IconFileText } from "@tabler/icons-react";
import { formatDateShort } from "@/lib/format";
import { ObraDelProyecto } from "@/components/obra-del-proyecto";
import { desglose } from "@/lib/estado-proyecto";
import { ItemsDelProyecto } from "@/components/items-del-proyecto";

const ESTADO_STYLE: Record<string, string> = {
  planeando: "bg-cream text-ink-muted",
  activo: "bg-mint-50 text-mint-900",
  pausado: "bg-sky-50 text-sky-900",
  finiquito: "bg-cream text-ink-muted",
  cerrado: "bg-mauve-50 text-mauve-900",
};

const PARTIDA_ESTADO_STYLE: Record<string, string> = {
  pendiente: "bg-cream text-ink-muted",
  parcial: "bg-sky-50 text-sky-900",
  pagado: "bg-mint-50 text-mint-900",
};

interface PartidaForm {
  proveedor_id: string;
  proveedor_nombre: string;
  concepto: string;
  monto_acordado: string;
}

interface ItemForm {
  id: string;
  nombre: string;
  descripcion: string;
  /** Cuántas piezas iguales. «20 puertas del mismo acabado y precio». */
  cantidad: string;
  /** Lo que cuesta UNA pieza. Es lo que se captura. */
  unitario: string;
  /** cantidad × unitario. No se teclea: se calcula, y es lo que se guarda,
   *  porque `precio_venta` es la suma de los importes de las líneas. */
  monto: string;
  fecha_entrega: string; // yyyy-mm-dd | ""
}

/** El importe de la línea a partir de lo que se capturó. Se redondea al
 *  centavo aquí y no al guardar: lo que se ve en pantalla y lo que se manda
 *  tienen que ser el mismo número. */
function importe(cantidad: string, unitario: string): string {
  const c = Math.trunc(parseFloat(cantidad) || 0);
  const u = parseFloat(unitario) || 0;
  if (c <= 0 || u <= 0) return "0";
  return (Math.round(c * u * 100) / 100).toFixed(2);
}

function tsToInput(t: unknown): string {
  const ts = t as Timestamp | null | undefined;
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString().slice(0, 10) : "";
}

export default function ProyectoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [editMode, setEditMode] = useState<"no" | "proyecto" | "items">("no");

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precioVenta, setPrecioVenta] = useState("0");
  const [estado, setEstado] = useState<EstadoProyecto>("planeando");
  const [fechaInicio, setFechaInicio] = useState("");
  /* Contrato 0.39.0: cómo lleva el IVA esta obra en su estado de cuenta.
   * Mike lo escogió con botones el 21-sep —«que lo diga cada proyecto»— y
   * arranca en «+ IVA», que es como se venían leyendo todas las cifras. */
  const [ivaIncluido, setIvaIncluido] = useState(false);
  const [partidasEdit, setPartidasEdit] = useState<PartidaForm[]>([]);
  const [itemsEdit, setItemsEdit] = useState<ItemForm[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProyecto = () => {
    return getProyecto(id).then((p) => {
      if (!p) {
        setError("Proyecto no encontrado");
        return;
      }
      setProyecto(p);
      setNombre(p.nombre);
      setDescripcion(p.descripcion ?? "");
      setPrecioVenta(String(p.precio_venta));
      setEstado(p.estado);
      setIvaIncluido(Boolean(p.iva_incluido));
      const fi = p.fecha_inicio as Timestamp | undefined;
      if (fi && typeof fi.toDate === "function") {
        setFechaInicio(fi.toDate().toISOString().slice(0, 10));
      }
      setPartidasEdit(
        (p.partidas ?? []).map((pt) => ({
          proveedor_id: pt.proveedor_id,
          proveedor_nombre: pt.proveedor_nombre,
          concepto: pt.concepto ?? "",
          monto_acordado: String(pt.monto_acordado),
        }))
      );
      setItemsEdit(
        (p.items ?? []).map((pr) => {
          // El precio por pieza sale de dividir: lo que se guarda es el
          // importe de la línea. Con cantidad 1 son el mismo número.
          const cant = pr.cantidad && pr.cantidad > 0 ? pr.cantidad : 1;
          return {
            id: pr.id,
            nombre: pr.nombre,
            descripcion: pr.descripcion ?? "",
            cantidad: String(cant),
            unitario: (Math.round((pr.monto / cant) * 100) / 100).toFixed(2),
            monto: String(pr.monto),
            fecha_entrega: tsToInput(pr.fecha_entrega),
          };
        })
      );
    });
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([loadProyecto(), listProveedores().then(setProveedores)])
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Validar partidas
      const partidasValidas = partidasEdit.filter(
        (p) => p.proveedor_id && parseFloat(p.monto_acordado) > 0
      );
      for (const p of partidasEdit) {
        if (p.proveedor_id && !parseFloat(p.monto_acordado)) {
          setError("Todas las partidas necesitan monto");
          setSaving(false);
          return;
        }
      }

      for (const pr of itemsEdit) {
        if (pr.nombre.trim() && !(parseFloat(pr.monto) > 0)) {
          setError(`El ítem «${pr.nombre}» necesita monto`);
          setSaving(false);
          return;
        }
      }

      await updateProyecto(id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || "",
        precio_venta: parseFloat(precioVenta) || 0,
        estado,
        iva_incluido: ivaIncluido,
        fecha_inicio: fechaInicio ? new Date(fechaInicio) : undefined,
        items: itemsEdit
          .filter((pr) => pr.nombre.trim())
          .map((pr) => ({
            id: pr.id || undefined,
            nombre: pr.nombre.trim(),
            descripcion: pr.descripcion.trim() || undefined,
            cantidad: Math.trunc(parseFloat(pr.cantidad) || 1) || 1,
            monto: parseFloat(pr.monto) || 0,
            fecha_entrega: pr.fecha_entrega ? new Date(pr.fecha_entrega + "T12:00:00") : null,
          })),
        partidas: partidasValidas.map((p) => ({
          proveedor_id: p.proveedor_id,
          proveedor_nombre: p.proveedor_nombre,
          concepto: p.concepto.trim() || undefined,
          monto_acordado: parseFloat(p.monto_acordado),
        })),
      });
      await loadProyecto();
      setEditMode("no");
      setNotice("Cambios guardados");
      setTimeout(() => setNotice(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError("");
    setDeleting(true);
    try {
      await deleteProyecto(id);
      router.push("/proyectos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!proyecto)
    return (
      <div>
        <Link href="/proyectos" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">
          {error || "Proyecto no encontrado"}
        </p>
      </div>
    );

  const p = proyecto;
  const pctCobrado = p.precio_venta > 0 ? (p.cobrado / p.precio_venta) * 100 : 0;
  const pctPagado = p.compromiso_total > 0 ? (p.pagado / p.compromiso_total) * 100 : 0;
  const porCobrar = p.precio_venta - p.cobrado;
  const porPagar = p.compromiso_total - p.pagado;

  return (
    <div className="max-w-3xl">
      <Link
        href="/proyectos"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a proyectos
      </Link>

      {/* «Cambios guardados» se pinta AQUÍ, en la vista.
        *
        * Vivía dentro del formulario de edición, y al guardar el orden es
        * `setEditMode("no")` y luego `setNotice(...)`: el formulario ya se
        * había desmontado, así que el aviso no aparecía nunca. Nadie lo
        * reportó porque no molesta —no se ve una confirmación que no
        * existe—, pero quien guarda merece saber que se guardó. Lo cachó la
        * prueba de navegador del 20-sep, que lo esperaba. */}
      {editMode === "no" && notice && (
        <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl mb-4">{notice}</p>
      )}

      {editMode === "no" ? (
        <>
          {/* Header */}
          <div className="flex justify-between items-start gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-medium text-ink-dim">{p.nombre}</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-ink-muted flex-wrap">
                <span>{p.cliente_nombre}</span>
                <span className="opacity-40">·</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${ESTADO_STYLE[p.estado] ?? ""}`}
                >
                  {ESTADO_PROYECTO_LABELS[p.estado]}
                </span>
              </div>
              {p.descripcion && (
                <p className="text-xs text-ink-muted mt-2">{p.descripcion}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* El estado de cuenta es lo que se manda: va junto a editar y
                  no escondido en un menú, porque se pide seguido y es el
                  mismo documento que el cliente ve en su portal. */}
              <Link
                href={`/proyectos/${p.id}/estado-de-cuenta`}
                className="text-xs bg-white border border-black/10 rounded-xl px-3 py-1.5 hover:border-black/20 transition flex items-center gap-1"
              >
                <IconFileText size={13} />
                Estado de cuenta
              </Link>
              <button
                onClick={() => setEditMode("proyecto")}
                className="text-xs bg-white border border-black/10 rounded-xl px-3 py-1.5 hover:border-black/20 transition flex items-center gap-1"
              >
                <IconEdit size={13} />
                Editar el proyecto
              </button>
            </div>
          </div>

          {/* Hero disponible */}
          <div className="bg-cream rounded-3xl p-6 mb-3">
            <p className="text-xs text-ink-muted mb-1 font-medium">Capital disponible</p>
            <p className="text-4xl font-medium tracking-tight text-ink-dim leading-none">
              {formatMonto(p.disponible ?? 0, "MXN")}
            </p>
            <p className="text-xs text-ink-muted mt-2">
              {formatMonto(p.cobrado, "MXN")} cobrado − {formatMonto(p.pagado, "MXN")} pagado
            </p>
          </div>

          {/* Ingreso + Egreso side by side */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-mint-50 rounded-2xl p-4">
              <p className="text-xs text-mint-label font-medium mb-2">Ingreso del cliente</p>
              <div className="flex justify-between text-xs text-mint-label mb-0.5">
                <span>Precio venta</span>
                <span className="font-medium">{formatMonto(p.precio_venta, "MXN")}</span>
              </div>
              <div className="flex justify-between text-sm text-mint-900 mb-1.5">
                <span>Cobrado</span>
                <span className="font-medium">{formatMonto(p.cobrado, "MXN")}</span>
              </div>
              <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-mint-900"
                  style={{ width: `${Math.min(pctCobrado, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-mint-label mt-1">
                <span>{pctCobrado.toFixed(0)}% cobrado</span>
                <span>{formatMonto(porCobrar, "MXN")} pendiente</span>
              </div>
            </div>

            <div className="bg-mauve-50 rounded-2xl p-4">
              <p className="text-xs text-mauve-label font-medium mb-2">Egreso a proveedores</p>
              <div className="flex justify-between text-xs text-mauve-label mb-0.5">
                <span>Compromiso</span>
                <span className="font-medium">{formatMonto(p.compromiso_total, "MXN")}</span>
              </div>
              <div className="flex justify-between text-sm text-mauve-900 mb-1.5">
                <span>Pagado</span>
                <span className="font-medium">{formatMonto(p.pagado, "MXN")}</span>
              </div>
              <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-mauve-900"
                  style={{ width: `${Math.min(pctPagado, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-mauve-label mt-1">
                <span>{pctPagado.toFixed(0)}% pagado</span>
                <span>{formatMonto(porPagar, "MXN")} pendiente</span>
              </div>
            </div>
          </div>

          {/* Margen */}
          <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-ink-muted">Margen proyectado</p>
              <p className="text-lg font-medium text-ink-dim">
                {formatMonto(p.margen_proyectado ?? 0, "MXN")}{" "}
                {p.precio_venta > 0 && (
                  <span className="text-xs text-mint-900 font-medium ml-1">
                    {((p.margen_proyectado / p.precio_venta) * 100).toFixed(0)}%
                  </span>
                )}
              </p>
            </div>
            <p className="text-xs text-ink-muted font-mono">
              {formatMonto(p.precio_venta, "MXN")} − {formatMonto(p.compromiso_total, "MXN")}
            </p>
          </div>

          {/* La obra de quell101, si la hay (contrato 0.22.0). */}
          <ObraDelProyecto proyectoId={p.id!} />

          {/* Los ítems del proyecto: en su orden, por partidas y sin
              repetidos (contrato 0.30.0). */}
          <ItemsDelProyecto
            proyecto={p}
            alCambiar={() => { void loadProyecto(); }}
            alEditarLista={() => setEditMode("items")}
          />

          {/* Lo acordado con cada proveedor. Se llamaba «Partidas de
              proveedores»; desde que los ítems tienen su propia partida —el
              capítulo de la cotización— dos cosas distintas se llamaban
              igual en la misma pantalla. La tabla de la base sigue siendo
              `partidas`; lo que cambia es cómo se lee aquí. */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-ink-dim mb-2">Compromisos con proveedores</h3>
            {p.partidas.length === 0 ? (
              <div className="bg-white border border-black/5 rounded-2xl p-6 text-center text-xs text-ink-muted">
                Sin compromisos. Edita el proyecto para agregar.
              </div>
            ) : (
              <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-cream/50 text-xs text-ink-muted uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                      <th className="text-right px-4 py-2 font-medium">Acordado</th>
                      <th className="text-right px-4 py-2 font-medium">Pagado</th>
                      <th className="text-right px-4 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.partidas.map((pt: PartidaProyecto) => (
                      <tr key={pt.proveedor_id} className="border-t border-black/5">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink-dim">{pt.proveedor_nombre}</p>
                          {pt.concepto && (
                            <p className="text-[11px] text-ink-muted">{pt.concepto}</p>
                          )}
                        </td>
                        <td className="text-right px-4 py-3 text-sm text-ink-dim">
                          {formatMonto(pt.monto_acordado, "MXN")}
                        </td>
                        <td className="text-right px-4 py-3 text-sm text-ink-dim">
                          {formatMonto(pt.monto_pagado, "MXN")}
                        </td>
                        <td className="text-right px-4 py-3">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${PARTIDA_ESTADO_STYLE[pt.estado] ?? ""}`}
                          >
                            {pt.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Zona peligrosa */}
          <div className="mt-8 pt-6 border-t border-mauve-50">
            <h3 className="text-xs font-medium text-mauve-900 uppercase tracking-wide mb-2">
              Zona peligrosa
            </h3>
            <p className="text-xs text-ink-muted mb-3">
              Eliminar el proyecto <strong>no</strong> borra sus movimientos históricos.
            </p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 border border-mauve-50 text-mauve-900 rounded-xl px-3 py-2 text-sm hover:bg-mauve-50 transition"
              >
                <IconTrash size={14} />
                Eliminar proyecto
              </button>
            ) : (
              <div className="bg-mauve-50 rounded-xl p-3 flex gap-2 items-center">
                <span className="text-xs text-mauve-900 flex-1">¿Confirmar eliminación?</span>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="text-xs text-mauve-900 px-2 py-1.5 hover:underline"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-mauve-900 text-cream rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition"
                >
                  {deleting ? "Eliminando…" : "Sí, eliminar"}
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <ProyectoEditForm
          seccion={editMode === "items" ? "items" : "proyecto"}
          proyecto={p}
          proveedores={proveedores}
          nombre={nombre}
          setNombre={setNombre}
          descripcion={descripcion}
          setDescripcion={setDescripcion}
          precioVenta={precioVenta}
          setPrecioVenta={setPrecioVenta}
          estado={estado}
          setEstado={setEstado}
          ivaIncluido={ivaIncluido}
          setIvaIncluido={setIvaIncluido}
          fechaInicio={fechaInicio}
          setFechaInicio={setFechaInicio}
          partidas={partidasEdit}
          setPartidas={setPartidasEdit}
          items={itemsEdit}
          setItems={setItemsEdit}
          onSave={handleSave}
          onCancel={() => {
            setEditMode("no");
            loadProyecto();
          }}
          saving={saving}
          error={error}
          notice={notice}
        />
      )}
    </div>
  );
}

// --- Edit form (extracted for clarity) ---

interface EditFormProps {
  /** Qué parte se está editando. Mike, 20-sep, con la pantalla enfrente: «el
   *  botón de editar de arriba debería ser para la info del proyecto. Abajo
   *  en la sección de la lista de ítems debería haber otro botón de editar
   *  para editar la lista».
   *
   *  Es UN solo formulario que enseña una mitad u otra, y no dos
   *  formularios: guardar manda el proyecto completo —nombre, ítems y
   *  partidas—, así que partirlo en dos guardados dejaría a cada uno
   *  pisando lo que el otro no enseñó. Lo que no se ve se manda tal como
   *  se cargó. */
  seccion: "proyecto" | "items";
  proyecto: Proyecto;
  proveedores: Proveedor[];
  nombre: string;
  setNombre: (v: string) => void;
  descripcion: string;
  setDescripcion: (v: string) => void;
  precioVenta: string;
  setPrecioVenta: (v: string) => void;
  estado: EstadoProyecto;
  setEstado: (v: EstadoProyecto) => void;
  /** Cómo lleva el IVA esta obra en su estado de cuenta (contrato 0.39.0). */
  ivaIncluido: boolean;
  setIvaIncluido: (v: boolean) => void;
  fechaInicio: string;
  setFechaInicio: (v: string) => void;
  partidas: PartidaForm[];
  setPartidas: React.Dispatch<React.SetStateAction<PartidaForm[]>>;
  items: ItemForm[];
  setItems: React.Dispatch<React.SetStateAction<ItemForm[]>>;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
  notice: string;
}

function ProyectoEditForm(props: EditFormProps) {
  const addPartida = () => {
    props.setPartidas([
      ...props.partidas,
      { proveedor_id: "", proveedor_nombre: "", concepto: "", monto_acordado: "0" },
    ]);
  };
  const updatePartida = (i: number, patch: Partial<PartidaForm>) => {
    props.setPartidas((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const removePartida = (i: number) => {
    props.setPartidas((prev) => prev.filter((_, idx) => idx !== i));
  };

  const compromiso = props.partidas.reduce(
    (s, p) => s + (parseFloat(p.monto_acordado) || 0),
    0
  );
  const precioNum = parseFloat(props.precioVenta) || 0;

  const addItem = () =>
    props.setItems((prev) => [
      ...prev,
      { id: "", nombre: "", descripcion: "", cantidad: "1", unitario: "", monto: "", fecha_entrega: "" },
    ]);
  /** Tocar la cantidad o el precio por pieza recalcula el importe en el
   *  momento: si se guardara con el importe viejo, el precio de venta diría
   *  una cosa y la pantalla otra. */
  const updateItem = (i: number, patch: Partial<ItemForm>) =>
    props.setItems((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const nuevo = { ...p, ...patch };
        if (patch.cantidad !== undefined || patch.unitario !== undefined) {
          nuevo.monto = importe(nuevo.cantidad, nuevo.unitario);
        }
        return nuevo;
      }),
    );
  const removeItem = (i: number) =>
    props.setItems((prev) => prev.filter((_, idx) => idx !== i));
  const sumaItems = props.items.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);

  return (
    <form onSubmit={props.onSave} className="space-y-4">
      <h2 className="text-lg font-medium text-ink-dim">
        {props.seccion === "items" ? "Editar la lista de ítems" : "Editar el proyecto"}
      </h2>

      {props.seccion === "proyecto" && (
        <>
      <div>
        <label className="text-xs font-medium text-ink-dim block mb-1.5">Nombre</label>
        <input
          type="text"
          required
          value={props.nombre}
          onChange={(e) => props.setNombre(e.target.value)}
          className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-dim block mb-1.5">Descripción</label>
        <textarea
          value={props.descripcion}
          onChange={(e) => props.setDescripcion(e.target.value)}
          rows={2}
          className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Estado</label>
          <select
            value={props.estado}
            onChange={(e) => props.setEstado(e.target.value as EstadoProyecto)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          >
            {Object.entries(ESTADO_PROYECTO_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Fecha inicio</label>
          <input
            type="date"
            value={props.fechaInicio}
            onChange={(e) => props.setFechaInicio(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Precio venta</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={props.precioVenta}
            onChange={(e) => props.setPrecioVenta(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>
      </div>

      {/* Cómo lleva el IVA esta obra.
       *
       * Va pegado al precio de venta porque es una pregunta SOBRE esa cifra,
       * no un ajuste aparte: dice si lo que está capturado arriba es el
       * subtotal o el total. Mike lo escogió con botones el 21-sep, «que lo
       * diga cada proyecto», porque en su taller conviven HOLCIM, que pide
       * desglose, y una casa cotizada «con todo».
       *
       * No mueve un solo peso guardado. Sólo cambia lo que dice el estado de
       * cuenta, y por eso la consecuencia va escrita con el número: el que
       * lo marque mal lo va a ver aquí y no en el papel que ya mandó. */}
      <div>
        <label className="text-xs font-medium text-ink-dim block mb-1.5">
          El precio de venta que capturaste, ¿cómo va?
        </label>
        <div className="flex gap-2">
          {[
            { v: false, t: "Más IVA", dice: "es el subtotal y el IVA se suma" },
            { v: true, t: "IVA incluido", dice: "ya lo trae y se desglosa" },
          ].map((o) => (
            <button
              key={o.t}
              type="button"
              onClick={() => props.setIvaIncluido(o.v)}
              aria-pressed={props.ivaIncluido === o.v}
              className={`flex-1 text-left rounded-xl px-3 py-2 text-xs border transition ${
                props.ivaIncluido === o.v
                  ? "bg-ink text-cream border-ink"
                  : "bg-white text-ink-dim border-black/10 hover:border-black/25"
              }`}
            >
              <span className="block font-medium">{o.t}</span>
              <span className={`block text-[11px] ${props.ivaIncluido === o.v ? "opacity-75" : "text-ink-muted"}`}>
                {o.dice}
              </span>
            </button>
          ))}
        </div>
        {(() => {
          const d = desglose(parseFloat(props.precioVenta) || 0, props.ivaIncluido, props.proyecto.tasa_iva ?? 1600);
          return (
            <p className="text-[11px] text-ink-muted mt-1.5">
              En el estado de cuenta se va a leer: subtotal {formatMonto(d.subtotal, "MXN")}, IVA{" "}
              {formatMonto(d.iva, "MXN")}, total {formatMonto(d.total, "MXN")}. No cambia nada de lo
              guardado.
            </p>
          );
        })()}
      </div>
        </>
      )}

      {props.seccion === "items" && (
      <div className="pt-2">
        <div className="flex justify-between items-baseline mb-1">
          <label className="text-xs font-medium text-ink-dim">Ítems del proyecto</label>
          <button
            type="button"
            onClick={addItem}
            className="text-xs text-ink hover:underline flex items-center gap-1"
          >
            <IconPlus size={12} />
            Agregar
          </button>
        </div>
        <p className="text-[11px] text-ink-muted mb-2">
          Lo que el cliente ve en su estado de cuenta. Cada ingreso se asigna a un ítem.
        </p>
        {props.items.length === 0 ? (
          <div className="bg-cream/60 rounded-xl p-4 text-center text-xs text-ink-muted">
            Sin ítems.
          </div>
        ) : (
          <div className="space-y-2">
            {props.items.map((pr, i) => (
              <div key={i} className="bg-white border border-black/10 rounded-xl p-3 space-y-2">
                <div className="flex gap-2 items-start">
                  <input
                    type="text"
                    placeholder="Ítem (p. ej. Puerta de clóset)"
                    value={pr.nombre}
                    onChange={(e) => updateItem(i, { nombre: e.target.value })}
                    className="flex-1 min-w-0 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                  />
                  {/* Cantidad y precio POR PIEZA. «20 puertas del mismo
                    * acabado y precio» se captura así, no multiplicando a
                    * mano. El importe de la línea se calcula y se enseña
                    * abajo: es lo que se guarda y lo que suma al precio de
                    * venta. */}
                  <input
                    type="number"
                    step="1"
                    min="1"
                    aria-label="Cantidad"
                    placeholder="Cant."
                    value={pr.cantidad}
                    onChange={(e) => updateItem(i, { cantidad: e.target.value })}
                    className="w-16 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-right"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label="Precio por pieza"
                    placeholder="$ c/u"
                    value={pr.unitario}
                    onChange={(e) => updateItem(i, { unitario: e.target.value })}
                    className="w-24 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-right"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-ink-muted hover:text-mauve-900 p-1"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Descripción corta (material, medidas…)"
                    value={pr.descripcion}
                    onChange={(e) => updateItem(i, { descripcion: e.target.value })}
                    className="flex-1 min-w-0 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                  />
                  <label className="text-[10px] text-ink-muted whitespace-nowrap">Entrega</label>
                  <input
                    type="date"
                    value={pr.fecha_entrega}
                    onChange={(e) => updateItem(i, { fecha_entrega: e.target.value })}
                    className="w-36 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                  />
                  <span className="text-xs text-ink-dim whitespace-nowrap tabular-nums w-28 text-right">
                    {formatMontoExact(parseFloat(pr.monto) || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {props.items.length > 0 && (
          <div className="mt-2 flex justify-between text-xs px-1">
            <span className="text-ink-muted">Suma de los ítems</span>
            <span
              className={`font-medium ${
                precioNum > 0 && Math.abs(sumaItems - precioNum) > 0.5
                  ? "text-mauve-900"
                  : "text-ink-dim"
              }`}
            >
              {formatMontoExact(sumaItems)}
              {precioNum > 0 && Math.abs(sumaItems - precioNum) > 0.5 && (
                <span className="ml-2 font-normal text-mauve-900">
                  ≠ precio venta {formatMontoExact(precioNum)}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
      )}

      {props.seccion === "proyecto" && (
      <div className="pt-2">
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs font-medium text-ink-dim">Partidas de proveedores</label>
          <button
            type="button"
            onClick={addPartida}
            className="text-xs text-ink hover:underline flex items-center gap-1"
          >
            <IconPlus size={12} />
            Agregar
          </button>
        </div>
        {props.partidas.length === 0 ? (
          <div className="bg-cream/60 rounded-xl p-4 text-center text-xs text-ink-muted">
            Sin partidas.
          </div>
        ) : (
          <div className="space-y-2">
            {props.partidas.map((p, i) => (
              <div
                key={i}
                className="bg-white border border-black/10 rounded-xl p-3 flex gap-2 items-start"
              >
                <select
                  value={p.proveedor_id}
                  onChange={(e) => {
                    const prov = props.proveedores.find((x) => x.id === e.target.value);
                    updatePartida(i, {
                      proveedor_id: e.target.value,
                      proveedor_nombre: prov?.nombre ?? "",
                    });
                  }}
                  className="flex-1 min-w-0 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                >
                  <option value="">— Proveedor —</option>
                  {props.proveedores.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Concepto"
                  value={p.concepto}
                  onChange={(e) => updatePartida(i, { concepto: e.target.value })}
                  className="flex-1 min-w-0 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Monto"
                  value={p.monto_acordado}
                  onChange={(e) => updatePartida(i, { monto_acordado: e.target.value })}
                  className="w-24 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-right"
                />
                <button
                  type="button"
                  onClick={() => removePartida(i)}
                  className="text-ink-muted hover:text-mauve-900 p-1"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {(props.partidas.length > 0 || precioNum > 0) && (
          <div className="mt-3 bg-cream rounded-xl p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-muted">Compromiso total</span>
              <span className="font-medium text-mauve-900">
                {formatMontoExact(compromiso)}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-ink-muted">Margen proyectado</span>
              <span
                className={`font-medium ${precioNum - compromiso >= 0 ? "text-mint-900" : "text-mauve-900"}`}
              >
                {formatMontoExact(precioNum - compromiso)}
              </span>
            </div>
          </div>
        )}
      </div>
      )}

      {props.error && (
        <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{props.error}</p>
      )}
      {props.notice && (
        <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl">{props.notice}</p>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={props.saving || !props.nombre.trim()}
          className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
        >
          {props.saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

// --- Los ítems del proyecto (vista) ---
