import {
  createOpaqueSession,
  deleteOpaqueSession,
  getOpaqueSession,
  updateOpaqueSession,
} from './session-store';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function getJavaLoopbackOrigin(): string {
  const raw = (process.env.JAVA_API_ORIGIN ?? 'http://127.0.0.1:8080').trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('JAVA_API_ORIGIN không hợp lệ.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('JAVA_API_ORIGIN chỉ hỗ trợ HTTP/HTTPS.');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('JAVA_API_ORIGIN bắt buộc phải là địa chỉ loopback (127.0.0.1 / localhost / ::1).');
  }
  return parsed.origin;
}

export interface BridgeResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  clearSessionCookie?: boolean;
}

export interface AccountView {
  id: string;
  username: string;
  displayName: string;
}

interface CsrfTokenResponse {
  headerName: string;
  token: string;
}

function extractSessionCookie(headers: Headers): string | null {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === 'function'
    ? getSetCookie.call(headers)
    : (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);

  for (const raw of setCookies) {
    const firstPart = raw.split(';', 1)[0]?.trim();
    if (firstPart && firstPart.startsWith('JSESSIONID=')) {
      const value = firstPart.slice('JSESSIONID='.length);
      if (value.length > 0) {
        return firstPart;
      }
    }
  }
  return null;
}

function fallbackErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Dữ liệu gửi lên không hợp lệ.';
    case 401:
      return 'Phiên đăng nhập đã hết hạn hoặc thông tin đăng nhập không đúng.';
    case 403:
      return 'Bạn không có quyền thực hiện thao tác này hoặc yêu cầu bị từ chối.';
    case 404:
      return 'Không tìm thấy dữ liệu được yêu cầu.';
    case 409:
      return 'Dữ liệu đã tồn tại hoặc xung đột trạng thái.';
    case 410:
      return 'Liên kết lời mời đã hết hạn.';
    default:
      return status >= 500
        ? 'Máy chủ xử lý gặp sự cố, vui lòng thử lại.'
        : 'Không thể hoàn tất yêu cầu.';
  }
}

async function readSanitizedError(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = (await res.json()) as { message?: unknown };
      if (
        typeof body?.message === 'string' &&
        body.message.trim().length > 0 &&
        body.message.length <= 180 &&
        !body.message.includes('<') &&
        !body.message.includes('\n') &&
        !body.message.toLowerCase().includes('exception')
      ) {
        return body.message.trim();
      }
    } catch {
      // Ignore parse errors and use fixed status message
    }
  }
  return fallbackErrorMessage(res.status);
}

async function fetchJava(path: string, init: RequestInit): Promise<Response> {
  const origin = getJavaLoopbackOrigin();
  return fetch(`${origin}${path}`, {
    ...init,
    redirect: 'manual',
    cache: 'no-store',
  });
}

async function fetchCsrf(existingCookie?: string): Promise<{
  cookie: string;
  headerName: string;
  token: string;
} | null> {
  const headers: Record<string, string> = {};
  if (existingCookie) {
    headers.Cookie = existingCookie;
  }
  const res = await fetchJava('/api/csrf', { method: 'GET', headers });
  if (!res.ok) return null;

  const cookie = extractSessionCookie(res.headers) ?? existingCookie;
  if (!cookie) return null;

  const data = (await res.json()) as Partial<CsrfTokenResponse>;
  if (typeof data.headerName !== 'string' || typeof data.token !== 'string') {
    return null;
  }
  return { cookie, headerName: data.headerName, token: data.token };
}

export async function registerJavaAccount(payload: {
  username: string;
  displayName: string;
  password: string;
}): Promise<BridgeResult<AccountView>> {
  try {
    const csrf = await fetchCsrf();
    if (!csrf) {
      return { ok: false, status: 502, error: 'Không khởi tạo được phiên bảo mật với máy chủ Java.' };
    }
    const res = await fetchJava('/api/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: csrf.cookie,
        [csrf.headerName]: csrf.token,
      },
      body: JSON.stringify(payload),
    });

    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: 502, error: 'Máy chủ Java trả về chuyển hướng không hợp lệ.' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: await readSanitizedError(res) };
    }
    const data = (await res.json()) as AccountView;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 502, error: 'Không kết nối được tới máy chủ Java.' };
  }
}

