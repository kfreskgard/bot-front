const kr = new Intl.NumberFormat('sv-SE', {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});
const price = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const hm = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const hms = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const formatKr = (n: number): string => `${kr.format(n)} kr`;
export const formatPrice = (n: number): string => price.format(n);
export const formatPercent = (n: number): string => `${percent.format(n)} %`;
export const formatTime = (iso: string, seconds = false): string =>
  (seconds ? hms : hm).format(new Date(iso));

const OLD_MS = 120_000;
export const isPriceOld = (lastPriceTime: string, now: Date): boolean =>
  now.getTime() - new Date(lastPriceTime).getTime() > OLD_MS;
