"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import { listClientes, createCliente } from "@/lib/clientes";
import { listProveedores, createProveedor } from "@/lib/proveedores";
import { listProyectos, createProyecto } from "@/lib/proyectos";
import { createMovimiento, getMovimiento, updateMovimiento, type MovimientoInput } from "@/lib/movimientos";
import type {
  Cuenta,
  Cliente,
  Proveedor,
  Proyecto,
  Negocio,
  TipoMovimiento,
} from "@/types/schema";
import { formatMonto } from "@/lib/format";
import { crearCfdi, ligarCfdi } from "@/lib/fiscal";
import { subirArchivo } from "@/lib/ordenes";
import {
  IconArrowLeft,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconChevronDown,
  IconPlus,
  IconX,
} from "@tabler/icons-react";

type QuickCreate = null | "proyecto" | "cliente" | "proveedor";

/** La fecha de un movimiento, en el AAAA-MM-DD que pide un `input[type=date]`.
 *  Llega como Timestamp de Firestore o como Date, según la fuente. */
function aDiaLocal(f: unknown): string {
  const d = f && typeof (f as { toDate?: () => Date }).toDate === "function"
    ? (f as { toDate: () => Date }).toDate()
    : new Date(f as string | number | Date);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

/** El formulario de un movimiento, que sirve para capturar y para corregir.
 *
 *  Es UNA sola pantalla a propósito. Un formulario de captura y otro de
 *  corrección se ven iguales el día que se escriben y dejan de parecerse a
 *  los tres meses: uno gana un campo, el otro no, y la diferencia se
 *  descubre cuando alguien corrige algo y pierde un dato sin avisar.
 *
 *  Con `movimientoId` entra en modo corrección: carga lo que hay, lo
 *  prellena y guarda con `updateMovimiento`. */
export function FormMovimiento({ movimientoId }: { movimientoId?: string }) {
  const editando = Boolean(movimientoId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { negocios, activo } = useNegocioActivo();

  const [negocioId, setNegocioId] = useState<string>("");
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loadingCat, setLoadingCat] = useState(false);

  const [tipo, setTipo] = useState<TipoMovimiento>(
    (searchParams?.get("tipo") as TipoMovimiento) ?? "ingreso"
  );
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [proyectoId, setProyectoId] = useState(searchParams?.get("proyecto") ?? "");
  const [cuentaId, setCuentaId] = useState("");
  const [contraparteId, setContraparteId] = useState("");
  const [productoId, setProductoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [showNota, setShowNota] = useState(false);
  /* La factura, en tres estados y no en una palomita.
   *
   * «Ya se facturó» y «falta facturar» no son lo mismo que sí y no: falta el
   * tercero, «no lleva factura», que es el préstamo del socio, la devolución
   * o el traspaso. Sin ése, o se marca una mentira o el movimiento se queda
   * para siempre en la lista de pendientes y la lista deja de leerse.
   *
   * Un cobro a cliente arranca en «falta facturar», que es lo que casi
   * siempre pasa. Un egreso arranca en «no lleva»: los que sí la llevan
   * vienen de una orden de compra, que ya trae el dato desde que se pidió. */
  const [factura, setFactura] = useState<"ya" | "falta" | "no">("falta");
  /* Los datos de la factura, cuando se escoge «Ya se facturó».
   *
   * Se capturan AQUÍ y no en otra pantalla. El texto de ayuda prometía
   * «te llevo a capturar el folio fiscal», y lo que hacía era mandar a la
   * lista de pendientes a buscar el renglón: eso no es capturar una
   * factura. Mike lo dijo con todas sus letras el 20-sep. */
  const [uuid, setUuid] = useState("");
  const [rfcFactura, setRfcFactura] = useState("");
  const [fechaFactura, setFechaFactura] = useState("");
  const [ivaFactura, setIvaFactura] = useState("");
  const [archivoFactura, setArchivoFactura] = useState<File | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreate>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  /* Modo corrección. `bloqueado` guarda el porqué cuando este movimiento no
   * se puede corregir aquí; la razón se enseña en pantalla en vez de dejar
   * un formulario que va a fallar al guardar. */
  const [cargandoMov, setCargandoMov] = useState(editando);
  const [bloqueado, setBloqueado] = useState("");
  /* El monto de un movimiento YA facturado no se toca; lo demás de ese
   * movimiento sí. Por eso se guarda el importe original: lo que se prohíbe
   * es CAMBIARLO, no corregirle la nota o el proyecto. */
  const [montoFijo, setMontoFijo] = useState(false);
  const [montoOriginal, setMontoOriginal] = useState("");
  /* Hay movimientos que legítimamente NO tienen contraparte: un ajuste, un
   * gasto fijo, la caseta de la carretera, algo importado de antes. El
   * formulario los daba por imposibles sin decirlo —el botón de guardar se
   * quedaba apagado y picarle no hacía nada—, y encima la única salida
   * habría sido colgarle un proveedor inventado: un pago atribuido a quien
   * nunca lo cobró, que es peor que no poder corregirlo.
   *
   * Aquí se guarda lo que traía para poder conservarlo tal cual. */
  const [contraparteOriginal, setContraparteOriginal] =
    useState<{ tipo: string; nombre: string } | null>(null);

  const negocio = useMemo<Negocio | null>(
    () => negocios.find((n) => n.id === negocioId) ?? null,
    [negocios, negocioId]
  );

  useEffect(() => {
    if (!negocioId && activo?.id) setNegocioId(activo.id);
  }, [activo, negocioId]);

  /* Corregir: se trae lo que hay y se prellena. Las dos cerraduras se
   * revisan aquí para poder EXPLICARLAS, y otra vez en la escritura, que es
   * donde de verdad cuentan: una pantalla vieja en un teléfono que no se ha
   * refrescado sigue mandando lo de antes. */
  useEffect(() => {
    if (!movimientoId) return;
    let vivo = true;
    (async () => {
      try {
        const m = await getMovimiento(movimientoId);
        if (!vivo) return;
        if (!m) { setBloqueado("Ese movimiento ya no existe."); return; }
        if (m.transfer_id) {
          setBloqueado(
            "Esto es una transferencia entre cuentas: son dos movimientos espejo y " +
            "corregir uno solo dejaría las dos cuentas descuadradas. Bórrala desde la " +
            "lista —se van las dos patas— y vuélvela a capturar.",
          );
          return;
        }
        // Las llaves, antes de escribir: dicen a los efectos de limpieza que
        // ese valor lo puso la carga y que no hay nada que tirar.
        negocioDeLaCarga.current = m.negocio_id;
        tipoDeLaCarga.current = m.tipo;
        proyectoDeLaCarga.current = m.proyecto_id ?? "";

        setMontoFijo(Boolean(m.facturado));
        setTipo(m.tipo);
        setMonto(String(m.monto));
        setMontoOriginal(String(m.monto));
        setFecha(aDiaLocal(m.fecha));
        setNegocioId(m.negocio_id);
        setCuentaId(m.cuenta_id);
        setProyectoId(m.proyecto_id ?? "");
        setContraparteId(m.contraparte_id ?? "");
        if (!m.contraparte_id) {
          setContraparteOriginal({ tipo: m.contraparte_tipo ?? "otro", nombre: m.contraparte_nombre ?? "" });
        }
        setProductoId(m.producto_id ?? "");
        setFactura(m.facturado ? "ya" : m.requiere_factura ? "falta" : "no");
        if (m.descripcion) { setDescripcion(m.descripcion); setShowNota(true); }
      } catch (e) {
        if (vivo) setBloqueado(e instanceof Error ? e.message : "No se pudo abrir el movimiento.");
      } finally {
        if (vivo) setCargandoMov(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientoId]);

  const loadCatalogos = async (nid: string) => {
    setLoadingCat(true);
    try {
      const [cs, cls, pvs, prs] = await Promise.all([
        listCuentas(nid),
        listClientes(nid),
        listProveedores(),
        listProyectos(nid),
      ]);
      setCuentas(cs);
      setClientes(cls);
      setProveedores(pvs);
      setProyectos(prs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error catálogo");
    } finally {
      setLoadingCat(false);
    }
  };

  /* Al cambiar de negocio se limpia lo que dependía del anterior —cuenta,
   * proyecto, contraparte—, porque son de ese negocio y no del nuevo.
   *
   * PERO NO CUANDO EL CAMBIO LO HIZO LA CARGA DE UN MOVIMIENTO. Si el
   * movimiento que se corrige es de OTRO negocio que el activo, cargarlo
   * cambia el negocio, este efecto corre después y borraba la cuenta y el
   * cliente recién prellenados: el botón de guardar se quedaba apagado y no
   * pasaba nada al picarle.
   *
   * No se resuelve con una marca de «primera vuelta»: cuál vuelta es la
   * primera depende del orden en que corren los efectos, y ese orden cambia
   * según si el negocio del movimiento es el activo o no. La llave sí: dice
   * «este valor lo puso la carga», y eso es cierto venga cuando venga. */
  const negocioDeLaCarga = useRef<string | null>(null);
  useEffect(() => {
    if (!negocioId) return;
    const vieneDeLaCarga = negocioDeLaCarga.current === negocioId;
    negocioDeLaCarga.current = null;
    if (!vieneDeLaCarga) {
      setCuentaId("");
      setProyectoId("");
      setContraparteId("");
      setProductoId("");
    }
    setQuickCreate(null);
    loadCatalogos(negocioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId]);

  const proyectoSel = proyectos.find((p) => p.id === proyectoId);
  const productosDelProyecto = proyectoSel?.productos ?? [];
  const productoSel = productosDelProyecto.find((pr) => pr.id === productoId);

  const fechaFacturaTocada = useRef(false);
  const ivaTocado = useRef(false);
  useEffect(() => {
    if (!fechaFacturaTocada.current) setFechaFactura(fecha);
  }, [fecha]);

  /* El IVA se propone al 16 % desde el total, que es lo que es casi
   * siempre; si no, se corrige antes de guardar. El subtotal sale de la
   * resta, así que la factura siempre cuadra con el movimiento al centavo. */
  useEffect(() => {
    if (ivaTocado.current) return;
    const total = parseFloat(monto);
    setIvaFactura(total > 0 ? (Math.round(total * 100 * 16 / 116) / 100).toFixed(2) : "");
  }, [monto]);

  const tipoDeLaCarga = useRef<string | null>(null);
  useEffect(() => {
    if (tipoDeLaCarga.current === tipo) { tipoDeLaCarga.current = null; return; }
    tipoDeLaCarga.current = null;
    setFactura(tipo === "ingreso" ? "falta" : "no");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  // Ingreso a un proyecto de un cliente: preselecciona al cliente del proyecto
  const proyectoDeLaCarga = useRef<string | null>(null);
  useEffect(() => {
    if (proyectoDeLaCarga.current === proyectoId) { proyectoDeLaCarga.current = null; return; }
    proyectoDeLaCarga.current = null;
    setProductoId("");
    if (tipo === "ingreso" && proyectoSel?.cliente_id) setContraparteId(proyectoSel.cliente_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, tipo]);
  const proveedoresDelProyecto = useMemo(() => {
    if (!proyectoSel) return proveedores;
    const ids = new Set(proyectoSel.partidas.map((p) => p.proveedor_id));
    const enPartidas = proveedores.filter((p) => ids.has(p.id!));
    const otros = proveedores.filter((p) => !ids.has(p.id!));
    return [...enPartidas, ...otros];
  }, [proyectoSel, proveedores]);

  const proyectosActivos = proyectos.filter((p) => p.estado !== "cerrado");
  const contrapartes = tipo === "ingreso" ? clientes : proveedoresDelProyecto;
  const contraparteLabel = tipo === "ingreso" ? "Cliente" : "Proveedor";
  /* Se queda sin contraparte sólo si así venía Y el usuario no le puso una. */
  const sinContraparte = Boolean(contraparteOriginal) && !contraparteId;

  if (editando && (cargandoMov || bloqueado)) {
    return (
      <div className="max-w-lg">
        <Link href="/movimientos" className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition">
          <IconArrowLeft size={13} />
          Volver
        </Link>
        {cargandoMov ? (
          <p className="text-sm text-ink-muted">Cargando…</p>
        ) : (
          <div className="bg-white border border-black/5 rounded-2xl p-5">
            <p className="text-sm font-medium text-ink-dim mb-1.5">Este movimiento no se corrige desde aquí</p>
            <p className="text-xs text-ink-muted">{bloqueado}</p>
          </div>
        )}
      </div>
    );
  }

  if (negocios.length === 0) {
    return (
      <div className="max-w-lg">
        <Link href="/movimientos" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-ink-muted">
          Crea un negocio primero.{" "}
          <Link href="/negocios/nuevo" className="underline">
            Crear negocio
          </Link>
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !negocio) return;
    setError("");

    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      setError("Ingresa un monto válido");
      return;
    }
    if (montoFijo && montoNum !== parseFloat(montoOriginal)) {
      setError(
        "Este movimiento ya tiene factura por ese importe. Quita la marca de facturado, " +
        "corrige el monto, y vuelve a capturar la factura. Lo demás sí lo puedes corregir aquí.",
      );
      return;
    }
    const cuenta = cuentas.find((c) => c.id === cuentaId);
    if (!cuenta) {
      setError("Selecciona una cuenta");
      return;
    }
    const contraparteObj =
      tipo === "ingreso"
        ? clientes.find((c) => c.id === contraparteId)
        : proveedores.find((p) => p.id === contraparteId);
    if (!contraparteObj && !sinContraparte) {
      setError(
        contraparteId
          ? `Ese ${contraparteLabel.toLowerCase()} ya no está en la lista de este negocio. Escoge otro.`
          : `Selecciona un ${contraparteLabel.toLowerCase()}`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const datos: MovimientoInput = {
        tipo,
        monto: montoNum,
        fecha: new Date(fecha),
        cuenta_id: cuenta.id!,
        cuenta_nombre: cuenta.nombre,
        proyecto_id: proyectoId || null,
        proyecto_nombre: proyectoSel?.nombre ?? null,
        /* Sin contraparte se conserva lo que traía, tal cual. No se le
         * inventa una para poder guardar. */
        contraparte_id: contraparteObj ? contraparteObj.id! : null,
        contraparte_tipo: contraparteObj
          ? (tipo === "ingreso" ? "cliente" : "proveedor")
          : ((contraparteOriginal?.tipo ?? "otro") as MovimientoInput["contraparte_tipo"]),
        contraparte_nombre: contraparteObj ? contraparteObj.nombre : (contraparteOriginal?.nombre ?? ""),
        producto_id: tipo === "ingreso" && productoSel ? productoSel.id : null,
        producto_nombre: tipo === "ingreso" && productoSel ? productoSel.nombre : null,
        negocio_id: negocio.id!,
        descripcion: descripcion.trim() || undefined,
        /* «Ya se facturó» también espera factura: la espera es lo que hace
         * que se persiga si mañana la cancelan. Lo que la saca de la lista
         * de pendientes es `facturado`, que se marca aparte con su UUID. */
        requiere_factura: factura !== "no",
      };
      const id = movimientoId
        ? (await updateMovimiento(movimientoId, datos), movimientoId)
        : await createMovimiento(user.uid, datos);

      /* Si dijo «ya se facturó», la factura se captura y se cuelga AQUÍ
       * mismo, del movimiento que se acaba de guardar. Nunca se crea otro
       * movimiento: una factura no es un cobro aparte.
       *
       * El total de la factura es el del movimiento, siempre. Así no puede
       * quedar una factura por una cifra y su movimiento por otra, que es
       * de donde sale el IVA que se entera. */
      if (factura === "ya" && uuid.trim()) {
        const ivaNum = Number(ivaFactura) || 0;
        const c = await crearCfdi({
          negocio_id: negocio.id!, uuid: uuid.trim(), tipo,
          rfc: rfcFactura.trim().toUpperCase() || null,
          subtotal: montoNum - ivaNum, iva: ivaNum, retenciones: 0,
          total: montoNum, fecha: fechaFactura || fecha,
        });
        await ligarCfdi(c.id, id);
        if (archivoFactura) await subirArchivo("movimientos", id, archivoFactura);
      }

      router.push("/movimientos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear movimiento");
    } finally {
      setSubmitting(false);
    }
  };

  const isIngreso = tipo === "ingreso";
  const accentBg = isIngreso ? "bg-mint-50" : "bg-mauve-50";
  const accentTxt = isIngreso ? "text-mint-900" : "text-mauve-900";
  const accentLabel = isIngreso ? "text-mint-label" : "text-mauve-label";
  const symbol = isIngreso ? "+" : "−";

  return (
    <div className="max-w-lg">
      <Link
        href="/movimientos"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver
      </Link>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hero: monto + tipo */}
        <div className={`${accentBg} rounded-3xl p-6`}>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-medium ${accentTxt}`}>{symbol}</span>
            <span className={`text-xs font-medium ${accentLabel} mb-1`}>
              {negocio?.moneda ?? "MXN"}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              className={`flex-1 bg-transparent border-none text-4xl font-medium tracking-tight ${accentTxt} placeholder-current placeholder-opacity-30 focus:outline-none min-w-0`}
              autoFocus
            />
          </div>
          {montoFijo && (
            <p className="text-[11px] text-ink-muted mt-1">
              Este movimiento ya tiene factura por ese importe: el monto no se cambia aquí.
              Quita la marca de facturado, corrígelo, y vuelve a capturar la factura. Lo demás sí.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setTipo("ingreso");
                setContraparteId("");
                setQuickCreate(null);
              }}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition ${
                isIngreso
                  ? "bg-white border-mint-900 text-mint-900"
                  : "bg-transparent border-transparent text-ink-muted hover:bg-white/50"
              }`}
            >
              <IconArrowDownLeft size={14} />
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo("egreso");
                setContraparteId("");
                setQuickCreate(null);
              }}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition ${
                !isIngreso
                  ? "bg-white border-mauve-900 text-mauve-900"
                  : "bg-transparent border-transparent text-ink-muted hover:bg-white/50"
              }`}
            >
              <IconArrowUpRight size={14} />
              Egreso
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Negocio <span className="text-mauve-900">*</span>
            </label>
            <select
              value={negocioId}
              onChange={(e) => setNegocioId(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              {negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </div>

          {loadingCat ? (
            <p className="text-xs text-ink-muted text-center py-3">Cargando catálogo…</p>
          ) : (
            <>
              {/* Proyecto */}
              <SelectConCrear
                /* Al CAPTURAR un ingreso el proyecto es obligatorio: un cobro
                 * que no se sabe de qué obra es no sirve para nada después.
                 *
                 * Al CORREGIR no se obliga. Un ingreso sin proyecto puede
                 * existir —los hay importados de antes, y los que se
                 * capturaron cuando la regla no estaba—, y obligar aquí
                 * dejaría esos movimientos sin manera de corregirse: el
                 * navegador bloquea el envío del formulario en silencio, se
                 * le pica a «Guardar cambios» y no pasa NADA. Quien viene a
                 * arreglar un cero de más acabaría inventando un proyecto
                 * para poder guardar, que es peor que el error original. */
                label={`Proyecto ${isIngreso && !editando ? "*" : "(opcional)"}`}
                required={isIngreso && !editando}
                value={proyectoId}
                onChange={setProyectoId}
                emptyLabel={isIngreso ? "— Selecciona —" : "— Sin proyecto —"}
                options={proyectosActivos.map((p) => ({
                  id: p.id!,
                  label: `${p.nombre} · ${p.cliente_nombre}`,
                }))}
                createLabel="Crear nuevo proyecto"
                onOpenCreate={() =>
                  setQuickCreate(quickCreate === "proyecto" ? null : "proyecto")
                }
                isOpenCreate={quickCreate === "proyecto"}
              />
              {quickCreate === "proyecto" && (
                <QuickCreateProyecto
                  clientes={clientes}
                  moneda={negocio?.moneda ?? "MXN"}
                  onCancel={() => setQuickCreate(null)}
                  onCreated={async (newId) => {
                    await loadCatalogos(negocioId);
                    setProyectoId(newId);
                    setQuickCreate(null);
                  }}
                  onNeedCliente={() => setQuickCreate("cliente")}
                  uid={user!.uid}
                  negocio={negocio!}
                />
              )}

              {/* Producto (ingreso a proyecto con productos) */}
              {isIngreso && productosDelProyecto.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-ink-dim block mb-1.5">
                    Producto <span className="text-ink-muted font-normal">(portal del cliente)</span>
                  </label>
                  <select
                    value={productoId}
                    onChange={(e) => setProductoId(e.target.value)}
                    className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                  >
                    <option value="">— Sin asignar (solo al proyecto) —</option>
                    {productosDelProyecto.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.nombre} · {formatMonto(pr.pagado ?? 0)} / {formatMonto(pr.monto)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cuenta */}
              <div>
                <label className="text-xs font-medium text-ink-dim block mb-1.5">
                  Cuenta <span className="text-mauve-900">*</span>
                </label>
                <select
                  required
                  value={cuentaId}
                  onChange={(e) => setCuentaId(e.target.value)}
                  className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                >
                  <option value="">— Selecciona —</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} · {formatMonto(c.saldo_actual, c.moneda)}
                    </option>
                  ))}
                </select>
                {cuentas.length === 0 && (
                  <p className="text-xs text-ink-muted mt-1">
                    Sin cuentas.{" "}
                    <Link href="/cuentas/nueva" className="underline">
                      Crear cuenta
                    </Link>
                  </p>
                )}
              </div>

              {/* Contraparte */}
              <SelectConCrear
                label={sinContraparte ? contraparteLabel : `${contraparteLabel} *`}
                required={!sinContraparte}
                value={contraparteId}
                onChange={setContraparteId}
                emptyLabel={
                  contraparteOriginal
                    ? `Sin ${contraparteLabel.toLowerCase()}${contraparteOriginal.nombre ? ` · ${contraparteOriginal.nombre}` : ""}`
                    : "— Selecciona —"
                }
                hint={
                  sinContraparte
                    ? `Este movimiento se capturó sin ${contraparteLabel.toLowerCase()} y así se queda. Si le pones uno, se guarda con ése.`
                    : undefined
                }
                options={contrapartes.map((c) => ({ id: c.id!, label: c.nombre }))}
                createLabel={`Crear nuevo ${contraparteLabel.toLowerCase()}`}
                onOpenCreate={() =>
                  setQuickCreate(
                    quickCreate === (isIngreso ? "cliente" : "proveedor")
                      ? null
                      : isIngreso
                      ? "cliente"
                      : "proveedor"
                  )
                }
                isOpenCreate={
                  quickCreate === (isIngreso ? "cliente" : "proveedor")
                }
              />
              {quickCreate === "cliente" && (
                <QuickCreateCliente
                  onCancel={() => setQuickCreate(null)}
                  onCreated={async (newId) => {
                    await loadCatalogos(negocioId);
                    if (tipo === "ingreso") setContraparteId(newId);
                    setQuickCreate(null);
                  }}
                  uid={user!.uid}
                  negocioId={negocioId}
                />
              )}
              {quickCreate === "proveedor" && (
                <QuickCreateProveedor
                  onCancel={() => setQuickCreate(null)}
                  onCreated={async (newId) => {
                    await loadCatalogos(negocioId);
                    if (tipo === "egreso") setContraparteId(newId);
                    setQuickCreate(null);
                  }}
                  uid={user!.uid}
                />
              )}

              {/* Nota */}
              {!showNota ? (
                <button
                  type="button"
                  onClick={() => setShowNota(true)}
                  className="text-xs text-ink-muted hover:text-ink-dim transition flex items-center gap-1"
                >
                  <IconChevronDown size={12} />
                  Agregar nota
                </button>
              ) : (
                <div>
                  <label className="text-xs font-medium text-ink-dim block mb-1.5">Nota</label>
                  <input
                    type="text"
                    maxLength={200}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Ej: Factura 456, anticipo 2a parcialidad…"
                    className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-ink-dim block mb-1.5">Factura</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ["ya", "Ya se facturó"],
                    ["falta", "Falta facturar"],
                    ["no", "No lleva"],
                  ] as const).map(([v, texto]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFactura(v)}
                      aria-pressed={factura === v}
                      className={`rounded-xl px-2 py-2 text-xs border transition ${
                        factura === v
                          ? "bg-ink text-white border-ink"
                          : "bg-white text-ink-dim border-black/10 hover:border-ink/30"
                      }`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-ink-muted mt-1.5">
                  {factura === "ya"
                    ? "Captura aquí el folio fiscal y, si quieres, cuelga el archivo."
                    : factura === "falta"
                      ? "Se queda en «pendientes de facturar» hasta que la captures."
                      : "No aparece en pendientes. Para un préstamo, un traspaso o una devolución."}
                </p>

                {factura === "ya" && (
                  <div className="mt-3 bg-cream rounded-xl p-3 space-y-3">
                    <div>
                      <label htmlFor="uuid-factura" className="text-xs font-medium text-ink-dim block mb-1.5">
                        Folio fiscal (UUID)
                      </label>
                      <input
                        id="uuid-factura"
                        type="text"
                        value={uuid}
                        onChange={(e) => setUuid(e.target.value)}
                        placeholder="A1B2C3D4-…"
                        className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label htmlFor="rfc-factura" className="text-xs font-medium text-ink-dim block mb-1.5">
                          RFC
                        </label>
                        <input
                          id="rfc-factura"
                          type="text"
                          value={rfcFactura}
                          onChange={(e) => setRfcFactura(e.target.value.toUpperCase())}
                          className="w-full bg-white border border-black/10 rounded-xl px-2 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                        />
                      </div>
                      <div>
                        <label htmlFor="fecha-factura" className="text-xs font-medium text-ink-dim block mb-1.5">
                          Fecha
                        </label>
                        <input
                          id="fecha-factura"
                          type="date"
                          value={fechaFactura}
                          onChange={(e) => { fechaFacturaTocada.current = true; setFechaFactura(e.target.value); }}
                          className="w-full bg-white border border-black/10 rounded-xl px-2 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                        />
                      </div>
                      <div>
                        <label htmlFor="iva-factura" className="text-xs font-medium text-ink-dim block mb-1.5">
                          IVA
                        </label>
                        <input
                          id="iva-factura"
                          type="number"
                          step="0.01"
                          value={ivaFactura}
                          onChange={(e) => { ivaTocado.current = true; setIvaFactura(e.target.value); }}
                          className="w-full bg-white border border-black/10 rounded-xl px-2 py-2 text-sm tabular-nums focus:outline-none focus:border-ink/40 transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="archivo-factura" className="text-xs font-medium text-ink-dim block mb-1.5">
                        El archivo (XML o PDF) — opcional
                      </label>
                      <input
                        id="archivo-factura"
                        type="file"
                        accept=".xml,.pdf,application/xml,text/xml,application/pdf"
                        onChange={(e) => setArchivoFactura(e.target.files?.[0] ?? null)}
                        className="w-full text-xs text-ink-dim file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:text-ink-dim"
                      />
                    </div>

                    <p className="text-[11px] text-ink-muted">
                      El total de la factura es el del movimiento: {formatMonto(parseFloat(monto) || 0, negocio?.moneda ?? "MXN")}.
                      El subtotal sale de restarle el IVA, así que siempre cuadran al centavo.
                      {!uuid.trim() && " Sin folio fiscal se guarda como «falta facturar»."}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/movimientos"
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            /* Apagado SÓLO mientras trabaja o mientras carga los catálogos.
             * Antes se apagaba también cuando faltaba un dato, y ésa era la
             * mitad callada del defecto: picarle no hacía nada y no había
             * un solo mensaje que dijera qué faltaba. Lo que falta lo dice
             * ahora el navegador (los campos obligatorios) o `handleSubmit`
             * con su frase. Un botón apagado sin explicación se ve igual
             * que uno descompuesto. */
            disabled={submitting || loadingCat}
            className="flex-1 bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? (editando ? "Guardando…" : "Registrando…") : editando ? "Guardar cambios" : `Registrar ${isIngreso ? "ingreso" : "egreso"}`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Componentes helper ───

function SelectConCrear({
  label,
  required,
  value,
  onChange,
  options,
  emptyLabel,
  hint,
  createLabel,
  onOpenCreate,
  isOpenCreate,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  emptyLabel: string;
  createLabel: string;
  onOpenCreate: () => void;
  isOpenCreate: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-dim block mb-1.5">{label}</label>
      <div className="flex gap-2">
        <select
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition min-w-0"
        >
          <option value="">{emptyLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenCreate}
          title={createLabel}
          className={`flex-shrink-0 rounded-xl px-3 py-2 text-sm border transition flex items-center gap-1 ${
            isOpenCreate
              ? "bg-ink text-cream border-ink"
              : "bg-white text-ink-dim border-black/10 hover:border-black/20"
          }`}
        >
          {isOpenCreate ? <IconX size={14} /> : <IconPlus size={14} />}
        </button>
      </div>
      {hint && <p className="text-xs text-ink-muted mt-1">{hint}</p>}
    </div>
  );
}

function QuickCreateProyecto({
  clientes,
  moneda,
  onCancel,
  onCreated,
  onNeedCliente,
  uid,
  negocio,
}: {
  clientes: Cliente[];
  moneda: string;
  onCancel: () => void;
  onCreated: (id: string) => void | Promise<void>;
  onNeedCliente: () => void;
  uid: string;
  negocio: Negocio;
}) {
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [precio, setPrecio] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setErr("");
    if (!nombre.trim()) return setErr("Nombre requerido");
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return setErr("Selecciona un cliente");
    setSaving(true);
    try {
      const id = await createProyecto(uid, {
        nombre: nombre.trim(),
        cliente_id: cliente.id!,
        cliente_nombre: cliente.nombre,
        negocio_id: negocio.id!,
        negocio_nombre: negocio.nombre,
        precio_venta: parseFloat(precio) || 0,
        partidas: [],
        estado: "activo",
        fecha_inicio: new Date(),
      });
      await onCreated(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  return (
    <div className="bg-cream/60 rounded-xl p-3 space-y-2 border border-black/5">
      <p className="text-xs font-medium text-ink-dim">Crear proyecto rápido</p>
      <input
        type="text"
        placeholder="Nombre del proyecto"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
        autoFocus
      />
      {clientes.length === 0 ? (
        <div className="bg-sky-50 text-sky-900 text-xs px-2.5 py-2 rounded-lg">
          Necesitas crear un cliente primero.{" "}
          <button
            type="button"
            onClick={onNeedCliente}
            className="underline font-medium"
          >
            Crear cliente
          </button>
        </div>
      ) : (
        <select
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
        >
          <option value="">— Cliente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      )}
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder={`Precio de venta (${moneda}) — opcional`}
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
      />
      {err && <p className="text-xs text-mauve-900">{err}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-ink-muted px-2 py-1 hover:underline"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nombre.trim() || clientes.length === 0}
          className="bg-ink text-cream rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-ink/90 disabled:opacity-50 transition"
        >
          {saving ? "Creando…" : "Crear proyecto"}
        </button>
      </div>
    </div>
  );
}

function QuickCreateCliente({
  onCancel,
  onCreated,
  uid,
  negocioId,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void | Promise<void>;
  uid: string;
  negocioId: string;
}) {
  const [nombre, setNombre] = useState("");
  const [rfc, setRfc] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setErr("");
    if (!nombre.trim()) return setErr("Nombre requerido");
    setSaving(true);
    try {
      const id = await createCliente(uid, {
        nombre: nombre.trim(),
        rfc: rfc.trim() || undefined,
        negocio_id: negocioId,
      });
      await onCreated(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  return (
    <div className="bg-cream/60 rounded-xl p-3 space-y-2 border border-black/5">
      <p className="text-xs font-medium text-ink-dim">Crear cliente rápido</p>
      <input
        type="text"
        placeholder="Nombre o razón social"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
        autoFocus
      />
      <input
        type="text"
        placeholder="RFC (opcional)"
        value={rfc}
        onChange={(e) => setRfc(e.target.value.toUpperCase())}
        maxLength={13}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none uppercase"
      />
      {err && <p className="text-xs text-mauve-900">{err}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-ink-muted px-2 py-1 hover:underline"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nombre.trim()}
          className="bg-ink text-cream rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-ink/90 disabled:opacity-50 transition"
        >
          {saving ? "Creando…" : "Crear cliente"}
        </button>
      </div>
    </div>
  );
}

function QuickCreateProveedor({
  onCancel,
  onCreated,
  uid,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void | Promise<void>;
  uid: string;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setErr("");
    if (!nombre.trim()) return setErr("Nombre requerido");
    setSaving(true);
    try {
      const id = await createProveedor(uid, {
        nombre: nombre.trim(),
        categoria: categoria.trim() || undefined,
      });
      await onCreated(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  return (
    <div className="bg-cream/60 rounded-xl p-3 space-y-2 border border-black/5">
      <p className="text-xs font-medium text-ink-dim">Crear proveedor rápido</p>
      <input
        type="text"
        placeholder="Nombre del proveedor"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
        autoFocus
      />
      <input
        type="text"
        placeholder="Categoría (opcional)"
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
      />
      {err && <p className="text-xs text-mauve-900">{err}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-ink-muted px-2 py-1 hover:underline"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nombre.trim()}
          className="bg-ink text-cream rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-ink/90 disabled:opacity-50 transition"
        >
          {saving ? "Creando…" : "Crear proveedor"}
        </button>
      </div>
    </div>
  );
}
