/* El corte del 16-sep-2026: que la dirección vieja no pueda volver a servir la
 * app contra Firebase.
 *
 * Esto no mide la app: mide las dos piezas que sostienen el corte, y las mide
 * porque las dos se deshacen sin que nadie lo note. Una es un archivo de
 * configuración que alguien puede «arreglar» volviendo a poner la
 * construcción. La otra es un valor por omisión, que es la clase de cosa que
 * nadie relee.
 *
 * Corre sin red y sin navegador a propósito: tiene que poder correr siempre,
 * porque su trabajo es avisar el día que alguien deshaga esto de buena fe. */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fuente } from '@/lib/fuente';

/* `vitest.config.ts` pone NEXT_PUBLIC_FUENTE=api para todas las pruebas, así
 * que aquí hay que quitarla a mano: si no, la primera comprobación —la del
 * valor por omisión, que es la que importa— pasaría por la razón equivocada. */
function con<T>(valor: string | undefined, f: () => T): T {
  const antes = process.env.NEXT_PUBLIC_FUENTE;
  if (valor === undefined) delete process.env.NEXT_PUBLIC_FUENTE;
  else process.env.NEXT_PUBLIC_FUENTE = valor;
  try {
    return f();
  } finally {
    if (antes === undefined) delete process.env.NEXT_PUBLIC_FUENTE;
    else process.env.NEXT_PUBLIC_FUENTE = antes;
  }
}

describe('el valor por omisión de la fuente', () => {
  it('sin variable es la suite, no Firestore', () => {
    expect(con(undefined, fuente)).toBe('api');
  });

  it('para irse a Firestore hay que escribirlo con todas sus letras', () => {
    expect(con('firestore', fuente)).toBe('firestore');
  });

  it('`api` sigue valiendo lo que decía', () => {
    expect(con('api', fuente)).toBe('api');
  });

  it('una variable mal escrita cae del lado de la suite', () => {
    // Un `FUENTE=apii` o un `FUENTE=` vacío no debe mandar a nadie a Firebase.
    expect(con('apii', fuente)).toBe('api');
    expect(con('', fuente)).toBe('api');
    expect(con('Firestore', fuente)).toBe('api');
  });
});

describe('netlify.toml, después del corte', () => {
  const toml = readFileSync('netlify.toml', 'utf8');

  /* Lo que se afirma que NO está se afirma sobre las directivas, no sobre el
   * texto: este archivo es casi todo comentario, y el comentario nombra justo
   * lo que se quitó para explicar por qué se quitó. Sin esto la prueba se
   * cacha a sí misma —pasó en la primera corrida— y eso hace perder el rato
   * buscando un problema que no existe. Es la misma regla que en
   * `scripts/medir.mjs` de quote101: se mide lo que corre, no lo que cuenta. */
  const directivas = toml
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');

  it('ya no construye Next', () => {
    // Las dos piezas que hacían que Netlify sirviera la app: el comando que
    // construye y el complemento que la publica como función.
    expect(directivas).not.toMatch(/command\s*=\s*"npm run build"/);
    expect(directivas).not.toContain('@netlify/plugin-nextjs');
  });

  it('publica la carpeta mínima, no `.next`', () => {
    expect(toml).toMatch(/publish\s*=\s*"netlify-publica"/);
    expect(directivas).not.toMatch(/publish\s*=\s*"\.next"/);
  });

  it('no queda el proxy a la API de producción', () => {
    // Mientras estuvo, esta dirección era una entrada de cuerpo entero a la
    // suite de producción, con `X-App: dash101` puesto por Netlify.
    expect(directivas).not.toMatch(/from\s*=\s*"\/s101\/\*"/);
    expect(directivas).not.toMatch(/X-App\s*=/);
  });

  it('manda todo al Worker con 302 y `force`', () => {
    expect(toml).toMatch(/from\s*=\s*"\/\*"/);
    expect(toml).toContain('https://dash101.mike-929.workers.dev/:splat');
    expect(toml).toMatch(/status\s*=\s*302/);
    expect(toml).toMatch(/force\s*=\s*true/);
  });
});

describe('la carpeta que Netlify publica', () => {
  it('manda todo al Worker, y es la regla que gana', () => {
    const red = readFileSync('netlify-publica/_redirects', 'utf8');
    // El `!` es el `force`. Sin él Netlify sirve `index.html` cuando la
    // dirección coincide, y la regla no se aplica nunca.
    expect(red).toMatch(/^\/\*\s+https:\/\/dash101\.mike-929\.workers\.dev\/:splat\s+302!$/m);
  });

  it('no trae una sola llave ni una dirección de Firebase', () => {
    for (const archivo of readdirSync('netlify-publica')) {
      const texto = readFileSync(`netlify-publica/${archivo}`, 'utf8');
      expect(texto, archivo).not.toMatch(/AIza[0-9A-Za-z_-]{10}/);
      expect(texto, archivo).not.toContain('firestore.googleapis.com');
      expect(texto, archivo).not.toContain('firebasestorage');
      expect(texto, archivo).not.toContain('firebaseapp.com');
    }
  });

  it('son dos archivos y nada más', () => {
    // Lo que caiga aquí queda publicado en internet sin puerta. Si mañana
    // alguien mete algo, esta prueba lo dice antes de que se publique.
    expect(readdirSync('netlify-publica').sort()).toEqual(['_redirects', 'index.html']);
  });

  it('la página de red no ejecuta nada', () => {
    const html = readFileSync('netlify-publica/index.html', 'utf8');
    expect(html).not.toMatch(/<script/i);
  });
});
