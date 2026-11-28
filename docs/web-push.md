# Thông báo đến lượt trên iPhone và Chrome PC

## Phạm vi

Web Push báo khi Java giao **lượt kiểm tra máy** thành công. Đây không phải xác nhận máy trống, không thay thao tác kiểm tra thực tế và không thay đổi hạn giữ 8 phút. Bấm thông báo mở trang tổng quan đúng tòa; web vẫn yêu cầu đăng nhập và quyền thành viên.

Thông báo trong trang tiếp tục hoạt động độc lập. Bản này chưa gửi nhắc sắp hết hạn, chưa báo mọi sự kiện giặt/chat/đổi lượt và không có hộp thư đã đọc đồng bộ thiết bị. Không hứa giao tức thời hoặc đúng một lần: mạng, hệ điều hành, Focus và nhà cung cấp push có thể trì hoãn; gửi lại khi kết quả mạng không rõ có thể trùng (dùng tag theo hold hoặc mẻ để gộp khi trình duyệt hỗ trợ).

## Nhắc lấy đồ theo giờ dự kiến

Dùng cùng đăng ký và quyền Web Push, không cần bật lại nếu đã đăng ký. Khi mẻ đang ACTIVE đến `estimatedEndAt`, gửi **“Đã đến giờ giặt xong dự kiến”** cho chủ mẻ, nhắc lên kiểm tra và lấy đồ **nếu máy đã dừng**. Chế độ SELF_PICKUP cũng nhắc tại giờ dự kiến, không chờ hết cửa sổ10phút.

Một mẻ/thiết bị được ghi nhận một nhắc; retry khi lỗi mạng vẫn có thể trùng, dùng tag `pickup:<cycleId>`. Dời giờ dự kiến trước khi gửi thì chờ mốc mới; đã gửi thành công không nhắc lần hai cho cùng mẻ/thiết bị. Không nhắc mẻ đã lấy/chuyển đồ, hoàn tất hoặc cần quản lý. Giới hạn gửi trễ30phút từ mốc dự kiến hiện tại để không phát lại lịch sử sau khi server ngủ lâu. Không thay trạng thái máy/mẻ/hàng đợi và không coi việc nhận thông báo là xác nhận đã lấy đồ. Điều kiện được xác minh ngay trước khi job gửi; nếu hoàn tất/tắt thông báo trong lúc HTTP đã gửi thì không thu hồi chắc chắn được thông báo đang bay. Nhắc đã bị hủy vì sự cố/cần quản lý không tự phục hồi khi quản lý dời mốc; nhắc chưa gửi bị quá hạn30phút có thể theo mốc mới nếu còn số lần thử. Các bản ghi khử trùng nhắc được giữ bền vững, chưa có retention cleanup cho bảng này.

## Bật trên thiết bị

### iPhone

- iOS/iPadOS **16.4 trở lên**; iPhone 12 Pro Max hỗ trợ nếu đã cập nhật.
- Mở web HTTPS bằng Safari → Chia sẻ → **Thêm vào Màn hình chính**.
- Mở biểu tượng mới, đăng nhập, vào **Tài khoản → Thông báo đến lượt trên thiết bị → Bật thông báo đến lượt**, chọn Cho phép.
- Mở tab Chrome/Safari thông thường trên iPhone không thay thế bước cài lên Màn hình chính. Phiên đăng nhập của bản cài có thể khác tab trình duyệt.
- Nếu đã chặn, sửa quyền trong Cài đặt → Thông báo của ứng dụng rồi quay lại kiểm tra.

### Chrome máy tính

- Mở web HTTPS, đăng nhập → **Tài khoản → Bật thông báo đến lượt**.
- Cho phép thông báo ở Chrome và hệ điều hành. Không bắt buộc cài PWA; không bảo đảm nhận nếu thoát hẳn trình duyệt hoặc hệ điều hành hạn chế chạy nền.
- Mỗi thiết bị bật riêng. Tắt tại cùng mục; đăng xuất chủ động sẽ gỡ đăng ký nhận trên thiết bị trước khi kết thúc phiên. Nếu lỗi mạng/server khi gỡ, web báo lỗi thay vì giả vờ đã đăng xuất an toàn. Nếu phiên đã hết hạn (401), web vẫn kết thúc phiên cục bộ, thử hủy đăng ký trình duyệt và cảnh báo chưa xác minh được việc xóa trên server.
- Trên thiết bị dùng chung, đăng xuất trước khi chuyển người sử dụng. Quyền trình duyệt đã cấp không đồng nghĩa một tài khoản mới tự động được đăng ký; tài khoản mới phải bấm bật riêng. Thông báo đã được nhà cung cấp chấp nhận hoặc đang gửi không thể thu hồi tuyệt đối bằng thao tác tắt/đăng xuất; không đặt tên cư dân, token hoặc thông tin nhạy cảm trong nội dung khóa màn hình.

## Cấu hình máy chủ

