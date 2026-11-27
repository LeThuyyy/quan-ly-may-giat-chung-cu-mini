import type { AppView } from '@/types/laundry';

export const VIEW_META: Record<AppView, { label: string; title: string; group: 'resident' | 'admin' | 'account' }> = {
  overview: { label: 'Tổng quan', title: 'Tổng quan tòa nhà', group: 'resident' },
  machines: { label: 'Máy giặt', title: 'Danh sách máy giặt', group: 'resident' },
  queue: { label: 'Hàng đợi', title: 'Hàng đợi chung', group: 'resident' },
  swaps: { label: 'Đổi lượt', title: 'Đổi lượt trong hàng', group: 'resident' },
  chat: { label: 'Trò chuyện', title: 'Trò chuyện tòa nhà', group: 'resident' },
  'admin-members': { label: 'Thành viên', title: 'Quản lý thành viên', group: 'admin' },
  'admin-invitations': { label: 'Mã mời', title: 'Quản lý mã mời', group: 'admin' },
  'admin-machines': { label: 'Quản lý máy', title: 'Cấu hình & bảo trì máy', group: 'admin' },
  'admin-activity': { label: 'Nhật ký', title: 'Nhật ký hoạt động', group: 'admin' },
  'admin-moderation': { label: 'Kiểm duyệt', title: 'Kiểm duyệt & sự cố', group: 'admin' },
  account: { label: 'Tài khoản', title: 'Tài khoản cá nhân', group: 'account' },
};

export function isManagerView(view: AppView): boolean {
  return VIEW_META[view].group === 'admin';
}

export function buildAppPath(buildingId: string | null, view: AppView): string {
  if (view === 'account') return '/account';
  if (!buildingId) return '/buildings';

  const slugMap: Record<Exclude<AppView, 'account'>, string> = {
    overview: 'overview',
    machines: 'machines',
    queue: 'queue',
    swaps: 'swaps',
    chat: 'chat',
    'admin-members': 'admin/members',
    'admin-invitations': 'admin/invitations',
    'admin-machines': 'admin/machines',
    'admin-activity': 'admin/activity',
    'admin-moderation': 'admin/moderation',
  };

  return `/buildings/${buildingId}/${slugMap[view]}`;
}

export function parseSlugToView(slug?: string[]): AppView {
  if (!slug || slug.length === 0) return 'overview';
  const joined = slug.join('/');
  switch (joined) {
    case 'overview':
      return 'overview';
    case 'machines':
      return 'machines';
    case 'queue':
      return 'queue';
    case 'swaps':
      return 'swaps';
    case 'chat':
      return 'chat';
    case 'admin':
    case 'admin/members':
      return 'admin-members';
    case 'admin/invitations':
      return 'admin-invitations';
    case 'admin/machines':
      return 'admin-machines';
    case 'admin/activity':
      return 'admin-activity';
    case 'admin/moderation':
      return 'admin-moderation';
    default:
      return 'overview';
  }
}

export function parsePathname(pathname: string): { buildingId?: string; view: AppView } {
  if (pathname === '/account') return { view: 'account' };
  const match = /^\/buildings\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (!match) return { view: 'overview' };
  const buildingId = match[1];
  const rest = match[2] ? match[2].split('/').filter(Boolean) : [];
  return { buildingId, view: parseSlugToView(rest) };
}
