export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatVolume(n: number): string {
  if (n >= 1e8) {
    return `${formatNumber(Math.round(n / 1e8))} 億`;
  }
  return formatNumber(n);
}

export function formatNet(n: number): string {
  const prefix = n > 0 ? "+" : "";
  return `${prefix}${formatNumber(n)}`;
}

export function formatPct(n: number): string {
  const prefix = n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(2)}%`;
}

export function formatPrice(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export function formatDateDisplay(date: string): string {
  return date.replace(/-/g, ".");
}

export function getWeekday(date: string): string {
  const days = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return days[new Date(date).getDay()];
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
