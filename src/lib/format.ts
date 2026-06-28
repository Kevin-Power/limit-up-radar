/**
 * 台股漲跌色票（單一來源）。
 * 語意：漲=紅、跌=綠、平=灰。**僅用於「價格漲跌／報酬」語意**。
 *
 * 注意：勝率／品質分數／風險等「綠=好、紅=差」的反向語意，
 * 不可使用本函式，請各自維持原有判斷。
 *
 * @param value 漲跌幅／報酬數值
 * @returns Tailwind class："text-red"（>0）｜"text-green"（<0）｜"text-txt-3"（=0）
 */
export function signColor(value: number): string {
  if (value > 0) return "text-red";
  if (value < 0) return "text-green";
  return "text-txt-3";
}
