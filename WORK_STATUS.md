# Bàn giao công việc

> Điểm bắt đầu cho các lượt điều phối: đọc file này, `git status --short --branch` và trạng thái PR; chỉ mở mã nguồn khi nhiệm vụ yêu cầu. Ghi sự thật vừa kiểm chứng, không coi file này là quyền phê duyệt.

## Trạng thái tại lần cập nhật này (2026-11-18)

- Nhánh: `feature/next-java-integration` (chưa commit, chưa push/merge).
- **Đã làm**:
  - Bảo mật đăng nhập Java: chuyển từ HTTP Basic sang session `JSESSIONID` (`POST /api/auth/login`, `POST /api/auth/logout` trả `204` không redirect, `AuthenticationEntryPoint` trả `401` không `WWW-Authenticate`), giữ Spring CSRF và xoay CSRF token khi đăng nhập.
  - Cầu nối Next.js phía server (`src/lib/session-store.ts`, `src/lib/java-bridge.ts`, `src/lib/route-helpers.ts`, `src/app/api/**`): chỉ giữ cookie phiên opaque `HttpOnly` (`laundry_session`), gọi Java qua loopback cố định (`JAVA_API_ORIGIN`, mặc định `http://127.0.0.1:8080`), chặn chuyển hướng 3xx, không chuyển nguyên header/lỗi/redirect ra trình duyệt, kiểm tra `Origin` trên request thay đổi dữ liệu.
  - Giao diện Next.js (`src/components/LaundryApp.tsx`, `src/app/page.tsx`, `src/app/globals.css`): nối đăng ký/đăng nhập/đăng xuất, tạo & xem tòa (quản lý chọn 1–30 máy), thêm máy, bật/tắt bảo trì, tạo/gửi lời mời 7 ngày, duyệt cư dân, vào/rời hàng và bật/tắt Sẵn sàng. Cập nhật `README.md` và `backend/README.md`.
- **Kiểm tra đã đạt**:
  - `mvn -f backend/pom.xml test`: **12/12 test đạt** (gồm `RealHttpAuthAndSecurityTest` chạy HTTP thật qua `RANDOM_PORT`: xác nhận cookie `JSESSIONID` đăng nhập được ở request kế tiếp, CSRF chặn token sai/thiếu bằng 403, đăng xuất vô hiệu phiên bằng 401, và phân quyền tòa).
  - `npm run check`: `check:docs`, `eslint`, `typecheck`, `vitest` (**5/5 test**, gồm thiếu Origin/Host, Origin khác nguồn và đúng nguồn) đạt.
  - `npm run build` & `git diff --check`: đạt sau sửa Origin. Next.js từ chối yêu cầu thay đổi dữ liệu khi thiếu Origin/Host hoặc không khớp scheme, host và origin của request.
  - Đã chạy cả Next.js và Java trên localhost, thử đăng ký → đăng nhập → tạo tòa 3 máy → vào hàng → bật Sẵn sàng → đăng xuất; Origin khác nguồn trả 403. Hai server thử nghiệm đã dừng. Chưa chạy kiểm thử thao tác bằng trình duyệt.
  - Lỗi ảnh “Đang tải dữ liệu tòa…” đã tái hiện: tiến trình Next.js cũ trả HTTP 500/Jest worker cho GET chi tiết và danh sách chờ duyệt; sau khi khởi động Next.js mới, cả hai trả HTTP 200 với tòa thử mới. Sửa `LaundryApp.tsx` để thất bại hiện lỗi + nút “Thử tải lại”, không treo loading, tránh hiển thị dữ liệu tòa cũ khi đổi lựa chọn. Người dùng đã mở giao diện và xác nhận **ổn**. Chạy lại `mvn -f backend/pom.xml test` (12/12), `npm run check` (5/5), `npm run build`, `git diff --check`: tất cả đạt sau lần xác nhận này.
- **Chưa làm / giới hạn**:
  - Chưa triển khai giao máy tự động, đồng hồ 8 phút, ETA, đổi lượt, chat.
  - Phiên opaque Next.js lưu trong bộ nhớ tiến trình Node (mất khi khởi động lại server Next.js); chưa test E2E trình duyệt chạy đồng thời cả hai tiến trình Next.js + Spring Boot.

## Bước tiếp theo

1. Commit/push nhánh `feature/next-java-integration`, tạo PR vào `develop` và chờ CI; người dùng kiểm tra cuối trước khi merge.
2. Không push thẳng hoặc merge `main`. Sau khi `develop` được duyệt/gộp, tạo PR riêng vào `main` nếu người dùng yêu cầu.
