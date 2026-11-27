export interface ApiResult<T> { ok: boolean; status: number; data?: T; error?: string }

/** Timeout covers the body too; an external AbortSignal must not disable the timeout. */
export async function apiJson<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const external = init?.signal;
  external?.addEventListener('abort', abort, { once: true });
  if (external?.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers,
    } });
    if (response.status === 204) return { ok: true, status: 204 };
    const text = await response.text();
    let payload: unknown = null;
    if (text) { try { payload = JSON.parse(text); } catch { /* Validate successful JSON below. */ } }
    if (!response.ok) {
      const error = (payload as { error?: unknown } | null)?.error;
      return { ok: false, status: response.status, error: typeof error === 'string' ? error : 'Không thể hoàn tất yêu cầu.' };
    }
    if (!text && init?.method && init.method.toUpperCase() !== 'GET') return { ok: true, status: response.status };
    if (payload === null) return { ok: false, status: 502, error: 'Máy chủ trả dữ liệu không hợp lệ. Hãy tải lại trạng thái.' };
    return { ok: true, status: response.status, data: payload as T };
  } catch {
    return { ok: false, status: controller.signal.aborted ? 504 : 0,
      error: controller.signal.aborted ? 'Yêu cầu quá thời gian hoặc đã bị hủy. Vui lòng tải lại trạng thái.' : 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.' };
  } finally {
    clearTimeout(timeout); external?.removeEventListener('abort', abort);
  }
}
