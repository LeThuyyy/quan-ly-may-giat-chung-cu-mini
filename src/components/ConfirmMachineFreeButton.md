# Ghép nút xác nhận máy trống

`ConfirmMachineFreeButton.tsx` là control độc lập thuộc phần A, chưa ghép vào `LaundryApp.tsx`. Dùng POST `/api/buildings/{buildingId}/machines/{machineId}/confirm-free` đã có, không thêm API hoặc sửa backend.

## Props

- `buildingId`, `accountId`: tòa và tài khoản hiện tại. Thay đổi scope sẽ hủy request cũ và không dùng kết quả đó cập nhật tòa mới.
- `isManager`: true chỉ khi là quản lý APPROVED trong tòa đang chọn; false ẩn control. Java vẫn kiểm tra quyền thực tế.
- `machine`: `{ id, label, status }` từ snapshot máy mới nhất.
- `hasActiveHold`: true nếu máy có lượt giữ, false khi đã xác minh không có, **null nếu đang tải/lỗi/chưa xác minh**. Không chuyển dữ liệu lỗi thành false. Khi còn snapshot lượt HELD đã hết hạn nhưng chưa được job xử lý, nên giữ true cho tới khi server xác nhận đã đóng.
- `onRefresh(): Promise<void>`: tải lại máy, queue, holds và trạng thái cá nhân. Resolve sau khi xử lý snapshot mới; reject nếu tải lỗi. Cha chịu trách nhiệm polling và loại response tải cũ.
- `onSessionExpired()`: xóa dữ liệu đăng nhập và yêu cầu đăng nhập lại.

## Ghép vào danh sách máy

```tsx
import ConfirmMachineFreeButton from '@/components/ConfirmMachineFreeButton';

<ConfirmMachineFreeButton
  buildingId={selectedId}
  accountId={account.id}
  isManager={selectedRole === 'MANAGER' && selectedStatus === 'APPROVED'}
  machine={machine}
  hasActiveHold={holdsLoaded ? holds.some((hold) => hold.machineId === machine.id) : null}
  onRefresh={refreshSelectedBuilding}
  onSessionExpired={handleSessionExpired}
/>
```

Đây là ví dụ với biến của component cha, không phải hook/polling mới. Chỉ render khi dữ liệu máy thuộc đúng tòa. Khi snapshot máy/holds/status cá nhân mâu thuẫn, giữ khóa và refresh; các GET riêng không tạo snapshot nguyên tử toàn tòa. Backend trả 409 nếu trạng thái thay đổi sau khi tải.

## Hành vi

1. Quản lý bấm Xác nhận máy trống để mở phần xác nhận có tên máy và cảnh báo.
2. Phải tích đã kiểm tra tại chỗ: máy đã dừng và lồng giặt trống, không còn đồ chờ bàn giao. Hủy hoặc đóng phần xác nhận sẽ xóa dấu tích.
3. Bấm Ghi nhận máy trống gọi POST không body, chặn gửi lặp.
4. Thành công yêu cầu refresh, không tự đổi trạng thái thành Trống ở UI: máy có thể đã được giao ngay và hạn 8 phút đã bắt đầu.

Chỉ AVAILABLE hoặc NEEDS_CHECK và `hasActiveHold=false` mới cho thao tác. RUNNING/MAINTENANCE/trạng thái chưa hỗ trợ bị khóa. NEEDS_CHECK chỉ được xác nhận khi quản lý thực sự đã kiểm tra/giải quyết vấn đề; nút không tự sửa máy hoặc bỏ qua bàn giao.

401 gọi callback hết phiên; 403 khóa quyền ngay cả sau refresh thành công (khung cha phải cập nhật membership). Lỗi khác hoặc mất mạng yêu cầu refresh trước khi gửi lại, và phải tích xác nhận vật lý mới. Xác nhận đã thành công thì không cho gửi lại từ cùng snapshot, kể cả refresh sau đó lỗi. Không có timeout/retry mutation tự động.

Component không kiểm chứng hiện diện vật lý, không kết thúc mẻ giặt hoặc hoàn tất bàn giao của B. Không dùng nút này để vượt qua luồng đó. Chưa kiểm thử trình duyệt–Java toàn luồng sau khi ghép.

## Kiểm thử

```powershell
npm test -- src/components/__tests__/ConfirmMachineFreeButton.test.tsx
```

18 test DOM: quyền, dấu tích/hủy, AVAILABLE/NEEDS_CHECK, trạng thái khóa, bấm lặp, 401/403/409/502, mất mạng, refresh lỗi, response cũ và thay đổi trạng thái/lượt giữ.
