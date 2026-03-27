/** Returns today's date as YYYY-MM-DD string (local timezone). */
export function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Returns today's date as YYYY/MM/DD string (local timezone). */
export function getTodaySlash(): string {
  return getTodayString().replace(/-/g, "/");
}

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

/**
 * Compact volume display in 萬 units.
 * 18432 → "1.8萬", 142876 → "14.3萬", 1500000 → "150萬"
 */
export function formatVolumeShort(n: number): string {
  if (n >= 1e8) {
    const val = n / 1e8;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}億`;
  }
  if (n >= 1e4) {
    const val = n / 1e4;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}萬`;
  }
  return String(n);
}

/**
 * Compact money display in 億 units.
 * 12830000000 → "128.3億", 3410000000 → "34.1億"
 */
export function formatMoneyShort(n: number): string {
  if (Math.abs(n) >= 1e8) {
    const val = n / 1e8;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}億`;
  }
  if (Math.abs(n) >= 1e4) {
    const val = n / 1e4;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}萬`;
  }
  return String(n);
}
