/* El letrero de versión nueva (30-sep-2026).
 *
 * Mike: «Me gusta el letrero que aparece en quote cuando actualizas la
 * versión y estás usándolo, que te dice que guardes tu trabajo y refresques
 * la página. Haz eso para todas las webapps».
 *
 * Sin red: que la app monte el vigilante, que pida /huella.txt sin caché
 * cada 2 minutos y al volver la pestaña, que el letrero diga que guarde y
 * recargue, y que el flujo deje public/huella.txt antes de armar. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const v = readFileSync('components/version-nueva.tsx', 'utf8');
const layout = readFileSync('app/(app)/layout.tsx', 'utf8');
const flujo = readFileSync('.github/workflows/publicar.yml', 'utf8');

describe('el letrero de versión nueva', () => {
  it('la app monta el vigilante', () => {
    expect(layout).toMatch(/import \{ VersionNueva \} from "@\/components\/version-nueva"/);
    expect(layout).toMatch(/<VersionNueva \/>/);
  });
  it('pide /huella.txt sin caché, cada 2 minutos y al volver la pestaña, y compara con la de al abrir', () => {
    expect(v).toMatch(/fetch\("\/huella\.txt", \{ cache: "no-store" \}\)/);
    expect(v).toMatch(/if \(base === null\) base = h;\s*else if \(h !== base && vivo\) setHay\(true\);/);
    expect(v).toMatch(/setInterval\(revisar, 120000\)/);
    expect(v).toMatch(/visibilitychange/);
    expect(v).not.toMatch(/"focus"/);
  });
  it('dice que guarde y recargue, con botón', () => {
    expect(v).toMatch(/Termina lo que estés haciendo, guarda, y recarga\./);
    expect(v).toMatch(/onClick=\{\(\) => location\.reload\(\)\}/);
    expect(v).toMatch(/data-version-nueva=""/);
  });
  it('el flujo deja la huella antes de armar (staging y producción)', () => {
    expect((flujo.match(/> public\/huella\.txt/g) || []).length).toBe(2);
    expect((flujo.match(/> supply101\/publico\/huella\.txt/g) || []).length).toBe(2);
  });
});
