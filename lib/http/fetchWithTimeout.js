export async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  return fetch(url, {
    ...options,
    signal
  });
}
