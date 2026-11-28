import { apiJson } from './api-json';

export function pushEnvironment() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return {
    needsInstall: ios && !installed,
    supported: window.isSecureContext && 'serviceWorker' in navigator
      && 'PushManager' in window && 'Notification' in window,
  };
}

export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export function registerPushWorker() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
}

let changing: Promise<unknown> | null = null;
let signingOut = false;

/** Preserve the click gesture: invoke task synchronously, but track it until server completion. */
export function withDevicePushChange<T>(task: () => Promise<T>): Promise<T> {
  if (signingOut || changing) return Promise.reject(new Error('Đang cập nhật thông báo hoặc đăng xuất. Vui lòng chờ.'));
  const result = task();
  changing = result;
  return result.finally(() => { if (changing === result) changing = null; });
}

/** Block new enables, drain an existing enable, then disconnect before closing auth. */
export async function logoutWithDevicePush<T>(logout: () => Promise<T>) {
  if (signingOut) throw new Error('Đang đăng xuất. Vui lòng chờ.');
  signingOut = true;
  try {
    await changing?.catch(() => undefined);
    const warning = await disconnectDevicePush();
    return { result: await logout(), warning };
  } finally { signingOut = false; }
}

/** Remove server delivery before ending the authenticated session. Never register a worker here. */
export async function disconnectDevicePush(): Promise<string | undefined> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  const response = await apiJson('/api/push/subscriptions', {
    method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok && response.status !== 401) throw new Error('Chưa tắt được thông báo trên thiết bị. Vui lòng thử đăng xuất lại khi có mạng.');
  const removed = await subscription.unsubscribe().catch(() => false);
  window.dispatchEvent(new Event('laundry-push-changed'));
  if (response.status === 401) {
    return removed
      ? 'Phiên đã hết hạn. Đã hủy nhận trên trình duyệt; chưa xác minh được việc xóa đăng ký máy chủ.'
      : 'Phiên đã hết hạn; chưa tắt được thông báo. Hãy chặn quyền thông báo trên thiết bị dùng chung.';
  }
  // Server delivery is already disabled even if browser cleanup fails.
}
