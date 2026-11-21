# Ghép MachineHoldCard vào giao diện

Component độc lập của phần A: `MachineHoldCard.tsx`. Chưa được gắn vào `LaundryApp.tsx`; không tạo endpoint bắt đầu giặt hoặc xử lý mẻ/bàn giao của B.

## Dữ liệu và callback

- `buildingId`: tòa đang chọn.
- `accountId`: tài khoản đang đăng nhập.
- `hold`: lượt giữ của tài khoản, lấy từ `GET /api/buildings/{id}/holds`; không có thì truyền `null`.
- `machineLabel`: tên máy tương ứng với `hold.machineId`.
- `onRefresh`: tải lại cả holds và chi tiết tòa/hàng đợi. Promise chỉ resolve sau khi dữ liệu mới đã được xử lý; phải reject khi tải thất bại, không nuốt lỗi rồi resolve. Khi không còn lượt giữ thì cập nhật `hold=null`.
- `onSessionExpired`: xóa trạng thái đăng nhập/dữ liệu tòa ở component cha và yêu cầu đăng nhập lại.

Ví dụ vị trí ghép trong client component cha (các biến là dữ liệu/callback của component cha, không phải hook mới):

```tsx
import MachineHoldCard from '@/components/MachineHoldCard';

<MachineHoldCard
  buildingId={selectedId}
  accountId={account.id}
  hold={holds.find((item) => item.accountId === account.id) ?? null}
  machineLabel={buildingDetail.machines.find((machine) => machine.id === myHold?.machineId)?.label}
  onRefresh={refreshSelectedBuilding}
  onSessionExpired={handleSessionExpired}
/>
```

Chỉ render khi tài khoản và tòa đã duyệt còn hợp lệ. `myHold` trong ví dụ là cùng lượt giữ đã chọn từ `holds`.

## Trách nhiệm của khung giao diện

1. Component cha sở hữu việc tải dữ liệu và polling chung khi mở trang; card chỉ có timer hiển thị, không tự tạo vòng polling API.
2. Không truyền dữ liệu cũ của tòa A sang tòa B. Xóa snapshot khi chuyển tòa/đăng xuất; bỏ qua response tải dữ liệu cũ bằng request ID hoặc AbortController.
3. Sau thao tác, snapshot mới phải phản ánh lại cả hàng đợi và lượt giữ. Hết hạn trên card yêu cầu refresh một lần; polling chung tiếp tục cập nhật khi job Java xử lý xong.
4. Các nút gọi POST `.../holds/{holdId}/confirm-check` và `.../yield`. Card không gọi `/start`; xác nhận kiểm tra không cho phép tự khởi động máy thật.

## Hành vi và giới hạn

- Card chỉ hiện lượt thuộc `accountId`; Java vẫn là nơi kiểm tra quyền thật.
- Đếm ngược theo `expiresAt`; giờ trình duyệt chỉ để hiển thị/khóa nút thận trọng, không thay đồng hồ máy chủ. Chưa có cơ chế đồng bộ độ lệch đồng hồ thiết bị.
- Chặn bấm lặp trong lúc gửi. Đổi tài khoản/tòa/lượt thì hủy request cũ và không dùng response cũ để cập nhật tòa mới.
- 401 khóa thao tác và gọi `onSessionExpired`. 403/404/409 yêu cầu tải lại. Mất mạng/lỗi proxy khóa thao tác đến khi tải lại thành công vì chưa biết mutation đã commit chưa.
- Test DOM dùng fetch giả và timer điều khiển; không thay cho kiểm thử trình duyệt kết nối Java thật.

Chạy riêng test card từ gốc repo:

```powershell
npm test -- src/components/__tests__/MachineHoldCard.test.tsx
```
