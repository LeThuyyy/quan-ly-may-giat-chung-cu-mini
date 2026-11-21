# Backend Java — bản nền tảng

Java 21, Spring Boot, Maven, Spring Data JPA và H2 file cục bộ. Các lớp hướng đối tượng: `Account`, `Building`, `Machine`, `Membership`, `Invitation`, `QueueEntry`; `LaundryService` giữ quy tắc theo tòa, `InvitationService` xử lý mời/duyệt; controller chỉ nhận request/trả DTO.

## Chạy và thử

Từ thư mục gốc repository:

```bash
mvn -f backend/pom.xml test
mvn -f backend/pom.xml spring-boot:run
```

API chỉ lắng nghe trên `127.0.0.1:8080` trong cấu hình phát triển, tại `http://localhost:8080/api`. File H2 ở `.data/` của thư mục đang chạy Maven, không commit. Đây là môi trường thử cục bộ; schema dùng `ddl-auto=update` để phát triển, **chưa có migration hay cấu hình triển khai Internet**. Có thể cấu hình `spring.datasource.url` khi chạy ở môi trường khác. Không bật H2 console.

## API hiện có

- `GET /api/csrf` — nhận CSRF token và cookie phiên; gửi lại cookie và header token cho các lệnh thay đổi dữ liệu (`POST`, `PATCH`, `DELETE`).
- `POST /api/accounts` — đăng ký tài khoản (`username`, `displayName`, `password` tối thiểu 12 ký tự).
- `POST /api/auth/login` — đăng nhập bằng `username` + `password`, tạo phiên `JSESSIONID` (`HttpOnly`, `SameSite=Lax`) và xoay CSRF token.
- `POST /api/auth/logout` — đăng xuất (yêu cầu CSRF), vô hiệu `HttpSession` và xóa cookie `JSESSIONID`, trả `204` không redirect.
- `GET /api/me`, `GET /api/buildings` — xác thực bằng cookie phiên `JSESSIONID`.
- `POST /api/buildings` — quản lý tạo tòa với `name` và `machineCount` từ 1–30; tạo đủ máy được đánh số trong một giao dịch.
- `GET /api/buildings/{id}` — thành viên đã duyệt xem máy và thứ tự hàng.
- `POST /api/buildings/{id}/machines`, `PATCH /api/buildings/{id}/machines/{machineId}` — chỉ quản lý thêm máy/đánh dấu bảo trì.
- `POST /api/buildings/{id}/invitations` — chỉ quản lý tạo token mời dùng 7 ngày; `POST /api/invitations/{token}/join` — cư dân gửi yêu cầu; `GET /api/buildings/{id}/members/pending` và `POST /api/buildings/{id}/members/{accountId}/approve` — duyệt.
- `GET /api/buildings/{id}/queue/me` — trạng thái yêu cầu của tài khoản đang đăng nhập: NONE/WAITING/HELD/WASHING, kèm ID lượt/máy và thời gian server. Chỉ thành viên đã duyệt; không nhận accountId để xem người khác. Xem [hợp đồng API](../docs/api-trang-thai-ca-nhan.md).
- `POST /api/buildings/{id}/queue` (`ready`), `PATCH /api/buildings/{id}/queue/me` (`ready`), `DELETE /api/buildings/{id}/queue/me` — vào, đổi Sẵn sàng, rời hàng; khi máy được xác nhận trống, người sẵn sàng đầu hàng có thể nhận lượt ngay.

**Đang phát triển trên nhánh tính năng:** chỉ khi quản lý gọi `POST /api/buildings/{id}/machines/{machineId}/confirm-free` mới xét giao máy được xác nhận trống. `GET /api/buildings/{id}/holds` xem lượt giữ 8 phút; chủ lượt có thể `POST .../holds/{holdId}/yield`, `/unusable`, `/confirm-check`, `/start`. Job nền xử lý hết hạn; người báo lỗi trong hạn quay về khóa thứ tự cũ. Máy chỉ `AVAILABLE` không đồng nghĩa đã xác nhận trống. **Chưa có nhập phút giặt, bàn giao khi giặt xong, ETA, đổi lượt, chat hoặc giao theo giờ dự kiến**; không dùng bản này để vận hành giặt thật trước khi hoàn tất vòng đời máy. Frontend chưa nối các API giữ lượt.  Không triển khai công khai với file H2 thử nghiệm hoặc HTTP thuần; trước đó cần HTTPS, migrations, backup và kiểm thử bảo mật.
