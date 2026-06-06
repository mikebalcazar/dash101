import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type { Usuario } from "@/types/schema";

export async function ensureUserDoc(user: User): Promise<Usuario> {
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data() as Usuario;
  }

  const nuevo: Usuario = {
    email: user.email ?? "",
    nombre: user.displayName ?? user.email?.split("@")[0] ?? "Usuario",
    rol: "owner",
    negocios_acceso: [],
    creado_at: serverTimestamp(),
  };

  await setDoc(ref, nuevo);
  return nuevo;
}

export async function getUserDoc(uid: string): Promise<Usuario | null> {
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return null;
  return snap.data() as Usuario;
}
