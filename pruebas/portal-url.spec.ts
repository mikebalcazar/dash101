import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* La liga que se le manda al cliente para abrir su portal dura años en su
 * correo. Desde el 25-sep-2026 es la del dominio propio, no la del proveedor. */
describe('la dirección del portal de clientes', () => {
  const fuente = readFileSync('lib/portal.ts', 'utf8');

  it('de fábrica es peek101.taller101.com', () => {
    expect(fuente).toMatch(/PORTAL_URL\s*=\s*\n?\s*process\.env\.NEXT_PUBLIC_PORTAL_URL\s*\?\?\s*"https:\/\/peek101\.taller101\.com"/);
    expect(fuente).not.toContain('peek101.mike-929.workers.dev');
  });

  it('y la liga a la obra en producción es quell101.taller101.com', () => {
    const obras = readFileSync('lib/obras.ts', 'utf8');
    expect(obras).toContain("'https://quell101.taller101.com'");
    expect(obras).not.toContain("'https://bitacora-obra.mike-929.workers.dev'");
  });
});
