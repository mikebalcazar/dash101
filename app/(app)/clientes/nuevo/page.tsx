"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useEmpresa } from "@/lib/empresa-context";
import { clienteDelChoque, clientePorCorreo, clientesParecidos, createCliente } from "@/lib/clientes";
import type { Cliente } from "@/types/schema";
import { IconArrowLeft } from "@tabler/icons-react";

export default function NuevoClientePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { empresa } = useEmpresa();

  const [nombre, setNombre] = useState("");
  const [rfc, setRfc] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /* «¿No te refieres a X?». Mike, 20-sep: «si se quiere crear un cliente con
   * el nombre ya existente, preguntar si no te estás refiriendo a X cliente».
   * Antes de guardar se le pregunta a la API —la regla vive allá, una sola
   * para las tres apps—; si hay parecidos se enseñan y no se guarda todavía.
   * Insistir es un clic: a veces de veras son dos («Muebles Luna» del norte y
   * del sur), y el trabajo capturado no se pierde. */
  const [parecidos, setParecidos] = useState<Cliente[]>([]);
  const [insistir, setInsistir] = useState(false);
  /* El correo es de UN cliente (contrato 0.65.0). Mike, 4-oct: «avisar que ya
   * existe un cliente, presentar su info y preguntar si es ese cliente el que
   * estás buscando y ya usarlo o si quieres crear uno nuevo con otro email».
   * Aquí no hay «insistir»: con el mismo correo no se crea otro. */
  const [conEseCorreo, setConEseCorreo] = useState<Cliente | null>(null);

  if (!empresa) {
    return (
      <div className="max-w-lg">
        <Link href="/clientes" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-ink-muted">Cargando…</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");

    if (email.trim()) {
      const dueno = await clientePorCorreo(email, []).catch(() => null);
      if (dueno) { setConEseCorreo(dueno); return; }
    }
    if (!insistir) {
      const iguales = await clientesParecidos(nombre.trim(), []).catch(() => []);
      if (iguales.length > 0) { setParecidos(iguales); return; }
    }

    setSubmitting(true);
    try {
      await createCliente(user.uid, {
        nombre: nombre.trim(),
        rfc: rfc.trim() || undefined,
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        notas: notas.trim() || undefined,
      });
      router.push("/clientes");
    } catch (err) {
      const choque = clienteDelChoque(err);
      if (choque) { setConEseCorreo(choque); return; }
      setError(err instanceof Error ? err.message : "Error al crear cliente");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg">
      <Link
        href="/clientes"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a clientes
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Crear cliente</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        Se agregará a la empresa
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Nombre o razón social <span className="text-mauve-900">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={100}
            value={nombre}
            onChange={(e) => { setNombre(e.target.value); setParecidos([]); setInsistir(false); }}
            placeholder="Boutique Luna S.A. de C.V."
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">RFC</label>
          <input
            type="text"
            maxLength={13}
            value={rfc}
            onChange={(e) => setRfc(e.target.value.toUpperCase())}
            placeholder="opcional"
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 uppercase transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Email</label>
            <input
              type="email"
              id="correo-cliente"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setConEseCorreo(null); }}
              placeholder="contacto@ejemplo.com"
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="55 1234 5678"
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Notas</label>
          <textarea
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Contacto principal, condiciones especiales, etc."
            rows={3}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition"
          />
        </div>

        {conEseCorreo && (
          <div data-con-ese-correo className="bg-amber-50 text-amber-900 text-xs px-3 py-2.5 rounded-xl space-y-2">
            <p>
              Ya hay un cliente con el correo <strong>{conEseCorreo.email}</strong>. ¿Es éste el que buscas?
            </p>
            <p className="font-medium">
              {conEseCorreo.nombre}
              {conEseCorreo.telefono ? ` · ${conEseCorreo.telefono}` : ""}
              {conEseCorreo.rfc ? ` · ${conEseCorreo.rfc}` : ""}
              {conEseCorreo.portal_activo ? " · con portal" : ""}
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href={`/clientes/${conEseCorreo.id}`} className="underline font-medium">
                Sí, es ése: abrirlo
              </Link>
              <button
                type="button"
                onClick={() => { setConEseCorreo(null); document.getElementById("correo-cliente")?.focus(); }}
                className="underline font-medium"
              >
                No, es otro: lo creo con otro correo
              </button>
            </div>
          </div>
        )}

        {parecidos.length > 0 && !insistir && (
          <div className="bg-sky-50 text-sky-900 text-xs px-3 py-2.5 rounded-xl space-y-2">
            <p>
              Ya hay {parecidos.length === 1 ? "un cliente" : "clientes"} con un nombre muy
              parecido. ¿No te refieres a {parecidos.length === 1 ? "éste" : "alguno de éstos"}?
            </p>
            <ul className="space-y-1">
              {parecidos.map((c) => (
                <li key={c.id}>
                  <Link href={`/clientes/${c.id}`} className="font-medium underline">
                    {c.nombre}
                  </Link>
                  {c.email ? ` · ${c.email}` : ""}
                  {c.telefono ? ` · ${c.telefono}` : ""}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setInsistir(true)}
              className="underline font-medium"
            >
              No, es otro cliente: créalo de todos modos
            </button>
          </div>
        )}

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/clientes"
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || !nombre.trim()}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}
