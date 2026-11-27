'use client';
import { useEffect, useRef, useState } from 'react';
import { collectOperationalNotifications, type NotificationCursor, type NotificationInput, type OperationalNotification } from '@/lib/operational-notifications';
import type { AppView } from '@/types/laundry';

type Props = { input: NotificationInput | null; onNavigate: (view: AppView) => void };
export default function OperationalNotifications(props: Props) {
  if (!props.input) return null;
  return <NotificationScope key={`${props.input.accountId}:${props.input.snapshot.building.id}`} {...props} input={props.input} />;
}
function NotificationScope({ input, onNavigate }: Props & { input: NotificationInput }) {
  const cursor = useRef<NotificationCursor | null>(null);
  const [notices, setNotices] = useState<OperationalNotification[]>([]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const next = collectOperationalNotifications(cursor.current, input);
      cursor.current = next.cursor;
      if (next.notices.length) setNotices(previous => [...previous, ...next.notices].slice(-20));
    });
    return () => { active = false; };
  }, [input]);
  if (!notices.length) return null;
  return <aside className="operational-notifications" aria-label="Thông báo vận hành">
    <div aria-live="polite" aria-relevant="additions"><ul>{notices.map(notice => <li key={notice.id}>
      <span>{notice.message}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => onNavigate(notice.view)}>Xem chi tiết</button>
      <button type="button" className="btn btn-ghost btn-sm" aria-label={`Đóng: ${notice.message}`}
        onClick={() => setNotices(previous => previous.filter(item => item.id !== notice.id))}>Đóng</button>
    </li>)}</ul></div>
  </aside>;
}
