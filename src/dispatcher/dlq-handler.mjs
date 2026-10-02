const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1000;

export function buildDLQRecord(payload, errorInfo, attempt = 1) {
  const error = errorInfo instanceof Error ? errorInfo : new Error(String(errorInfo));
  return {
    failed_at: new Date().toISOString(),
    payload,
    error: error.message,
    status: attempt >= DEFAULT_MAX_ATTEMPTS ? 'PARKED' : 'PENDING_RETRY',
    attempt,
  };
}

export async function handleDLQ(payload, errorInfo, options = {}) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const attempt = options.attempt ?? 1;
  const record = buildDLQRecord(payload, errorInfo, attempt);
  console.error('[DLQ-CAPSULE-STORED]', JSON.stringify(record));

  if (record.status === 'PARKED' || typeof options.retry !== 'function') return record;

  const delayMs = Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), 60_000);
  await new Promise(resolve => setTimeout(resolve, delayMs));
  try {
    await options.retry(payload, attempt + 1);
    return { ...record, status: 'RETRIED' };
  } catch (retryError) {
    if (attempt + 1 >= maxAttempts) return { ...record, status: 'PARKED', retry_error: String(retryError?.message ?? retryError) };
    return handleDLQ(payload, retryError, { ...options, attempt: attempt + 1 });
  }
}
