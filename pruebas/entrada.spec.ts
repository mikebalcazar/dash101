/* Qué ofrece la pantalla de entrada de dash101, medido sobre el fuente.
 *
 * El 16-sep-2026 la entrada se homologó por encargo de Mike: Google o correo y
 * contraseña en todas las apps de la suite menos roster101. El código de 6
 * dígitos quedó como recuperación y el PIN se fue.
 *
 * Aquí no hay un paquete que medir sin construir Next, así que se mide el
 * fuente y el contrato de `auth-context`, y la construcción la hace el
 * corredor. Corre sin red: no toca la API. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sinComentarios = (t: string) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

const pagina = sinComentarios(readFileSync('app/login/page.tsx', 'utf8'));
const contexto = sinComentarios(readFileSync('lib/auth-context.tsx', 'utf8'));
const cliente = sinComentarios(readFileSync('lib/api/cliente.ts', 'utf8'));

describe('la pantalla de entrada, después de la homologación', () => {
  it('entra con correo y contraseña, y con el código sólo para recuperar', () => {
    expect(pagina).toMatch(/entrarConClave\(correo, clave\)/);
    expect(pagina).toMatch(/entrarConCodigo\(correo, codigo\)/);
    expect(pagina).toContain('Olvidé mi contraseña');
    expect(pagina).toContain('Entrar con Google');
    expect(pagina).toMatch(/type="password" name="password" autoComplete="current-password"/);
    expect(pagina).toMatch(/name="new-password" autoComplete="new-password"/);
  });

  it('ya no ofrece PIN ni código como forma de entrar', () => {
    expect(pagina).not.toMatch(/\bpin\b/i);
    expect(pagina).not.toContain('Mandarme un código');
    expect(pagina).not.toContain('Entrar con el código');
    expect(contexto).not.toContain('entrarConPin');
    expect(cliente).not.toContain('entrarConPin');
  });

  it('a quien entró con código y no tiene contraseña se le pide ponerla, sin mandarlo antes al panel', () => {
    /* `entrarConCodigo` no pone `user` si falta contraseña: en cuanto se pone,
     * el `useEffect` del login manda a /dashboard y la pantalla de poner
     * contraseña nunca aparecería. Es la trampa de esta pantalla en concreto. */
    expect(contexto).toMatch(/if \(yo && !yo\.tiene_clave\) return \{ necesitaClave: true \};/);
    expect(pagina).toMatch(/if \(r\.necesitaClave\) \{[^}]*setPaso\("nueva"\)/);
  });

  it('el error no revela quién tiene cuenta, y la contraseña floja se explica con palabras', () => {
    const invalida = pagina.match(/clave_invalida: "([^"]+)"/)?.[1];
    const sinPermiso = pagina.match(/sin_permiso: "([^"]+)"/)?.[1];
    expect(invalida).toBeTruthy();
    expect(invalida).toBe(sinPermiso);
    expect(pagina).toMatch(/clave_debil.*detalle\?\.porque/);
  });

  it('la contraseña se manda tal cual, sin recortarla', () => {
    // El correo sí se normaliza; la contraseña no: un espacio al borde es parte de ella.
    expect(contexto).toMatch(/api\.entrarConClave\(correo\.trim\(\)\.toLowerCase\(\), clave\)/);
  });
});
