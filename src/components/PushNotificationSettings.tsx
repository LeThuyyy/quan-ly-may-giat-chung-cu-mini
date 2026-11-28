'use client';

import { useEffect, useRef, useState } from 'react';
import { apiJson } from '@/lib/api-json';
import { applicationServerKey, pushEnvironment, registerPushWorker, withDevicePushChange } from '@/lib/web-push';

type State = 'loading' | 'install' | 'unsupported' | 'unconfigured' | 'blocked' | 'off' | 'on' | 'error';
interface PushConfig { enabled: boolean; publicKey: string | null }

/** Mounted with an account key; never request notification permission on page load. */
export default function PushNotificationSettings() {
  const [state, setState] = useState<State>('loading');
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const pending = useRef(false);
  const active = useRef(false);
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    active.current = true;
    const requests = controllers.current;
    return () => { active.current = false; for (const request of requests) request.abort(); requests.clear(); };
  }, []);

  useEffect(() => {
    const recheck = () => { setState('loading'); setRevision(value => value + 1); };
    window.addEventListener('laundry-push-changed', recheck);
    return () => window.removeEventListener('laundry-push-changed', recheck);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    async function load() {
      const environment = pushEnvironment();
      if (environment.needsInstall) { setState('install'); return; }
      if (!environment.supported) { setState('unsupported'); return; }
      if (Notification.permission === 'denied') { setState('blocked'); return; }
      try {
        const result = await apiJson<PushConfig>('/api/push/config', { signal: controller.signal, cache: 'no-store' });
        if (!current) return;
        if (!result.ok || !result.data) throw new Error(result.error ?? 'Không kiểm tra được cấu hình thông báo.');
        setConfig(result.data);
        if (!result.data.enabled || !result.data.publicKey) { setState('unconfigured'); return; }
        const worker = await registerPushWorker();
        if (!current) return;
        registration.current = worker;
        const subscription = await worker.pushManager.getSubscription();
        if (!current) return;
        if (!subscription) { setState('off'); return; }
        const status = await apiJson<{ subscribed: boolean }>('/api/push/subscriptions/status', {
          method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }), signal: controller.signal,
        });
        if (!current) return;
        if (!status.ok || !status.data) throw new Error(status.error ?? 'Chưa xác minh được thiết bị nhận thông báo.');
        setState(status.data.subscribed && Notification.permission === 'granted' ? 'on' : 'off');
      } catch (err) {
        if (current) { setState('error'); setError(err instanceof Error ? err.message : 'Không kiểm tra được thông báo.'); }
      }
    }
    void load();
    return () => { current = false; controller.abort(); };
  }, [revision]);

  async function toggle() {
    if (pending.current || !config?.publicKey || !registration.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    controllers.current.add(controller);
    const worker = registration.current;
    const publicKey = config.publicKey;
    try {
      await withDevicePushChange(async () => {
      if (state === 'on') {
        const subscription = await worker.pushManager.getSubscription();
        if (!active.current) return;
        if (subscription) {
          const result = await apiJson('/api/push/subscriptions', {
            method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }), signal: controller.signal,
          });
          if (!active.current) return;
          if (!result.ok) throw new Error(result.error ?? 'Chưa tắt được thông báo.');
          if (active.current) setState('off');
          await subscription.unsubscribe().catch(() => {
            if (active.current) setError('Đã tắt nhận trên máy chủ; trình duyệt chưa dọn xong đăng ký cục bộ.');
          });
        }
        if (active.current) setState('off');
      } else {
        // Must execute directly from the click gesture, before awaiting network/SW work (iOS).
        const permission = await Notification.requestPermission();
        if (!active.current) return;
        if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); return; }
        // ready waits for activation after the first service worker installation.
        const ready = worker.active ? worker : await navigator.serviceWorker.ready;
        if (!active.current) return;
        let subscription = await ready.pushManager.getSubscription();
        if (!active.current) return;
        const wantedKey = applicationServerKey(publicKey);
        const oldKey = subscription?.options.applicationServerKey;
        if (subscription && oldKey && String(new Uint8Array(oldKey)) !== String(wantedKey)) {
          const removed = await apiJson('/api/push/subscriptions', {
            method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }), signal: controller.signal,
          });
          if (!removed.ok) throw new Error(removed.error ?? 'Không cập nhật được khóa thông báo.');
          await subscription.unsubscribe();
          subscription = null;
        }
        if (!active.current) return;
        subscription ??= await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wantedKey });
        if (!active.current) return;
        const result = await apiJson('/api/push/subscriptions', {
          method: 'POST', body: JSON.stringify(subscription.toJSON()), signal: controller.signal,
        });
        if (!active.current) return;
        if (!result.ok) throw new Error(result.error ?? 'Chưa lưu được thiết bị nhận thông báo. Hãy bấm bật lại.');
        setState('on');
      }
      });
    } catch (err) {
      if (active.current) setError(err instanceof Error ? err.message : 'Không cập nhật được thông báo. Hãy thử lại.');
    } finally {
      controllers.current.delete(controller);
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  return (
    <section className="surface-card push-settings" aria-labelledby="push-settings-title" aria-busy={busy || state === 'loading'}>
      <h2 className="section-title-sm" id="push-settings-title">Thông báo đến lượt trên thiết bị</h2>
      <p className="muted-note">Nhận thông báo khi được giao lượt kiểm tra máy và khi đến giờ giặt xong dự kiến, kể cả khi không mở trang này. Nhắc lấy đồ không xác nhận máy đã dừng; hãy kiểm tra tại máy trước khi lấy.</p>
      <div role="status" aria-live="polite">
        {state === 'loading' && <p>Đang kiểm tra thông báo…</p>}
        {state === 'install' && <>
          <p><strong>iPhone: thêm web vào Màn hình chính trước</strong></p>
          <ol>
            <li>Cập nhật iPhone lên iOS 16.4 trở lên (iPhone 12 Pro Max hỗ trợ).</li>
            <li>Mở link bằng Safari → Chia sẻ → Thêm vào Màn hình chính.</li>
            <li>Mở từ biểu tượng vừa thêm, đăng nhập → Tài khoản → Bật thông báo đến lượt.</li>
          </ol>
        </>}
        {state === 'unsupported' && <p>Trình duyệt này chưa hỗ trợ thông báo nền hoặc kết nối chưa an toàn. Dùng Chrome PC qua HTTPS; trên iPhone mở bản đã thêm vào Màn hình chính.</p>}
        {state === 'unconfigured' && <p>Máy chủ chưa bật dịch vụ Web Push. Bạn vẫn nhận thông báo trong trang khi mở web.</p>}
        {state === 'blocked' && <p>Thông báo đang bị chặn. Cho phép lại trong cài đặt trang của Chrome hoặc Cài đặt → Thông báo của ứng dụng trên iPhone, rồi kiểm tra lại.</p>}
        {state === 'off' && <p>Chưa bật cho tài khoản này trên thiết bị này.</p>}
        {state === 'on' && <p>Đã bật cho tài khoản này trên thiết bị này.</p>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="action-row">
        {(state === 'off' || state === 'on') && <button type="button" className={`btn ${state === 'on' ? 'btn-outline' : 'btn-primary'}`} disabled={busy} onClick={() => void toggle()}>
          {busy ? 'Đang cập nhật…' : state === 'on' ? 'Tắt trên thiết bị này' : 'Bật thông báo đến lượt'}
        </button>}
        {(state === 'blocked' || state === 'error' || state === 'unconfigured') && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setError(null); setState('loading'); setRevision(value => value + 1); }}>Kiểm tra lại</button>}
      </div>
      <p className="muted-note">Mỗi thiết bị cần bật riêng. Đăng xuất sẽ tắt nhận cho tài khoản này trên thiết bị. Không bảo đảm giao ngay khi mất mạng, bật Tập trung hoặc máy chủ ngủ; hạn giữ 8 phút vẫn tính từ lúc giao máy, không từ lúc nhận thông báo. Lượt kiểm tra không có nghĩa là máy đã trống.</p>
    </section>
  );
}
