export function formatMonto(n: number, moneda: string = "MXN", opts?: { short?: boolean }) {
  const currency = moneda === "USD" ? "USD" : "MXN";
  if (opts?.short && Math.abs(n) >= 1000) {
    const val = n / 1000;
    return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(val)}K ${currency}`;
  }
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatMontoExact(n: number, moneda: string = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "MXN",
  }).format(n);
}

export function formatDateShort(d: Date | number): string {
  return new Date(d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

export function formatDateLong(d: Date | number): string {
  return new Date(d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
