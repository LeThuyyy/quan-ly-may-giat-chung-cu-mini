# Kiểm thử tích hợp PR 9 và PR 10

## Bản nguồn

- PR #9: d40e183101b4560c875f715d29eeb5fb2174b0fd — khóa refresh lỗi, cập nhật quyền và test của Châm.
- PR #10: f36f006928a951ab87f87774513a600133065286 — phần B mẻ giặt/bàn giao đã sửa và kiểm thử.
- Ghép cục bộ trên nhánh integration/pr9-pr10, thư mục integration-pr9-pr10. Không merge/push develop hoặc thay đổi hai PR trên GitHub trong bước kiểm tra này.

## Giải quyết giao điểm

Xung đột tại LaundryApp.tsx được ghép thủ công, không chọn nguyên một bên:

- Giữ form/component B, API mẻ giặt/bàn giao và DTO physicallyChecked.
- Giữ cơ chế refresh lỗi và tải lại quyền của Châm.
- Yêu cầu đọc membership, queue/me, holds và mẻ cá nhân thành công; handover cũng phải được xác minh khi đang giữ lượt. Thiếu dữ liệu thì reject callback, xóa snapshot hành động và khóa thao tác.
- Tải issues quản lý sau khi xác minh vai trò mới nhất, không dùng vai trò cũ để gọi API quản lý ngay sau bị hạ quyền. 401 ở các endpoint mới cũng xử lý hết phiên; 403 ở nhóm quản trị cập nhật UI thành cư dân.
- Lỗi tải issues hoặc danh sách thành viên cũng không được coi là refresh hoàn tất. Khi stale, bỏ card giữ/start, ẩn panel xử lý sự cố, không cho pickup từ dữ liệu cũ.
- Không xóa cờ lỗi để mở nút ngay lúc bắt đầu retry; chỉ mở lại sau các bước xác minh dữ liệu.

## Test

- Cập nhật fixture 3 test LaundryApp của PR #9 để có endpoint mẻ/issue/handover mới và giữ nguyên các assertion chính.
- Thêm 8 test LaundryAppWashIntegration: form bắt đầu theo hold đã kiểm tra; lỗi mẻ cá nhân; lỗi issues; lỗi membership; lỗi handover; hạ quyền dùng vai trò mới không gọi issues; mất quyền đúng lúc gọi issues; retry đang chờ vẫn giữ khóa.
- mvn -B -f backend/pom.xml clean test: **57/57 đạt**, 0 failures/errors/skipped, BUILD SUCCESS.
- npm run check: docs/lint/typecheck đạt; **112/112 frontend test đạt** (11 tệp).
- npm run build: đạt, exit 0.
- Kiểm tra whitespace và danh sách file conflict: đạt, không còn conflict chưa xử lý.

## Giới hạn

Thủy đã mở bản tích hợp ở localhost:3005 với database riêng và xác nhận các luồng được hướng dẫn thử đều ổn: cấp máy/giặt/bàn giao, mất kết nối-khôi phục, hạ quyền khi đang đăng nhập. Đây là nghiệm thu thủ công của người dùng; chưa quay lại video tự động toàn luồng trên chính bản ghép. Video trước đó chỉ xác minh bản B riêng. Những component mutation mới của B vẫn cần kiểm tra scope/abort khi đổi tòa/tài khoản trong lúc request đang gửi; không khẳng định đã xử lý xong mọi tình huống mạng hoặc cạnh tranh.

Bản tích hợp được chuẩn bị commit/push và mở PR vào develop theo yêu cầu Thủy, giữ cả commit gốc Châm/Hải và ghi rõ phần hỗ trợ ghép/sửa test. Chưa merge #9/#10 hoặc PR tích hợp vào develop; không tự đóng hai PR nguồn trước khi bản chung được duyệt.
