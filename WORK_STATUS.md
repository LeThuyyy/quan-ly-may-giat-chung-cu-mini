# Bàn giao công việc

> Điểm bắt đầu cho các lượt điều phối: đọc file này, `git status --short --branch` và trạng thái PR; chỉ mở mã nguồn khi nhiệm vụ yêu cầu. Ghi sự thật vừa kiểm chứng, không coi file này là quyền phê duyệt.

## Trạng thái tại lần cập nhật này

- Nhánh: `feature/building-queue-foundation`. PR [#1](https://github.com/LeThuyyy/quan-ly-may-giat-chung-cu-mini/pull/1) vào `develop` vẫn mở; **chưa merge**.
- Bản sửa review PR #1 đã được commit `70b376b` và push trên nhánh feature: khóa theo tòa cho `setReady`/`leave`, API yêu cầu trường `maintenance`, bind backend thử nghiệm vào `127.0.0.1`, lời mời trả trạng thái thật và tuần tự hóa yêu cầu lặp, đăng ký trùng trả 409, sắp máy theo `displayOrder`, tối ưu truy vấn danh sách tòa và vị trí hàng. Có thêm test đua `setReady`/`leave`, lời mời gửi đồng thời, PATCH rỗng và thứ tự máy 10.
- Kết quả trên máy: `mvn -q -f backend/pom.xml test` **đạt 10 test** (4 service, 4 API, 2 cạnh tranh); `npm run check` và `npm run build` đạt; `git diff --check` không báo lỗi whitespace. Đua đồng thời đã được kiểm tra bằng test tích hợp H2, không phải kiểm chứng tải thực tế ở cơ sở dữ liệu production.
- CI của PR #1 tại `70b376b`: **java-tests pass; lint-typecheck-test-build pass**. PR đang OPEN và GitHub báo MERGEABLE. File bàn giao này vừa được cập nhật sau commit nên hiện còn một thay đổi cục bộ chưa commit; không ảnh hưởng CI của code.

## Bước tiếp theo

1. Người dùng kiểm tra PR #1 sau khi CI xanh; chỉ merge khi họ yêu cầu. Bản cập nhật trạng thái trong file này chưa commit, nên cần đưa vào commit kế tiếp khi thích hợp.
2. Sau PR #1 mới giao agent khác việc nối giao diện Next.js với backend Java; không thực hiện chức năng cấp máy tự động trước khi quy tắc bàn giao/khôi phục thứ tự được chốt.

## Quy tắc cập nhật

Sau mỗi lượt có thay đổi hoặc phát hiện quan trọng, thay thế trạng thái cũ bằng tóm tắt mới (khoảng 30 dòng trở xuống): nhánh/commit/PR, đã làm, test thật, còn mở và hành động kế tiếp. Không chép log, token hoặc dữ liệu cá nhân. Người dùng là người kiểm tra cuối; không tự gộp PR hay mở rộng phạm vi nếu chưa được yêu cầu.
