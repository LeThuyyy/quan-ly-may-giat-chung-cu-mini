# Quản lý máy giặt chung cư mini

Dự án web ưu tiên giao diện điện thoại cho một tòa có khoảng 1–3 máy giặt chung. Mỗi tòa có **một hàng đợi chung**; hệ thống giao máy khả dụng cho cư dân đủ điều kiện theo thứ tự, thay vì đặt lịch trước hoặc đặt giờ nhắc.

## Tài liệu khởi đầu

- [Phân tích nghiệp vụ và phạm vi MVP](docs/phan-tich-nghiep-vu.md): vai trò, quy tắc, tình huống biên, quyết định cần chốt.
- [Luồng trạng thái và quy tắc xử lý](docs/luong-trang-thai.md): vòng đời lượt giặt, hàng đợi, máy và cách xử lý đồng thời.
- [Lộ trình triển khai](docs/lo-trinh-trien-khai.md): thứ tự xây dựng, kiểm thử và tiêu chí nghiệm thu.
- [Trải nghiệm và tình huống biên](docs/trai-nghiem-va-tinh-huong-bien.md): thao tác trên điện thoại, phản hồi lỗi, trường hợp mất mạng/đến sớm/vắng mặt.
- [Rà soát trước khi lập trình](docs/ra-soat-truoc-khi-lap-trinh.md): mâu thuẫn cần giải quyết, mặc định đề xuất, ca biên và sáu quyết định cần xác nhận.

## Định hướng

- Bản đầu chỉ hỗ trợ máy thường: mặc định mỗi người giặt mang và đặt chậu riêng cạnh máy; web nhắc việc này, không xây luồng xử lý thiếu/cho mượn chậu. Cư dân nhập số phút trên bảng điều khiển khi bắt đầu. Đồng hồ web về 0 không chứng minh máy đã dừng.
- Chỉ người được duyệt trong tòa mới được vào hàng và thao tác; QR mở đúng trang máy, **không** tự cấp quyền sử dụng máy. Giới hạn lượt theo **tài khoản**, không theo phòng. Tòa thu phí dịch vụ cố định theo tháng ngoài hệ thống; web không tính, hiển thị hay thu phí.
- Thời gian dự kiến là khoảng tham khảo, không phải lời hứa nhận được máy đúng giờ.
- Kênh chat theo tòa để cư dân trao đổi khi phát sinh vướng mắc; **chat không thay thế các nút xác nhận bàn giao, báo máy còn chạy hay cập nhật trạng thái hàng/máy**. Chưa đánh giá ảnh tham khảo vì chưa nhận được ảnh đính kèm trong cuộc trò chuyện.
- Khi vào hàng, cư dân chọn **Sẵn sàng nhận máy** hoặc **Chưa sẵn sàng**; trạng thái có thể đổi bằng một nút ngay trên trang tòa. Hệ thống chỉ giao cho người đang sẵn sàng theo thứ tự hàng, bỏ qua người chưa sẵn sàng mà không xóa vị trí của họ. Nếu không ai sẵn sàng, máy chờ chứ không đếm hạn cho ai.
- Khi hệ thống giao máy cho người sẵn sàng, hạn bắt đầu giặt 8 phút chạy ngay từ thời điểm giao, không đợi họ lên xác nhận máy. Nếu họ lên và báo máy chưa dùng được trong hạn, lượt giữ được giải phóng và họ được trả về **cùng hàng đợi theo mốc thứ tự khi được giao**, không có vé ưu tiên nhảy lên đầu về sau. Nếu trong lúc giữ máy có người khác đổi lượt, cách áp dụng mốc thứ tự cần chốt theo [rà soát trước khi lập trình](docs/ra-soat-truoc-khi-lap-trinh.md). Cửa sổ tự lấy 10 phút diễn ra trước khi giao lượt; các mốc cấu hình theo tòa khi triển khai.

## Khởi chạy mã nguồn

Khung ban đầu dùng **Next.js + React + TypeScript**. Trang chủ là màn giới thiệu tĩnh, **chưa đăng nhập, chưa lưu dữ liệu hay cấp máy thật**. `src/domain/queue/queue.ts` mới là hàm thuần đề xuất ghép người đang sẵn sàng với máy đủ điều kiện; ứng dụng thực tế phải lưu giao dịch nguyên tử ở máy chủ, không dùng hàm này một mình để cấp lượt.

```powershell
npm ci
npm run dev
```

Mở `http://localhost:3000`. Kiểm tra trước PR bằng `npm run check` và `npm run build`. CI chạy cùng các bước này. Tài liệu nghiệp vụ vẫn có quyết định chưa chốt; xem [rà soát trước khi lập trình](docs/ra-soat-truoc-khi-lap-trinh.md) trước khi làm backend giao lượt/bàn giao.
