# Quản lý máy giặt chung cư mini

Dự án web ưu tiên giao diện điện thoại; mỗi quản lý chọn số máy giặt riêng cho tòa của họ (mặc định vận hành nhỏ, bản thử hỗ trợ 1–30 máy). Mỗi tòa có **một hàng đợi chung**; hệ thống giao máy khả dụng cho cư dân đủ điều kiện theo thứ tự, thay vì đặt lịch trước hoặc đặt giờ nhắc.

## Tài liệu khởi đầu

- [Phân tích nghiệp vụ và phạm vi MVP](docs/phan-tich-nghiep-vu.md): vai trò, quy tắc, tình huống biên, quyết định cần chốt.
- [Luồng trạng thái và quy tắc xử lý](docs/luong-trang-thai.md): vòng đời lượt giặt, hàng đợi, máy và cách xử lý đồng thời.
- [Lộ trình triển khai](docs/lo-trinh-trien-khai.md): thứ tự xây dựng, kiểm thử và tiêu chí nghiệm thu.
- [Trải nghiệm và tình huống biên](docs/trai-nghiem-va-tinh-huong-bien.md): thao tác trên điện thoại, phản hồi lỗi, trường hợp mất mạng/đến sớm/vắng mặt.
- [Rà soát trước khi lập trình](docs/ra-soat-truoc-khi-lap-trinh.md): mâu thuẫn cần giải quyết, mặc định đề xuất, ca biên và sáu quyết định cần xác nhận.
- [Mở rộng nghiệp vụ](docs/mo-rong-nghiep-vu.md): gỡ/khôi phục cư dân, thu hồi lời mời, đổi lượt, ETA, QR/trang máy, chat tòa, nhật ký hoạt động và snapshot vận hành.

## Định hướng

- Bản đầu chỉ hỗ trợ máy thường: mặc định mỗi người giặt mang và đặt chậu riêng cạnh máy; web nhắc việc này, không xây luồng xử lý thiếu/cho mượn chậu. Cư dân nhập số phút trên bảng điều khiển khi bắt đầu. Đồng hồ web về 0 không chứng minh máy đã dừng.
- Chỉ người được duyệt trong tòa mới được vào hàng và thao tác; QR mở đúng trang máy, **không** tự cấp quyền sử dụng máy. Giới hạn lượt theo **tài khoản**, không theo phòng. Tòa thu phí dịch vụ cố định theo tháng ngoài hệ thống; web không tính, hiển thị hay thu phí.
- Thời gian dự kiến là khoảng tham khảo, không phải lời hứa nhận được máy đúng giờ.
- Kênh chat theo tòa để cư dân trao đổi khi phát sinh vướng mắc; **chat không thay thế các nút xác nhận bàn giao, báo máy còn chạy hay cập nhật trạng thái hàng/máy**.
- Khi vào hàng, cư dân chọn **Sẵn sàng nhận máy** hoặc **Chưa sẵn sàng**; trạng thái có thể đổi bằng một nút ngay trên trang tòa. Hệ thống chỉ giao cho người đang sẵn sàng theo thứ tự hàng, bỏ qua người chưa sẵn sàng mà không xóa vị trí của họ. Nếu không ai sẵn sàng, máy chờ chứ không đếm hạn cho ai.
- Khi hệ thống giao máy cho người sẵn sàng, hạn bắt đầu giặt 8 phút chạy ngay từ thời điểm giao, không đợi họ lên xác nhận máy. Nếu họ lên và báo máy chưa dùng được trong hạn, lượt giữ được giải phóng và họ được trả về **cùng hàng đợi theo mốc thứ tự khi được giao**, không có vé ưu tiên nhảy lên đầu về sau. Cửa sổ tự lấy 10 phút diễn ra trước khi giao lượt kiểm tra.

## Giới hạn mật khẩu

Đăng ký yêu cầu ít nhất12ký tự và tối đa72byteUTF-8 do BCrypt; ký tự tiếng Việt có thể chiếm nhiều byte. Frontend hiển thị lỗi tại trường nhập và Java kiểm tra trước khi băm, không cắt mật khẩu. Đăng nhập tài khoản hiện có vẫn giữ hợp đồng cũ, không tự thay mật khẩu hoặc dữ liệu.

