# Ghép QueuePanel vào giao diện

`QueuePanel.tsx` là component client riêng của A, sử dụng API hàng đợi đã có. Chưa được ghép vào `LaundryApp.tsx`; không thay phần mẻ giặt B hoặc khung giao diện C.

## Props

- `buildingId`, `accountId`: tòa và tài khoản hiện tại, chỉ render sau khi đã được duyệt.
- `entries: QueueEntryView[]`: hàng chờ từ `GET /api/buildings/{id}`. Component sắp theo khóa `position` nhưng hiển thị vị trí liên tục 1, 2, 3; không hiển thị khóa lịch sử như số thứ tự hiện tại.
- `participation`: `NONE | WAITING | HELD | WASHING | UNKNOWN`, trạng thái yêu cầu của chính tài khoản, phải được xác minh ở server.
- `onRefresh(): Promise<void>`: component cha tải lại đồng bộ trạng thái tòa/hàng chờ, lượt giữ và yêu cầu/mẻ cá nhân. Resolve khi cập nhật thành công, reject khi thất bại.
- `onSessionExpired()`: xóa dữ liệu và yêu cầu đăng nhập lại.

## Cảnh báo quan trọng về participation

Backend hiện có danh sách hàng chờ và danh sách holds nhưng chưa có endpoint trả đầy đủ trạng thái yêu cầu/mẻ cá nhân. Vì vậy **không được coi không có tên trong queue và không có hold là NONE**: có thể người đó đang WASHING. Khi không xác minh đủ, truyền UNKNOWN và giữ khóa thao tác; cần thống nhất API trạng thái cá nhân với B trước khi ghép hoàn chỉnh.

- WAITING chỉ hợp lệ nếu có entry của tài khoản trong danh sách.
- HELD: dùng `MachineHoldCard`, không có nút rời hàng/tắt Sẵn sàng ở panel.
- WASHING: chờ hoàn tất mẻ/bàn giao, không cho vào hàng lại.
- NONE chỉ khi server xác nhận không có yêu cầu chưa hoàn tất.
- UNKNOWN hoặc snapshot mâu thuẫn: không hiện các thao tác thay đổi hàng, chỉ cho tải lại.

UI khóa thao tác để tránh nhầm; quyền và chống trùng vẫn do Java quyết định.

## Giao tiếp API

- Vào hàng: POST `/api/buildings/{id}/queue`, JSON `{ "ready": true }` hoặc false; người dùng chọn rõ một trong hai nút.
- Đổi Sẵn sàng: PATCH `/api/buildings/{id}/queue/me`, JSON `{ "ready": true }` hoặc false.
- Rời hàng: DELETE `/api/buildings/{id}/queue/me`, không gửi body.

Không sửa danh sách lạc quan ở client: bật Sẵn sàng có thể được giao ngay, nên mọi thao tác thành công đều yêu cầu tải lại cả queue và holds. Trong lúc snapshot chưa thay đổi, chặn gửi lại thao tác đã thành công. Snapshot participation/id/readiness mới sẽ reset kết quả cục bộ.

## Trách nhiệm khung chung của C

- Cha sở hữu việc tải/polling; panel không tạo thêm timer API.
- Khi chuyển tòa/đăng xuất, xóa snapshot cũ; không gán dữ liệu tòa A cho buildingId B.
- Loại response tải cũ bằng request ID hoặc AbortController. Panel tự abort mutation và bỏ kết quả cũ khi đổi scope.
- Không hiển thị đồng thời hàng đợi cũ của `LaundryApp` và panel mới; thay phần hàng đợi khi đã tích hợp xong dữ liệu.
- Dùng `UNKNOWN` khi đang tải hoặc dữ liệu không đủ. Kiểm tra member status trước khi render.

401 khóa mutation và báo cha. Lỗi mạng, 4xx/5xx không báo thành công và yêu cầu refresh trước khi thử lại. Kết quả thành công nhưng refresh thất bại vẫn giữ khóa để tránh gửi lặp. Cần kiểm thử trình duyệt–Java thật sau khi ghép; test DOM hiện dùng fetch giả.

## Kiểm thử riêng

```powershell
npm test -- src/components/__tests__/QueuePanel.test.tsx
```

Có test thứ tự, số người sẵn sàng phía trước, chọn readiness khi join, toggle, leave, giữ/giặt/không rõ trạng thái, snapshot mâu thuẫn, bấm lặp, 401/409, mất mạng, refresh thất bại và response cũ khi chuyển tòa.
