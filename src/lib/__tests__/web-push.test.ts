// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiJson } from '../api-json';
import { applicationServerKey, disconnectDevicePush, logoutWithDevicePush, pushEnvironment, withDevicePushChange } from '../web-push';

vi.mock('../api-json', () => ({ apiJson: vi.fn() }));
const api = vi.mocked(apiJson);
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
const unsubscribe = vi.fn();
const getRegistration = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration } });
  unsubscribe.mockResolvedValue(true);
  getRegistration.mockResolvedValue({ pushManager: { getSubscription: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/device', unsubscribe }) } });
  api.mockResolvedValue({ ok: true, status: 204 });
});
afterEach(() => {
  if (originalServiceWorker) Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.unstubAllGlobals();
});

describe('device push helpers', () => {
  it('decodes URL-safe VAPID public key into a typed array', () => {
    expect(Array.from(applicationServerKey('BA-_'))).toEqual([4, 15, 191]);
  });
  it('removes server delivery on logout then unsubscribes browser', async () => {
    await disconnectDevicePush();
    expect(api).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({ method: 'DELETE' }));
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(api.mock.invocationCallOrder[0]).toBeLessThan(unsubscribe.mock.invocationCallOrder[0]);
  });
  it('does not pretend logout push cleanup succeeded when server request fails', async () => {
    api.mockResolvedValue({ ok: false, status: 502 });
    await expect(disconnectDevicePush()).rejects.toThrow('Chưa tắt được thông báo');
    expect(unsubscribe).not.toHaveBeenCalled();
  });
  it('does nothing on logout if browser has no subscription', async () => {
    getRegistration.mockResolvedValue(undefined);
    await disconnectDevicePush();
    expect(api).not.toHaveBeenCalled();
  });
  it('finishes expired-session logout with an honest push cleanup warning', async () => {
    api.mockResolvedValue({ ok: false, status: 401 });
    const logout = vi.fn().mockResolvedValue('done');
    const outcome = await logoutWithDevicePush(logout);
    expect(outcome.result).toBe('done');
    expect(outcome.warning).toContain('chưa xác minh');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });
  it('waits for in-flight enable before logout and blocks new enable attempts', async () => {
    let finish!: () => void;
    const save = withDevicePushChange(() => new Promise<void>(resolve => { finish = resolve; }));
    const logout = vi.fn().mockResolvedValue('done');
    const signingOut = logoutWithDevicePush(logout);
    await expect(withDevicePushChange(async () => undefined)).rejects.toThrow('Đang cập nhật');
    expect(getRegistration).not.toHaveBeenCalled();
    finish();
    await save;
    await signingOut;
    expect(getRegistration).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });
  it('does not disable logout privacy guard for server errors', async () => {
    api.mockResolvedValue({ ok: false, status: 502 });
    const logout = vi.fn();
    await expect(logoutWithDevicePush(logout)).rejects.toThrow('Chưa tắt');
    expect(logout).not.toHaveBeenCalled();
    await expect(withDevicePushChange(async () => true)).resolves.toBe(true);
  });
  it('recognizes iPhone install requirement independently of PushManager support', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const userAgent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(pushEnvironment().needsInstall).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(pushEnvironment().needsInstall).toBe(false);
    userAgent.mockRestore();
  });
});
