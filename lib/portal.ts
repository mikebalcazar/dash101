/**
 * Acceso de clientes al portal de estados de cuenta (app aparte que lee
 * este mismo Firestore). El cliente entra con correo + PIN de 6 dígitos.
 *
 * El usuario de Firebase Auth se crea desde el navegador del socio usando una
 * instancia SECUNDARIA de Firebase: crear un usuario en la instancia principal
 * cerraría la sesión del socio y abriría la del cliente.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { setAccesoPortal } from "./clientes";
import { fuente } from "./fuente";
import type { Cliente } from "@/types/schema";
import { propagarClienteUid } from "./proyectos";
import * as escribir from "./api/escribir";
import { listar } from "./api/cliente";
import type { FilaMovimiento, FilaProyecto } from "./api/adaptar";

export const PORTAL_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://cuenta-taller101.netlify.app";

const SECUNDARIA = "portal-clientes";

function appSecundaria(): FirebaseApp {
  const existente = getApps().find((a) => a.name === SECUNDARIA);
  if (existente) return existente;
  return initializeApp(getApp().options, SECUNDARIA);
}

export function validarPin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "El PIN son exactamente 6 dígitos";
  if (/^(\d)\1{5}$/.test(pin)) return "PIN demasiado simple (todos iguales)";
  if ("0123456789".includes(pin) || "9876543210".includes(pin))
    return "PIN demasiado simple (secuencia)";
  return null;
}

/**
 * Envuelve cada escritura para que el error diga EN QUE paso truena.
 * Firestore solo manda "Missing or insufficient permissions" sin decir cual.
 */
async function paso<T>(etiqueta: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "auth/email-already-in-use") throw e;
    throw new Error(`[${etiqueta}] ${err.code ?? ""} ${err.message ?? String(e)}`.trim());
  }
}

/**
 * Crea el usuario del cliente y liga todo lo que tiene que poder leer.
 * Devuelve el uid.
 */
export async function activarAccesoPortal(
  cliente: Cliente,
  email: string,
  pin: string
): Promise<{ uid: string; proyectos: number; movimientos: number; reactivado: boolean }> {
  const clienteId = cliente.id!;
  const correo = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(correo)) throw new Error("Correo inválido");

  /* Con la API es una sola llamada: POST /clientes/:id/acceso crea (o
   * encuentra) al usuario en el D1, le pone el PIN y prende el acceso. No hay
   * nada que propagar: el portal lee por `clientes.usuario_id`. Reactivar es
   * el mismo POST, y siempre con PIN: la API no guarda el viejo en claro. */
  if (fuente() === 'api') {
    const err = validarPin(pin);
    if (err) throw new Error(err);
    const r = await escribir.darAccesoPortal(clienteId, correo, pin);
    const n = await contarLoVisible(clienteId, cliente.negocio_id);
    return { uid: r.usuario_id, ...n, reactivado: !!cliente.uid && cliente.uid === r.usuario_id };
  }

  // Ya tuvo acceso con este mismo correo → sólo se reactiva (el usuario de Auth sigue ahí)
  if (cliente.uid && cliente.portal_email === correo) {
    await paso("1/3 guardar acceso en el cliente", () =>
      setAccesoPortal(clienteId, { uid: cliente.uid!, portal_email: correo, portal_activo: true })
    );
    const n = await paso("2/3 marcar proyectos e ingresos del cliente", () =>
      propagarClienteUid(clienteId, cliente.uid!, cliente.negocio_id)
    );
    return { uid: cliente.uid, ...n, reactivado: true };
  }

  const err = validarPin(pin);
  if (err) throw new Error(err);

  const auth = getAuth(appSecundaria());
  let uid: string;
  try {
    const cred = await paso("0/3 crear usuario de Firebase Auth", () =>
      createUserWithEmailAndPassword(auth, correo, pin)
    );
    uid = cred.user.uid;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "auth/email-already-in-use") {
      throw new Error(
        "Ese correo ya tiene usuario. Usa «Enviar liga para cambiar PIN» o captura otro correo."
      );
    }
    throw e;
  } finally {
    await signOut(auth).catch(() => {});
  }

  await paso("1/3 guardar acceso en el cliente", () =>
    setAccesoPortal(clienteId, { uid, portal_email: correo, portal_activo: true })
  );
  const n = await paso("2/3 marcar proyectos e ingresos del cliente", () =>
    propagarClienteUid(clienteId, uid, cliente.negocio_id)
  );
  return { uid, ...n, reactivado: false };
}

/**
 * Quita la lectura: los docs dejan de traer su uid. El usuario de Auth y el
 * uid en el cliente se conservan para poder reactivar sin crear otro usuario.
 */
export async function desactivarAccesoPortal(cliente: Cliente): Promise<void> {
  // DELETE …/acceso apaga `accesos.activo` en el D1: la puerta de la org ya
  // no abre aunque el cliente entre con su PIN. Reactivar es volver a dar acceso.
  if (fuente() === 'api') return escribir.quitarAccesoPortal(cliente.id!);
  await setAccesoPortal(cliente.id!, {
    uid: cliente.uid ?? null,
    portal_email: cliente.portal_email ?? null,
    portal_activo: false,
  });
  await propagarClienteUid(cliente.id!, null, cliente.negocio_id);
}

/** Con la API el socio pone el PIN nuevo aquí mismo: es el mismo POST de dar
 *  acceso, con el correo que ya tenía. Firebase no lo permitía (mandaba una
 *  liga); la suite sí, porque el PIN lo guarda la API y no un proveedor. */
export async function cambiarPinPortal(cliente: Cliente, pin: string): Promise<void> {
  if (fuente() !== 'api') throw new Error("Con Firestore el PIN se cambia con la liga por correo.");
  const err = validarPin(pin);
  if (err) throw new Error(err);
  if (!cliente.portal_email) throw new Error("Este cliente no tiene acceso activo.");
  await escribir.darAccesoPortal(cliente.id!, cliente.portal_email, pin);
}

/** Cuántos proyectos e ingresos verá el cliente en su portal, para el aviso. */
async function contarLoVisible(clienteId: string, negocioId: string): Promise<{ proyectos: number; movimientos: number }> {
  const proyectos = await listar<FilaProyecto>("proyectos", { negocio_id: negocioId, cliente_id: clienteId });
  const ids = new Set(proyectos.map((p) => p.id));
  const movs = await listar<FilaMovimiento>("movimientos", { negocio_id: negocioId });
  return { proyectos: proyectos.length, movimientos: movs.filter((m) => m.tipo === "ingreso" && m.proyecto_id && ids.has(m.proyecto_id)).length };
}

/** Firebase manda un correo al cliente para poner un PIN nuevo. */
export async function enviarCambioPin(email: string): Promise<void> {
  if (fuente() === 'api') throw new Error("Con la API el PIN nuevo se pone aquí mismo, no por liga.");
  const auth = getAuth(appSecundaria());
  await sendPasswordResetEmail(auth, email.trim().toLowerCase(), { url: PORTAL_URL });
}
