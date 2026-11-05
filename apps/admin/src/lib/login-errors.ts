export function loginRetrySeconds(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 60;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60;
}

export function loginRetryMessage(seconds: number): string {
  return `تلاش‌های ورود بیش از حد مجاز است. پس از ${seconds} ثانیه دوباره تلاش کنید.`;
}
