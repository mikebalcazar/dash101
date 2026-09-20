"use client";

/* Soltar un archivo: arrastrarlo, pegarlo o escogerlo, y verlo antes de subir.
 *
 * Mike, 20-sep, con la pantalla de facturar enfrente: «quiero poder arrastrar
 * los archivos para subirlos. Y que me muestre un preview del archivo abajo».
 *
 * Tres maneras de dar el archivo, y las tres importan:
 *
 *   · ARRASTRAR, que es lo que se hace en una computadora con el XML del
 *     contador abierto al lado;
 *   · PEGAR (Ctrl+V), que es lo que se hace cuando la factura llegó por
 *     correo y está en el portapapeles. Es gratis de agregar y en quote101
 *     ya se pidió, así que aquí se pone de una vez;
 *   · ESCOGER, picándole. En el celular ése es el camino, y de paso abre la
 *     cámara cuando el tipo de archivo lo admite: por eso NO se esconde el
 *     campo de siempre, se envuelve.
 *
 * LA VISTA PREVIA no es adorno. El error caro de esta pantalla es colgar el
 * archivo equivocado —el XML del mes pasado, el PDF de otra factura—, y eso
 * no se descubre hasta que alguien lo abre semanas después. Ver la primera
 * página del PDF o las primeras líneas del XML antes de guardar lo caza en
 * el momento.
 *
 * El `URL.createObjectURL` se revoca al cambiar de archivo y al desmontar: si
 * no, cada archivo que se mira deja su copia en memoria hasta recargar.
 */

import { useEffect, useRef, useState } from "react";
import { IconUpload, IconX, IconFile } from "@tabler/icons-react";

/** ¿El archivo es de los que se piden? Se revisa por extensión Y por tipo:
 *  un XML arrastrado desde el explorador de Windows llega muchas veces con
 *  el tipo vacío, y rechazarlo por eso sería rechazar el caso normal. */
export function aceptado(f: { name: string; type?: string }, acepta: string): boolean {
  const lista = acepta.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!lista.length) return true;
  const nombre = f.name.toLowerCase();
  const tipo = (f.type || "").toLowerCase();
  return lista.some((a) =>
    a.startsWith(".")
      ? nombre.endsWith(a)
      : a.endsWith("/*")
        ? tipo.startsWith(a.slice(0, -1))
        : tipo === a,
  );
}

export const pesa = (bytes: number) =>
  bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function SoltarArchivo({
  id, etiqueta, acepta, archivo, alEscoger, ayuda,
}: {
  id: string;
  etiqueta: string;
  /** Igual que el `accept` de siempre: «.xml,.pdf,application/pdf». */
  acepta: string;
  archivo: File | null;
  alEscoger: (f: File | null) => void;
  ayuda?: string;
}) {
  const [encima, setEncima] = useState(false);
  const [aviso, setAviso] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  /* La vista previa. Se arma cuando cambia el archivo y se deshace sola. */
  useEffect(() => {
    setTexto(null);
    if (!archivo) { setUrl(null); return; }
    const esTexto = /\.(xml|txt|csv)$/i.test(archivo.name) || /xml|text\//i.test(archivo.type);
    if (esTexto) {
      /* Sólo el principio: un XML de nómina son miles de líneas y pintarlas
       * todas tarda más que subirlo. Con las primeras se ve si es la
       * factura correcta, que es para lo que sirve mirar. */
      archivo.slice(0, 4000).text()
        .then((t) => setTexto(t.split("\n").slice(0, 40).join("\n")))
        .catch(() => setTexto(null));
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(archivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);

  const tomar = (f: File | null | undefined) => {
    setAviso("");
    if (!f) return;
    if (!aceptado(f, acepta)) {
      /* Se dice qué se esperaba en vez de tragárselo: un archivo que no
       * cuadra y se acepta en silencio se descubre al abrirlo, meses
       * después. */
      setAviso(`«${f.name}» no es de los que se piden aquí (${acepta.replace(/application\/|text\//g, "")}).`);
      return;
    }
    alEscoger(f);
  };

  const esImagen = Boolean(archivo && /^image\//.test(archivo.type));
  const esPdf = Boolean(archivo && (/\.pdf$/i.test(archivo.name) || archivo.type === "application/pdf"));

  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-ink-dim block mb-1.5">{etiqueta}</label>

      {/* El área. Es un `label` del campo de siempre, así que picarle abre el
          selector —y en el celular, la cámara— sin JavaScript de por medio. */}
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); tomar(e.dataTransfer.files?.[0]); }}
        onPaste={(e) => {
          const f = Array.from(e.clipboardData?.files ?? [])[0];
          if (f) { e.preventDefault(); tomar(f); }
        }}
        tabIndex={0}
        className={`flex items-center gap-2 border border-dashed rounded-xl px-3 py-3 text-sm cursor-pointer transition ${
          encima ? "border-ink bg-cream/60 text-ink-dim" : "border-black/15 text-ink-muted hover:bg-cream/30"
        }`}
      >
        <IconUpload size={18} />
        <span className="flex-1 min-w-0 truncate">
          {archivo ? `${archivo.name} · ${pesa(archivo.size)}` : "Arrástralo aquí, pégalo, o pícale para escogerlo"}
        </span>
        {archivo && (
          <button
            type="button"
            aria-label="Quitar el archivo"
            onClick={(e) => { e.preventDefault(); alEscoger(null); setAviso(""); if (entrada.current) entrada.current.value = ""; }}
            className="text-ink-muted hover:text-mauve-900"
          >
            <IconX size={15} />
          </button>
        )}
        <input
          ref={entrada}
          id={id}
          type="file"
          accept={acepta}
          className="hidden"
          onChange={(e) => tomar(e.target.files?.[0])}
        />
      </label>

      {aviso && <p className="text-[11px] text-mauve-900 mt-1">{aviso}</p>}
      {ayuda && !archivo && <p className="text-[11px] text-ink-muted mt-1">{ayuda}</p>}

      {/* Lo que se va a subir, a la vista. */}
      {archivo && (
        <div className="mt-2 border border-black/5 rounded-xl overflow-hidden bg-white">
          {esImagen && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`Vista previa de ${archivo.name}`} className="w-full max-h-64 object-contain bg-cream/40" />
          ) : esPdf && url ? (
            <object data={url} type="application/pdf" className="w-full h-64" aria-label={`Vista previa de ${archivo.name}`}>
              {/* Algunos navegadores de celular no pintan PDF dentro de la
                  página. En vez de dejar un hueco gris, se ofrece abrirlo. */}
              <p className="text-xs text-ink-muted p-3">
                Este navegador no enseña el PDF aquí.{" "}
                <a href={url} target="_blank" rel="noreferrer" className="text-marca hover:underline">Ábrelo en otra pestaña</a>.
              </p>
            </object>
          ) : texto !== null ? (
            <pre className="text-[10px] leading-relaxed text-ink-dim p-3 max-h-64 overflow-auto whitespace-pre-wrap break-all">
              {texto}
            </pre>
          ) : (
            <p className="text-xs text-ink-muted p-3 inline-flex items-center gap-1.5">
              <IconFile size={14} /> {archivo.name} · {pesa(archivo.size)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
