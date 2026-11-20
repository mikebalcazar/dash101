"use client";

/* La dirección vieja de «Facturas» (hasta el 19-nov-2026). Quien la tenga
 * guardada llega a la nueva. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CfdiViejaPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/fiscal/facturas"); }, [router]);
  return <div className="text-sm text-ink-muted">Cargando…</div>;
}
