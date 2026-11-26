# Backend Java — Spring Boot & H2

Java 21, Spring Boot 3.5.7, Maven, Spring Security, Spring Data JPA và H2 file cục bộ. Toàn bộ nghiệp vụ hướng đối tượng, kiểm tra quyền theo tòa, khóa giao dịch (`BuildingRepository.findLockedById` với `PESSIMISTIC_WRITE`), chuyển trạng thái máy/hàng đợi/mẻ giặt và nhật ký hoạt động đều được thực thi tại tầng Java.

## Chạy và kiểm thử

Từ thư mục gốc repository:

```bash
mvn -B -f backend/pom.xml clean test
mvn -f backend/pom.xml spring-boot:run
```

Nếu thư mục chứa dự án trên Windows có dấu tiếng Việt khiến tiến trình con của `spring-boot:run` lỗi mã hóa đường dẫn, có thể đóng gói và chạy trực tiếp file JAR:

```bash
mvn -f backend/pom.xml package -DskipTests
java -jar backend/target/shared-laundry-backend-0.1.0-SNAPSHOT.jar
```

API chỉ lắng nghe trên `127.0.0.1:8080` trong cấu hình phát triển (`http://127.0.0.1:8080/api`). File H2 ở `.data/` của thư mục đang chạy, không commit. Đây là môi trường phát triển cục bộ (`ddl-auto=update`, không bật H2 console).

## Các nhóm API đã triển khai

### 1. Xác thực & Phiên bảo mật
- `GET /api/csrf` — nhận CSRF token và cookie phiên; gửi lại cookie và header token cho các lệnh thay đổi dữ liệu (`POST`, `PATCH`, `DELETE`).
- `POST /api/accounts` — đăng ký tài khoản (`username`, `displayName`, `password` tối thiểu 12 ký tự).
- `POST /api/auth/login` — đăng nhập bằng `username` + `password`, tạo phiên `JSESSIONID` (`HttpOnly`, `SameSite=Lax`) và xoay CSRF token.
- `POST /api/auth/logout` — đăng xuất (yêu cầu CSRF), vô hiệu `HttpSession` và xóa cookie `JSESSIONID`, trả `204`.
- `GET /api/me`, `GET /api/buildings` — thông tin tài khoản và danh sách tòa nhà đang tham gia (loại trừ `REMOVED`).

### 2. Tòa nhà, Máy giặt & Quản trị thành viên
- `POST /api/buildings` — tạo tòa mới với `name` và `machineCount` (1–30).
- `GET /api/buildings/{id}` — thành viên đã duyệt xem danh sách máy và hàng đợi.
- `GET /api/buildings/{id}/snapshot` — đọc snapshot vận hành nhất quán dưới khóa tòa (máy, hàng đợi, membership hiện tại, trạng thái yêu cầu cá nhân, lượt giữ, mẻ giặt của tôi, mẻ trước chờ bàn giao, ETA, danh sách đổi lượt và `serverNow`).
- `POST /api/buildings/{id}/machines`, `PATCH /api/buildings/{id}/machines/{machineId}` — quản lý thêm máy hoặc bật/tắt bảo trì.
- `POST /api/buildings/{id}/machines/{machineId}/confirm-free` — quản lý xác nhận máy đã dừng và lồng giặt trống tại chỗ để mở cấp phát.
- `GET /api/buildings/{buildingId}/machines/{machineId}` — chi tiết máy giặt kèm lượt giữ/mẻ giặt của tài khoản trên máy đó và `serverNow`.
- `POST /api/buildings/{id}/invitations`, `GET /api/buildings/{id}/invitations`, `POST /api/buildings/{id}/invitations/{invitationId}/revoke` — quản lý tạo, xem phân trang và thu hồi mã mời 7 ngày.
- `POST /api/invitations/{token}/join` — cư dân gửi yêu cầu tham gia tòa bằng mã mời.
- `GET /api/buildings/{id}/members`, `GET /api/buildings/{id}/members/pending`, `GET /api/buildings/{id}/members/removed` — quản lý xem thành viên đã duyệt, chờ duyệt và đã gỡ.
- `POST /api/buildings/{id}/members/{accountId}/approve`, `PATCH /api/buildings/{id}/members/{accountId}/role`, `DELETE /api/buildings/{id}/members/{accountId}`, `POST /api/buildings/{id}/members/{accountId}/restore` — duyệt, phân quyền quản lý/cư dân (giữ tối thiểu 1 quản lý), gỡ và khôi phục thành viên.

### 3. Hàng đợi, Giữ máy (8 phút) & Đổi lượt
- `GET /api/buildings/{id}/queue/me` — trạng thái yêu cầu cá nhân (`NONE`, `WAITING`, `HELD`, `WASHING`) kèm `serverNow`. Xem [hợp đồng API](../docs/api-trang-thai-ca-nhan.md).
- `POST /api/buildings/{id}/queue`, `PATCH /api/buildings/{id}/queue/me`, `DELETE /api/buildings/{id}/queue/me` — vào hàng, bật/tắt Sẵn sàng, rời hàng.
- `GET /api/buildings/{id}/holds` — danh sách lượt giữ đang còn hạn trong tòa.
- `POST /api/buildings/{id}/holds/{holdId}/confirm-check`, `/yield`, `/unusable`, `/start` — chủ lượt xác nhận đã kiểm tra tại máy, nhường lượt, báo máy lỗi kỹ thuật (khôi phục vị trí hàng và chuyển máy sang `NEEDS_CHECK`), hoặc bắt đầu mẻ giặt.
- `GET /api/buildings/{id}/swaps`, `/swaps/pending`, `/swaps/outgoing`, `POST /api/buildings/{id}/swaps`, `POST /api/buildings/{id}/swaps/{swapId}/accept|reject|cancel` — gửi, xem và phản hồi lời mời đổi lượt trong hàng chờ (hạn 10 phút).
- `GET /api/buildings/{buildingId}/eta/me` — ước tính khoảng thời gian tới lượt kiểm tra máy cho cư dân đang `WAITING` và `ready=true`.

### 4. Mẻ giặt, Bàn giao, Trò chuyện & Nhật ký hoạt động
- `GET /api/buildings/{buildingId}/wash-cycles/me`, `GET /api/buildings/{buildingId}/holds/{holdId}/handover`, `GET /api/buildings/{buildingId}/wash-cycles/issues` — xem mẻ giặt cá nhân, mẻ cũ chờ bàn giao và danh sách sự cố chờ quản lý.
- `POST /api/buildings/{buildingId}/wash-cycles/{cycleId}/pickup`, `/transfer`, `/remaining`, `POST /api/buildings/{buildingId}/holds/{holdId}/report-running`, `POST /api/buildings/{buildingId}/wash-cycles/{cycleId}/resolve` — tự lấy đồ, chuyển đồ vào chậu chủ mẻ, báo số phút còn lại và quản lý giải quyết sự cố (`CLEARED`, `DEFER`, `MAINTENANCE`). Xem [chi tiết phần B](../docs/phan-b-me-giat-ban-giao.md).
- `GET /api/buildings/{buildingId}/chat/messages`, `POST /chat/messages`, `POST /chat/messages/{messageId}/report|hide`, `GET /chat/reports` — trò chuyện theo tòa, chống spam 5 giây, idempotency theo `clientRequestId`, báo cáo và quản lý ẩn tin nhắn.
- `GET /api/buildings/{id}/activity` — quản lý tra cứu nhật ký hoạt động 90 ngày theo trang, loại sự kiện và máy.
