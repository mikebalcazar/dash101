/* El corte del 16-sep-2026: que la app no pueda volver a hablar con Firebase
 * por omisión.
 *
 * Mide el valor por omisión de la fuente, que es la clase de cosa que nadie
 * relee. Hasta el 18-nov-2026 también medía `netlify.toml`, `netlify-publica/`
 * y `portal/`, las reglas que mandaban las direcciones viejas de Netlify a los
 * Workers; ese día se borraron los sitios en Netlify (lo decidió Mike) y esos
 * archivos se fueron con ellos.
 *
 * Corre sin red y sin navegador a propósito: tiene que poder correr siempre,
 * porque su trabajo es avisar el día que alguien deshaga esto de buena fe. */
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

