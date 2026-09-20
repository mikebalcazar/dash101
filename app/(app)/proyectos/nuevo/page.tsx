"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { clientesParecidos, createCliente, listClientes } from "@/lib/clientes";
import { listProveedores } from "@/lib/proveedores";
import { createProyecto } from "@/lib/proyectos";
import { listObras, ligarObra, type Obra } from "@/lib/obras";
import { normalizarNombre } from "@/lib/clientes";
import type { Cliente, Proveedor, EstadoProyecto } from "@/types/schema";
import { ESTADO_PROYECTO_LABELS } from "@/types/schema";
import { formatMonto } from "@/lib/format";
import { IconArrowLeft, IconPlus, IconTrash } from "@tabler/icons-react";

interface Partida {
  proveedor_id: string;
  proveedor_nombre: string;
  concepto: string;
  monto_acordado: string;
}

export default function NuevoProyectoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { activo } = useNegocioActivo();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [clienteId, setClienteId] = useState("");

  /* Dar de alta un cliente sin salirse de aquí. Antes había que irse a
   * Clientes, crearlo, y volver a empezar el proyecto desde cero: el
   * formulario se perdía. Lo pidió Mike el 20-sep. */
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [nc, setNc] = useState({ nombre: "", email: "", telefono: "" });
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [errorCliente, setErrorCliente] = useState("");
  const [parecidos, setParecidos] = useState<Cliente[]>([]);
  const [insistir, setInsistir] = useState(false);
  const [precioVenta, setPrecioVenta] = useState("0");
  const [estado, setEstado] = useState<EstadoProyecto>("planeando");
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [partidas, setPartidas] = useState<Partida[]>([]);

  /* Las obras que ya existen en quell101 y todavía no tienen proyecto aquí.
   * Mike, 20-sep: «deberían aparecer los proyectos creados en quell101 que
   * aún no están activados dentro de dash101». Escoger una llena el nombre y
   * el cliente, y al guardar el proyecto queda ligado con ella: de ahí en
   * adelante las dos apps hablan de la misma casa. */
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activo?.id) {
      setLoadingCatalog(false);
      return;
    }
    /* Las obras se piden con `catch`: una empresa que no usa quell101 no
     * tiene por qué ver un error aquí, nada más no ve el bloque. */
    Promise.all([listClientes(activo.id), listProveedores(), listObras(true).catch(() => [] as Obra[])])
      .then(([cs, ps, os]) => {
        setClientes(cs);
        setProveedores(ps);
        setObras(os);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error cargando catálogo"))
      .finally(() => setLoadingCatalog(false));
  }, [activo]);

  if (!activo) {
    return (
      <div className="max-w-lg">
        <Link href="/proyectos" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-ink-muted">Selecciona o crea un negocio primero.</p>
      </div>
    );
  }

  const addPartida = () => {
    setPartidas([
      ...partidas,
      { proveedor_id: "", proveedor_nombre: "", concepto: "", monto_acordado: "0" },
    ]);
  };

  const updatePartida = (i: number, patch: Partial<Partida>) => {
    setPartidas((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const removePartida = (i: number) => {
    setPartidas((prev) => prev.filter((_, idx) => idx !== i));
  };

  /** Escoger una obra de quell101 llena lo que ya se sabe de ella: el nombre
   *  y, si el cliente ya está dado de alta aquí con ese mismo nombre, el
   *  cliente. Lo que ya se haya escrito NO se pisa: si alguien ya tecleó un
   *  nombre, ése se queda —la obra se llama como se llama en obra, y aquí el
   *  proyecto puede llamarse de otro modo sin dejar de ser la misma casa—. */
  const escogerObra = (id: string) => {
    setObraId(id);
    const obra = obras.find((o) => o.id === id);
    if (!obra) return;
    if (!nombre.trim()) setNombre(obra.nombre);
    if (!clienteId && !nuevoCliente && obra.cliente.trim()) {
      const igual = clientes.find((c) => normalizarNombre(c.nombre) === normalizarNombre(obra.cliente));
      if (igual?.id) setClienteId(igual.id);
      else {
        // No está: se deja listo el alta con el nombre que trae la obra, para
        // que no se capture otra vez a mano y salga escrito distinto.
        setNuevoCliente(true);
        setNc((prev) => (prev.nombre ? prev : { ...prev, nombre: obra.cliente }));
      }
    }
  };

  const compromiso = partidas.reduce((s, p) => s + (parseFloat(p.monto_acordado) || 0), 0);
  const precioNum = parseFloat(precioVenta) || 0;
  const margen = precioNum - compromiso;

  /** Guarda el cliente nuevo y lo deja escogido. Antes de guardar avisa si
   *  ya hay uno que se parece: capturar dos veces al mismo cliente con el
   *  nombre escrito distinto es el error que después nadie sabe deshacer. */
  const guardarCliente = async () => {
    setErrorCliente("");
    const nombre = nc.nombre.trim();
    if (!nombre) { setErrorCliente("Escribe el nombre del cliente."); return; }
    if (!activo?.id || !user) return;

    const iguales = await clientesParecidos(nombre, clientes, activo.id);
    if (iguales.length > 0 && !insistir) { setParecidos(iguales); return; }

    setGuardandoCliente(true);
    try {
      const id = await createCliente(user.uid, {
        nombre,
        email: nc.email.trim() || undefined,
        telefono: nc.telefono.trim() || undefined,
        negocio_id: activo.id,
      });
      const lista = await listClientes(activo.id);
      setClientes(lista);
      setClienteId(id);
      setNuevoCliente(false);
      setParecidos([]);
      setInsistir(false);
      setNc({ nombre: "", email: "", telefono: "" });
    } catch (e) {
      setErrorCliente(e instanceof Error ? e.message : "No se pudo guardar el cliente.");
    } finally {
      setGuardandoCliente(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");

    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) {
      setError("Selecciona un cliente");
      return;
    }

    // Validar partidas
    const partidasValidas = partidas.filter((p) => p.proveedor_id && parseFloat(p.monto_acordado) > 0);
    for (const p of partidas) {
      if (p.proveedor_id && !parseFloat(p.monto_acordado)) {
        setError("Todas las partidas deben tener monto");
        return;
      }
      if (!p.proveedor_id && parseFloat(p.monto_acordado) > 0) {
        setError("Selecciona proveedor para todas las partidas");
        return;
      }
    }

    setSubmitting(true);
    try {
      const nuevoId = await createProyecto(user.uid, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        cliente_id: cliente.id!,
        cliente_nombre: cliente.nombre,
        negocio_id: activo.id!,
        negocio_nombre: activo.nombre,
        precio_venta: precioNum,
        partidas: partidasValidas.map((p) => ({
          proveedor_id: p.proveedor_id,
          proveedor_nombre: p.proveedor_nombre,
          concepto: p.concepto.trim() || undefined,
          monto_acordado: parseFloat(p.monto_acordado),
        })),
        estado,
        fecha_inicio: new Date(fechaInicio),
      });
      /* La liga con la obra va DESPUÉS de crear: el proyecto tiene que
       * existir para poder ligarlo. Si la liga falla —alguien más la acaba de
       * usar— el proyecto ya está creado y no se pierde nada de lo que se
       * capturó: se dice qué pasó y se queda aquí para ligar a mano. */
      if (obraId) {
        try {
          await ligarObra(obraId, nuevoId);
        } catch (e) {
          setError(
            `El proyecto se creó, pero no se pudo ligar con la obra de quell101: ${
              e instanceof Error ? e.message : "error"
            }. Ábrelo y lígalo desde ahí.`,
          );
          setSubmitting(false);
          return;
        }
      }
      router.push("/proyectos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCatalog) return <div className="text-sm text-ink-muted">Cargando catálogo…</div>;

  return (
    <div className="max-w-2xl">
      <Link
        href="/proyectos"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a proyectos
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Crear proyecto</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        Se agregará a <strong>{activo.nombre}</strong>
      </p>

      {clientes.length === 0 && !nuevoCliente && (
        <div className="bg-sky-50 text-sky-900 text-xs px-3 py-2 rounded-xl mb-4">
          Este negocio no tiene clientes todavía. Escoge «+ Cliente nuevo…» en el
          desplegable y lo das de alta aquí mismo, sin perder lo que ya escribiste.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Las obras de quell101 que todavía no tienen proyecto. Va ARRIBA
          * del nombre a propósito: si la obra ya existe, escogerla llena el
          * resto, y ponerla abajo haría capturar dos veces lo mismo. Si la
          * empresa no usa quell101 —o no hay obras sueltas— el bloque no
          * aparece y la pantalla queda como estaba. */}
        {obras.length > 0 && (
          <div className="bg-cream rounded-2xl p-4">
            <label htmlFor="obra" className="text-xs font-medium text-ink-dim block mb-1.5">
              ¿Esta obra ya existe en quell101?
            </label>
            <select
              id="obra"
              value={obraId}
              onChange={(e) => escogerObra(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              <option value="">No, es una obra nueva</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                  {o.cliente ? ` — ${o.cliente}` : ""}
                  {o.ubicados ? ` (${o.ubicados} ítem${o.ubicados === 1 ? "" : "s"} ubicado${o.ubicados === 1 ? "" : "s"})` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-muted mt-2">
              {obraId
                ? "Al guardar, las dos apps van a tomar esto como la misma casa: el plano y la bitácora en quell101, el dinero aquí."
                : "Aquí salen las obras abiertas en quell101 que todavía no tienen proyecto en dash101. Escoge una y se llena sola."}
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Nombre <span className="text-mauve-900">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={100}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Sitio web Boutique Luna"
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Descripción</label>
          <textarea
            maxLength={300}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            {/* La etiqueta va amarrada al campo con `htmlFor`: así el lector de
              * pantalla dice de qué es, y al picar el texto se abre el
              * desplegable. */}
            <label htmlFor="cliente" className="text-xs font-medium text-ink-dim block mb-1.5">
              Cliente <span className="text-mauve-900">*</span>
            </label>
            <select
              id="cliente"
              required={!nuevoCliente}
              value={nuevoCliente ? "__nuevo__" : clienteId}
              onChange={(e) => {
                if (e.target.value === "__nuevo__") {
                  setNuevoCliente(true);
                  setClienteId("");
                } else {
                  setNuevoCliente(false);
                  setClienteId(e.target.value);
                }
              }}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              <option value="">— Selecciona —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
              <option value="__nuevo__">+ Cliente nuevo…</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoProyecto)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              {Object.entries(ESTADO_PROYECTO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

        {nuevoCliente && (
          <div className="bg-cream rounded-2xl p-4">
            <p className="text-xs font-medium text-ink-dim mb-2">Cliente nuevo</p>
            <input
              type="text"
              value={nc.nombre}
              onChange={(e) => { setNc({ ...nc, nombre: e.target.value }); setParecidos([]); setInsistir(false); }}
              placeholder="Nombre o razón social"
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
            <div className="grid grid-cols-2 gap-3 mt-2">
              <input
                type="email"
                value={nc.email}
                onChange={(e) => setNc({ ...nc, email: e.target.value })}
                placeholder="Correo (opcional)"
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              />
              <input
                type="tel"
                value={nc.telefono}
                onChange={(e) => setNc({ ...nc, telefono: e.target.value })}
                placeholder="Teléfono (opcional)"
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              />
            </div>

            {parecidos.length > 0 && (
              <div className="bg-white border border-black/10 rounded-xl p-3 mt-3">
                <p className="text-xs text-ink-dim mb-2">
                  Ya hay {parecidos.length === 1 ? "un cliente" : "clientes"} con un nombre parecido.
                  ¿No te refieres a {parecidos.length === 1 ? "éste" : "alguno de éstos"}?
                </p>
                <div className="space-y-1.5">
                  {parecidos.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClienteId(c.id!);
                        setNuevoCliente(false);
                        setParecidos([]);
                        setInsistir(false);
                        setNc({ nombre: "", email: "", telefono: "" });
                      }}
                      className="w-full text-left bg-cream hover:bg-black/5 rounded-lg px-3 py-2 text-sm text-ink-dim transition"
                    >
                      Usar <strong>{c.nombre}</strong>
                      {c.email ? <span className="text-ink-muted"> · {c.email}</span> : null}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { setInsistir(true); setParecidos([]); }}
                  className="text-xs text-ink-muted underline mt-2"
                >
                  No, es otro cliente
                </button>
              </div>
            )}

            {errorCliente && (
              <p className="text-xs text-mauve-900 mt-2">{errorCliente}</p>
            )}

            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={guardarCliente}
                disabled={guardandoCliente || !nc.nombre.trim()}
                className="bg-ink hover:bg-ink/90 text-cream rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-40"
              >
                {guardandoCliente ? "Guardando…" : "Guardar cliente"}
              </button>
              <button
                type="button"
                onClick={() => { setNuevoCliente(false); setParecidos([]); setInsistir(false); setErrorCliente(""); }}
                className="text-sm text-ink-muted px-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Fecha inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Precio de venta ({activo.moneda})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
        </div>

        {/* Partidas */}
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

          {partidas.length === 0 ? (
            <div className="bg-cream/60 rounded-xl p-4 text-center text-xs text-ink-muted">
              Sin partidas. Agrega proveedores con montos acordados para calcular margen.
            </div>
          ) : (
            <div className="space-y-2">
              {partidas.map((p, i) => (
                <div key={i} className="bg-white border border-black/10 rounded-xl p-3 flex gap-2 items-start">
                  <select
                    value={p.proveedor_id}
                    onChange={(e) => {
                      const prov = proveedores.find((x) => x.id === e.target.value);
                      updatePartida(i, {
                        proveedor_id: e.target.value,
                        proveedor_nombre: prov?.nombre ?? "",
                      });
                    }}
                    className="flex-1 min-w-0 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                  >
                    <option value="">— Proveedor —</option>
                    {proveedores.map((pr) => (
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

          {(partidas.length > 0 || precioNum > 0) && (
            <div className="mt-3 bg-cream rounded-xl p-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-ink-muted">Compromiso total</p>
                <p className="font-medium text-mauve-900">{formatMonto(compromiso, activo.moneda)}</p>
              </div>
              <div>
                <p className="text-ink-muted">Precio venta</p>
                <p className="font-medium text-ink-dim">{formatMonto(precioNum, activo.moneda)}</p>
              </div>
              <div>
                <p className="text-ink-muted">Margen proyectado</p>
                <p className={`font-medium ${margen >= 0 ? "text-mint-900" : "text-mauve-900"}`}>
                  {formatMonto(margen, activo.moneda)}
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/proyectos"
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || !nombre.trim() || !clienteId}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? "Creando…" : "Crear proyecto"}
          </button>
        </div>
      </form>
    </div>
  );
}
