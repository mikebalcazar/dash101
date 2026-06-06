import { IconLeaf } from "@tabler/icons-react";

export default function DashboardPage() {
  return (
    <div className="space-y-3">
      <section className="bg-cream rounded-3xl p-6 flex justify-between items-center gap-4">
        <div>
          <p className="text-xs text-ink-muted mb-2 font-medium">Capital disponible</p>
          <p className="text-4xl font-medium tracking-tight text-ink-dim leading-none">$0</p>
          <p className="text-xs text-ink-muted mt-2">
            Empieza registrando tu primer movimiento
          </p>
        </div>
        <div className="w-20 h-20 rounded-full bg-sky-50 flex items-center justify-center text-ink shrink-0">
          <IconLeaf size={32} />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-mint-50 rounded-2xl p-4">
          <p className="text-xs text-mint-label font-medium">Cobrado mes</p>
          <p className="text-xl font-medium text-mint-900 mt-1">$0</p>
          <p className="text-[11px] text-mint-label mt-1 opacity-75">Sin movimientos</p>
        </div>
        <div className="bg-mauve-50 rounded-2xl p-4">
          <p className="text-xs text-mauve-label font-medium">Pagado mes</p>
          <p className="text-xl font-medium text-mauve-900 mt-1">$0</p>
          <p className="text-[11px] text-mauve-label mt-1 opacity-75">Sin movimientos</p>
        </div>
        <div className="bg-sky-50 rounded-2xl p-4">
          <p className="text-xs text-sky-label font-medium">OPEX próx. 4 sem</p>
          <p className="text-xl font-medium text-sky-900 mt-1">$0</p>
          <p className="text-[11px] text-sky-label mt-1 opacity-75">Sin OPEX configurado</p>
        </div>
      </div>

      <section className="bg-white border border-black/5 rounded-2xl p-8 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Bienvenido a Conta Master</p>
        <p className="text-xs text-ink-muted max-w-md mx-auto">
          Estás logueado. El esqueleto está montado. Los siguientes pasos son: crear tus
          negocios y cuentas, agregar clientes y proveedores, y empezar a registrar
          movimientos.
        </p>
      </section>
    </div>
  );
}
