export function refDebug(msg: string, extra?: unknown): void {
  try {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[REF-DBG]', msg, extra ?? '');
    }
  } catch {}
}