## Thông báo đến lượt trên thiết bị

Web Push hỗ trợ Chrome PC và iPhone/iPad iOS 16.4+ khi thêm web vào Màn hình chính. Bật riêng từng thiết bị trong **Tài khoản → Thông báo đến lượt**. Java gửi sau khi giao lượt kiểm tra máy thành công và nhắc lấy đồ tại giờ giặt xong dự kiến; thông báo không xác nhận máy đã dừng hoặc trống. Backend cần cấu hình VAPID; Render Free ngủ có thể làm chậm job. Xem [hướng dẫn Web Push](docs/web-push.md) để cấu hình, bật trên iPhone và kiểm thử thiết bị thật.

## Khởi chạy mã nguồn

Đây là **bài tập lớn Java**: nghiệp vụ hướng đối tượng, phân quyền, khóa giao dịch theo tòa và API nằm trong `backend/` (**Java 21 + Spring Boot 3.5.7 + Maven + H2**). Next.js/React/TypeScript ở `src/` là giao diện web và cầu nối API phía server qua địa chỉ loopback (`JAVA_API_ORIGIN`, mặc định `http://127.0.0.1:8080`).

Các luồng đã hoàn thiện và nối đồng bộ giữa Next.js và Java:
- Đăng ký/đăng nhập/đăng xuất bằng session (`JSESSIONID`) + Spring CSRF qua opaque session bridge (`laundry_session`).
- Tạo và xem tòa, quản lý chọn số máy (1–30), thêm máy, bật/tắt bảo trì, xác nhận máy trống tại chỗ (`confirm-free`).
- Tạo/thu hồi lời mời 7 ngày, duyệt thành viên, phân quyền nhiều quản lý (chặn hạ quyền quản lý cuối cùng), gỡ và khôi phục cư dân.
- Hàng đợi chung, bật/tắt Sẵn sàng, tự động cấp máy và giữ lượt 8 phút (đồng bộ giờ server `serverNow`), xác nhận kiểm tra tại máy (`confirm-check`), nhường lượt (`yield`), báo máy lỗi kỹ thuật (`unusable`).
- Bắt đầu mẻ giặt (1–360 phút, chọn `ALLOW_TRANSFER` hoặc `SELF_PICKUP`), tự lấy đồ sớm (`pickup`), chuyển đồ bàn giao (`transfer`), cập nhật phút còn lại (`remaining`), báo máy còn chạy (`report-running`) và quản lý xử lý sự cố (`CLEARED` / `DEFER` / `MAINTENANCE`).
- Ước tính khoảng giờ tới lượt (ETA), lời mời đổi lượt trong hàng (10 phút, tách đang chờ / đã gửi / lịch sử), trang chi tiết từng máy kèm mã QR SVG, kênh chat tòa nhà (cooldown 5s, báo cáo/ẩn tin nhắn, lưu 30 ngày) và nhật ký hoạt động quản trị (lưu 90 ngày).

```powershell
# Terminal 1: API Java (http://127.0.0.1:8080)
mvn -f backend/pom.xml spring-boot:run
# (Nếu đường dẫn thư mục chứa dấu tiếng Việt trên Windows, đóng gói và chạy JAR):
mvn -f backend/pom.xml package -DskipTests
java -jar backend/target/shared-laundry-backend-0.1.0-SNAPSHOT.jar

# Kiểm thử Java
mvn -B -f backend/pom.xml clean test

# Terminal 2: Giao diện Next.js (http://localhost:3000)
npm ci
npm run dev
# (Nếu môi trường Windows dùng WASM SWC fallback thì chạy với Webpack):
npx next dev --webpack

# Kiểm tra tài liệu, lint, typecheck và unit/DOM test Frontend
npm run check
```

H2 lưu file trong `.data/` của thư mục **đang chạy lệnh** (chạy từ gốc repo thì là `<repo>/.data/`); dữ liệu này không được commit. Chi tiết API và giới hạn bản thử ở [backend/README.md](backend/README.md). Bản hiện tại phục vụ môi trường cục bộ, chưa triển khai công khai lên Internet.