export async function loginJavaAccount(payload: {
  username: string;
  password: string;
}): Promise<BridgeResult<{ sessionId: string; account: AccountView }>> {
  try {
    const csrf = await fetchCsrf();
    if (!csrf) {
      return { ok: false, status: 502, error: 'Không khởi tạo được phiên bảo mật với máy chủ Java.' };
    }

    const res = await fetchJava('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: csrf.cookie,
        [csrf.headerName]: csrf.token,
      },
      body: JSON.stringify(payload),
    });

    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: 502, error: 'Máy chủ Java trả về chuyển hướng không hợp lệ.' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: await readSanitizedError(res) };
    }

    const rotatedCookie = extractSessionCookie(res.headers) ?? csrf.cookie;
    const account = (await res.json()) as AccountView;

    // Fetch post-login CSRF token bound to the authenticated session.
    const postLoginCsrf = await fetchCsrf(rotatedCookie);
    const sessionId = createOpaqueSession({
      javaCookie: postLoginCsrf?.cookie ?? rotatedCookie,
      csrfHeaderName: postLoginCsrf?.headerName,
      csrfToken: postLoginCsrf?.token,
    });

    return { ok: true, status: 200, data: { sessionId, account } };
  } catch {
    return { ok: false, status: 502, error: 'Không kết nối được tới máy chủ Java.' };
  }
}

export async function logoutJavaAccount(sessionId: string | undefined): Promise<BridgeResult<void>> {
  const session = getOpaqueSession(sessionId);
  if (!session || !sessionId) {
    return { ok: true, status: 204, clearSessionCookie: true };
  }

  try {
    let csrfHeaderName = session.csrfHeaderName;
    let csrfToken = session.csrfToken;
    let javaCookie = session.javaCookie;

    if (!csrfHeaderName || !csrfToken) {
      const fresh = await fetchCsrf(javaCookie);
      if (fresh) {
        javaCookie = fresh.cookie;
        csrfHeaderName = fresh.headerName;
        csrfToken = fresh.token;
      }
    }

    if (csrfHeaderName && csrfToken) {
      await fetchJava('/api/auth/logout', {
        method: 'POST',
        headers: {
          Cookie: javaCookie,
          [csrfHeaderName]: csrfToken,
        },
      });
    }
  } catch {
    // Even if Java is unreachable, clear the Next.js opaque session.
  } finally {
    deleteOpaqueSession(sessionId);
  }

  return { ok: true, status: 204, clearSessionCookie: true };
}

export async function callJavaWithSession<T = unknown>(
  sessionId: string | undefined,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<BridgeResult<T>> {
  const session = getOpaqueSession(sessionId);
  if (!session || !sessionId) {
    return {
      ok: false,
      status: 401,
      error: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.',
      clearSessionCookie: true,
    };
  }

  try {
    let javaCookie = session.javaCookie;
    let csrfHeaderName = session.csrfHeaderName;
    let csrfToken = session.csrfToken;

    if (method !== 'GET' && (!csrfHeaderName || !csrfToken)) {
      const fresh = await fetchCsrf(javaCookie);
      if (!fresh) {
        return { ok: false, status: 502, error: 'Không lấy được CSRF token từ máy chủ Java.' };
      }
      javaCookie = fresh.cookie;
      csrfHeaderName = fresh.headerName;
      csrfToken = fresh.token;
      updateOpaqueSession(sessionId, { javaCookie, csrfHeaderName, csrfToken });
    }

    const headers: Record<string, string> = {
      Cookie: javaCookie,
    };
    if (method !== 'GET' && csrfHeaderName && csrfToken) {
      headers[csrfHeaderName] = csrfToken;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetchJava(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: 502, error: 'Máy chủ Java trả về chuyển hướng không hợp lệ.' };
    }

    const nextCookie = extractSessionCookie(res.headers);
    if (nextCookie && nextCookie !== javaCookie) {
      updateOpaqueSession(sessionId, { javaCookie: nextCookie });
    }

    if (res.status === 401) {
      deleteOpaqueSession(sessionId);
      return {
        ok: false,
        status: 401,
        error: 'Phiên đăng nhập đã hết hạn.',
        clearSessionCookie: true,
      };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: await readSanitizedError(res) };
    }

    if (res.status === 204) {
      return { ok: true, status: 204 };
    }

    const text = await res.text();
    if (!text) {
      return { ok: true, status: res.status };
    }
    return { ok: true, status: res.status, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 502, error: 'Không kết nối được tới máy chủ Java.' };
  }
}
