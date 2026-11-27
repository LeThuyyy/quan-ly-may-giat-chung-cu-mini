import { expect, it } from 'vitest';
import { activityStateLabel } from '../activity-labels';
it('localizes queue, membership, machine and completion states', () => {
  expect(activityStateLabel('WAITING_READY')).toBe('Đang chờ · sẵn sàng');
  expect(activityStateLabel('OWNER_PICKUP')).toBe('Chủ mẻ tự lấy đồ');
  expect(activityStateLabel('MEMBER_REMOVED')).toBe('Thành viên bị gỡ');
  expect(activityStateLabel('NEEDS_CHECK')).toBe('Cần kiểm tra');
  expect(activityStateLabel(null)).toBe('—');
});
it('does not expose unknown raw enum as the normal display label', () => {
  expect(activityStateLabel('INTERNAL_NEW_VALUE')).toBe('Trạng thái khác');
});
