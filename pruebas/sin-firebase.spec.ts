/* Firebase no entra al paquete cuando la fuente es la API.
 *
 * Mike, 29-sep-2026: «reducir el consumo de recursos de las apps en MÓVIL».
 * En dash101 el gasto estaba en el arranque: el SDK de Firebase (~385 KB)
 * viajaba en todas las pantallas sin que nadie lo usara.
 *
 * POR QUÉ SE MIDE ASÍ
 *
 * No se puede medir el paquete sin construir, y las pruebas corren antes de
 * construir. Lo que sí se puede medir es la decisión: que `next.config.ts`
 * apunte los tres paquetes de Firebase al doble cuando la fuente es la API,
 * y NO lo haga cuando es Firestore; que el doble tenga TODOS los nombres que
 * el código importa (si mañana alguien importa uno nuevo, esto lo cacha antes
 * que la construcción); y que `Timestamp` —el único que sí se usa con la
 * API— se comporte como el de Firestore. El peso del paquete se mide aparte,
 * sobre lo construido: `scripts/peso-arranque.mjs`. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import * as doble from "@/lib/sin-firebase";

const RAIZ = path.resolve(__dirname, "..");
const conFuente = (fuente: string | undefined) => {
  if (fuente === undefined) delete process.env.NEXT_PUBLIC_FUENTE;
  else process.env.NEXT_PUBLIC_FUENTE = fuente;
};
const alias = (isServer = false) => {
  const cfg = { resolve: { alias: {} as Record<string, string> } };
  const webpack = nextConfig.webpack as (c: typeof cfg, o: { isServer: boolean }) => typeof cfg;
  return webpack(cfg, { isServer }).resolve.alias;
};
const PAQUETES = ["firebase/app", "firebase/auth", "firebase/firestore"];

describe("la decisión, al construir", () => {
  const antes = process.env.NEXT_PUBLIC_FUENTE;
  afterEach(() => conFuente(antes));

  it("con FUENTE=api los tres paquetes apuntan al doble, en el navegador y en el servidor", () => {
    conFuente("api");
    for (const isServer of [false, true]) {
      const a = alias(isServer);
      for (const p of PAQUETES) expect(a[p]).toBe(path.resolve(RAIZ, "lib/sin-firebase.ts"));
    }
  });
  it("sin la variable también: el olvido cae del lado de la suite (fuente.ts)", () => {
    conFuente(undefined);
    for (const p of PAQUETES) expect(alias()[p]).toBe(path.resolve(RAIZ, "lib/sin-firebase.ts"));
  });
  it("con FUENTE=firestore no se toca: el SDK de verdad", () => {
    conFuente("firestore");
    const a = alias();
    for (const p of PAQUETES) expect(a[p]).toBeUndefined();
  });
});

describe("el doble tiene todo lo que el código importa", () => {
  const archivos: string[] = [];
  const recorre = (d: string) => {
    for (const n of readdirSync(d)) {
      const f = path.join(d, n);
      if (n === "node_modules" || n.startsWith(".")) continue;
      if (statSync(f).isDirectory()) recorre(f);
      else if (/\.(ts|tsx)$/.test(n)) archivos.push(f);
    }
  };
  for (const d of ["app", "lib", "components"]) recorre(path.join(RAIZ, d));

  const nombres = new Set<string>();
  const tipos = new Set<string>();
  for (const f of archivos) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*["']firebase\/(app|auth|firestore)["']/g)) {
      const soloTipos = !!m[1];
      for (const parte of m[2].split(",")) {
        const t = parte.trim();
        if (!t) continue;
        const esTipo = soloTipos || t.startsWith("type ");
        const nombre = t.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        (esTipo ? tipos : nombres).add(nombre);
      }
    }
  }

  it("encontró los imports (si esto da cero, la búsqueda se rompió)", () => {
    expect(nombres.size).toBeGreaterThan(10);
    expect(archivos.length).toBeGreaterThan(20);
  });
  it("cada valor importado existe en el doble", () => {
    const faltan = [...nombres].filter((n) => !(n in doble));
    expect(faltan).toEqual([]);
  });
});

describe("Timestamp se comporta como el de Firestore", () => {
  const { Timestamp } = doble;
  it("fromDate y toDate se dan la vuelta al milisegundo", () => {
    const d = new Date("2026-09-29T15:04:05.678Z");
    const t = Timestamp.fromDate(d);
    expect(t.toDate().getTime()).toBe(d.getTime());
    expect(t.toMillis()).toBe(d.getTime());
    expect(t.seconds).toBe(Math.floor(d.getTime() / 1000));
    expect(t.nanoseconds).toBe(678_000_000);
  });
  it("fromMillis(0) es el inicio de 1970, como lo usa adaptar.ts", () => {
    const t = Timestamp.fromMillis(0);
    expect(t.seconds).toBe(0);
    expect(t.nanoseconds).toBe(0);
    expect(t.toDate().toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });
  it("now() está cerca de ahora, y se pueden comparar", () => {
    const a = Timestamp.now();
    expect(Math.abs(a.toMillis() - Date.now())).toBeLessThan(1000);
    const b = Timestamp.fromMillis(a.toMillis() + 1);
    expect(b.toMillis()).toBeGreaterThan(a.toMillis());
    expect(a.isEqual(Timestamp.fromMillis(a.toMillis()))).toBe(true);
  });
});

describe("lo demás dice por qué no", () => {
  it("collection() truena con un mensaje que nombra la construcción", () => {
    expect(() => doble.collection()).toThrow(/FUENTE=api/);
    expect(() => new doble.GoogleAuthProvider()).toThrow(/suite/);
  });
  it("getApps() contesta vacío, como cuando Firebase no está inicializado", () => {
    expect(doble.getApps()).toEqual([]);
  });
});
