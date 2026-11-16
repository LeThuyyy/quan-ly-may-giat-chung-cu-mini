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

- `GET /api/csrf` — nhận CSRF token và cookie phiên; gửi lại cookie và header token cho các lệnh thay đổi dữ liệu.
- `POST /api/accounts` — đăng ký tài khoản (`username`, `displayName`, `password` tối thiểu 12 ký tự).
- `GET /api/me`, `GET /api/buildings` — xác thực HTTP Basic.
- `POST /api/buildings` — quản lý tạo tòa với `name` và `machineCount` từ 1–30; tạo đủ máy được đánh số trong một giao dịch.
- `GET /api/buildings/{id}` — thành viên đã duyệt xem máy và thứ tự hàng.
- `POST /api/buildings/{id}/machines`, `PATCH /api/buildings/{id}/machines/{machineId}` — chỉ quản lý thêm máy/đánh dấu bảo trì.
- `POST /api/buildings/{id}/invitations` — chỉ quản lý tạo token mời dùng 7 ngày; `POST /api/invitations/{token}/join` — cư dân gửi yêu cầu; `GET /api/buildings/{id}/members/pending` và `POST /api/buildings/{id}/members/{accountId}/approve` — duyệt.
- `POST /api/buildings/{id}/queue` (`ready`), `PATCH /api/buildings/{id}/queue/me` (`ready`), `DELETE /api/buildings/{id}/queue/me` — vào, đổi Sẵn sàng, rời hàng.

**Chưa có cấp máy, giờ giặt, nhường lượt, đổi lượt hay chat**. Trạng thái máy `AVAILABLE` chỉ có nghĩa quản lý chưa đánh dấu bảo trì; không được dùng để tuyên bố lồng giặt thực tế trống. Next.js hiện là frontend tĩnh chưa kết nối Java API. Không triển khai công khai với HTTP Basic hoặc file H2 thử nghiệm; trước đó cần HTTPS, chiến lược đăng nhập phù hợp giao diện điện thoại, migrations, backup và kiểm thử bảo mật.
