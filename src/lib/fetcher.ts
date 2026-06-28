/**
 * 共用 SWR fetcher。
 *
 * 與舊有 inline fetcher 的成功路徑等價（回傳 r.json()），
 * 但在 !r.ok 時 throw 帶 status 的 Error，避免 API 回 503/HTML 時
 * r.json() 解析失敗或把 {error} 當成正常資料。
 *
 * SWR 會把 throw 的 Error 放進 useSWR 回傳的 `error`，
 * 成功時的 `data` 行為與先前完全相同。
 */
export class FetchError extends Error {
  status: number;
  constructor(status: number, statusText: string) {
    super(`Request failed with status ${status}${statusText ? ` (${statusText})` : ""}`);
    this.name = "FetchError";
    this.status = status;
  }
}

// Returns `Promise<any>` (not generic) to stay behaviorally equivalent to the
// old inline fetchers, which implicitly returned `Promise<any>`. Call sites that
// supply a type via `useSWR<T>(...)` still get that `T` for `data`; untyped call
// sites keep their previous `any` data shape, so this refactor changes nothing
// at the type level — a generic param here would make SWR infer `{}` instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetcher(url: string): Promise<any> {
  const r = await fetch(url);
  if (!r.ok) {
    throw new FetchError(r.status, r.statusText);
  }
  return r.json();
}