Backend mặc định **tắt Web Push** khi chưa có cấu hình. Không cần khóa ở frontend hoặc biến `NEXT_PUBLIC_*`; khóa công khai được lấy qua API khi chạy.

Tạo cặp VAPID **một lần**, trên máy tin cậy:

```powershell
node scripts/generate-web-push-keys.mjs
```

Không chia sẻ/commit đầu ra chứa khóa riêng. Đặt các biến môi trường của Java (trong Render: Environment):

| Biến | Giá trị |
| --- | --- |
| `WEB_PUSH_PUBLIC_KEY` | Khóa công khai base64url, điểm P-256 không nén |
| `WEB_PUSH_PRIVATE_KEY` | Khóa riêng base64url cùng cặp |
| `WEB_PUSH_SUBJECT` | `mailto:` liên hệ hoặc URL HTTPS do người triển khai kiểm soát |
| `APP_ORIGIN` | Origin HTTPS công khai của web, dùng cho QR; không phải URL API Java |

Không dùng địa chỉ email giả của người dùng hoặc `https://localhost` làm VAPID subject; Apple có thể từ chối subject localhost. Giữ nguyên cặp khóa qua các lần deploy; đổi khóa đòi hỏi đăng ký lại trên thiết bị. Không gửi khóa riêng xuống trình duyệt.

`Dockerfile` phải chép `public/` và cấu hình Next sang image để `/sw.js` và PNG icons có mặt ở production. Service worker chỉ xử lý push/click, không cache trang đăng nhập, dữ liệu API hoặc tạo chế độ offline giả.

Render Free có thể ngủ khi không có truy cập; các job giao máy/gửi push khi đó không chạy đúng thời điểm. Push không tự đánh thức hay thay thế backend chạy liên tục. PostgreSQL bền vững được khuyến nghị cho đăng ký/outbox; H2 trên filesystem tạm không bảo đảm giữ dữ liệu qua deploy.

## Luồng kỹ thuật và giới hạn dữ liệu

- Browser đăng ký service worker `/sw.js`, xin quyền **chỉ sau thao tác bấm**, tạo PushSubscription bằng VAPID public key.
- Next routes `/api/push/config`, `/api/push/subscriptions` và `/api/push/subscriptions/status` dùng opaque session bridge; mutation vẫn kiểm tra same-origin và Spring CSRF.
- Java sở hữu đăng ký theo tài khoản; endpoint là dữ liệu nhạy cảm, không ghi vào log hoặc trả danh sách của người khác. Chỉ chấp nhận endpoint HTTPS của các nhà cung cấp push được hỗ trợ, không cho gửi tới URL tùy ý.
- Allocation ghi outbox cùng transaction tạo hold; rollback không được để lại thông báo giả. Job gửi mạng ngoài transaction khóa tòa, có retry/giới hạn, kiểm tra lượt và quyền còn hiệu lực; endpoint chết được dọn.
- Đăng ký có thể sống lâu hơn phiên đăng nhập web để nhận khi đóng trang; không tự coi hết TTL opaque session là đã tắt push. Đăng xuất chủ động và nút tắt gỡ đăng ký thiết bị. Chặn quyền trong hệ điều hành cũng ngăn hiển thị; không thay thế thu hồi server trên thiết bị dùng chung.

## Kiểm thử cần làm khi triển khai

1. Cấu hình VAPID, deploy bản đã review; xác nhận `/manifest.webmanifest`, `/sw.js`, `/icons/apple-touch-icon.png` trả đúng và service worker không bị cache cứng.
2. iPhone thật: cài từ Safari, cấp quyền từ nút, khóa màn hình; Chrome PC: bật cùng tài khoản, chuyển tab. Tạo tài khoản/tòa thử không chứa dữ liệu thật.
3. Xác nhận máy trống và cho tài khoản thử sẵn sàng để Java giao lượt; kiểm tra cả hai thiết bị nhận, bấm mở đúng tòa, UI vẫn yêu cầu kiểm tra máy thực tế.
4. Tắt trên một thiết bị và thử lượt mới; thiết bị còn lại vẫn nhận. Thử đăng xuất, đăng nhập tài khoản khác và bật lại, không gửi nhầm tài khoản cũ.
5. Kiểm tra mất mạng, chặn quyền, hold đã bắt đầu/nhường/hết hạn trước khi gửi, và rollback allocation không phát thông báo.
6. Bắt đầu mẻ thử1phút ở cả ALLOW_TRANSFER/SELF_PICKUP: tại giờ dự kiến nhận nhắc lấy đồ (không đợi10phút); lấy sớm/chuyển đồ thì không nhắc. Dời mốc trước khi gửi phải đợi mốc mới, không phát nhắc cho mốc cũ hoặc mẻ đã hoàn tất.

Unit/DOM/MockMvc và transport giả không chứng minh iOS thật đã nhận. Không báo hoàn tất nghiệm thu push trên điện thoại cho đến khi thử qua HTTPS với khóa cấu hình thực tế.
