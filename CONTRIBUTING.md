# Quy trình đóng góp

## Nhánh và vòng đời

- `main`: bản phát hành ổn định; không đẩy thay đổi trực tiếp. Chỉ nhận PR từ `release/*` hoặc `hotfix/*` (hoặc `develop` nếu phát hành nhỏ, được ghi rõ trong PR).
- `develop`: nhánh tích hợp; chỉ nhận PR từ `feature/*`, `fix/*`, `docs/*`, `chore/*` và các bản đồng bộ trở lại sau phát hành.
- `feature/<issue>-<mo-ta>`, `fix/<issue>-<mo-ta>`, `docs/<issue>-<mo-ta>`, `chore/<issue>-<mo-ta>`: tách từ `develop`, tồn tại ngắn, mỗi nhánh một chủ đề. Ví dụ: `feature/12-hang-doi`.
- `release/<version>`: chỉ tạo từ `develop` khi có bản cần kiểm thử/đóng gói; hợp nhất vào `main`, gắn tag `vX.Y.Z`, rồi đồng bộ các sửa lỗi trở về `develop`.
- `hotfix/<issue>-<mo-ta>`: tách từ `main` khi sửa lỗi khẩn; PR vào `main`, phát hành bản vá, rồi đưa thay đổi về `develop`.

Chỉ `main` và `develop` là nhánh dài hạn. Không tạo nhánh `feature/*`/`release/*`/`hotfix/*` trống để trưng bày: tạo khi có việc thực tế, xóa sau khi hợp nhất. Tạm thời chủ repo có thể dùng PR tự kiểm tra nếu chưa có cộng tác viên; không tuyên bố đã được review độc lập.

## Quy trình một thay đổi

1. Mở issue ghi mục tiêu và tiêu chí nghiệm thu; phân biệt quy tắc nghiệp vụ **đã chốt** với **đề xuất chưa duyệt**.
2. Tạo nhánh ngắn từ `develop`; viết test cho hàng đợi/cấp máy/thời hạn trước hoặc cùng thay đổi.
3. Mở draft PR sớm, hoàn thiện mô tả và checklist; CI phải xanh. Người khác review khi đã có cộng tác viên.
4. Merge PR vào `develop` sau khi test; squash khi thích hợp để lịch sử dễ đọc. Không force-push lên nhánh chung.
5. Khi phát hành, tạo `release/*`, kiểm thử trên môi trường thử nghiệm; merge/tag vào `main`, đồng bộ thay đổi về `develop`.

## Quy ước chất lượng

- Hạn 8/10 phút dùng đồng hồ máy chủ; thao tác đổi lượt, giao máy, hết hạn phải nguyên tử và có test cạnh tranh.
- QR và chat không tự cấp quyền; kiểm tra tư cách thành viên và quyền theo tòa trên máy chủ.
- Không commit mật khẩu, token, thông tin cá nhân thật, bản sao dữ liệu cư dân hoặc file `.env`.
- Đổi nghiệp vụ quan trọng: cập nhật tài liệu và test nghiệm thu trong cùng PR; không âm thầm biến đề xuất thành quyết định.
