const STATES: Record<string, string> = {
  PENDING: 'Chờ phản hồi / duyệt', APPROVED: 'Đã duyệt', REMOVED: 'Đã gỡ',
  WAITING: 'Đang chờ', WAITING_READY: 'Đang chờ · sẵn sàng', WAITING_UNREADY: 'Đang chờ · chưa sẵn sàng',
  READY: 'Sẵn sàng', UNREADY: 'Chưa sẵn sàng', HELD: 'Đang giữ lượt', WASHING: 'Đang giặt', LEFT: 'Đã rời hàng',
  ACTIVE: 'Đang hiệu lực', STARTED: 'Đã bắt đầu', YIELDED: 'Đã nhường', EXPIRED: 'Đã hết hạn',
  UNUSABLE: 'Chưa dùng được', MEMBER_REMOVED: 'Thành viên bị gỡ', COMPLETED: 'Đã hoàn tất',
  AVAILABLE: 'Không bảo trì', RUNNING: 'Máy đang chạy', NEEDS_CHECK: 'Cần kiểm tra', MAINTENANCE: 'Bảo trì',
  UNVERIFIED: 'Chưa xác nhận trống', VERIFIED: 'Đã xác nhận trống', UNCHECKED: 'Chưa kiểm tra', CHECKED: 'Đã kiểm tra',
  ACCEPTED: 'Đã đồng ý', REJECTED: 'Đã từ chối', CANCELLED: 'Đã hủy', INVALIDATED: 'Mất hiệu lực', REVOKED: 'Đã thu hồi',
  MANAGER: 'Quản lý', RESIDENT: 'Cư dân', CREATED: 'Đã tạo', OWNER_PICKUP: 'Chủ mẻ tự lấy đồ',
  TRANSFERRED: 'Đã chuyển đồ', MANAGER_CLEARED: 'Quản lý xác nhận hoàn tất', NEEDS_MANAGER: 'Chờ quản lý xử lý',
  CLEARED: 'Đã xử lý xong', DEFER: 'Dời mốc kiểm tra', VISIBLE: 'Đang hiển thị',
  SPAM: 'Spam', ABUSE: 'Nội dung lạm dụng', OTHER: 'Lý do khác',
  HIDDEN_SPAM: 'Đã ẩn · spam', HIDDEN_ABUSE: 'Đã ẩn · lạm dụng', HIDDEN_OTHER: 'Đã ẩn · lý do khác',
};
export function activityStateLabel(state: string | null): string {
  return state === null ? '—' : STATES[state] ?? 'Trạng thái khác';
}
