# Lộ trình triển khai

## Giai đoạn 0 — Chốt nghiệp vụ và thiết kế

- Mốc 8 phút đã chốt: tính từ lúc giao cho **người đang sẵn sàng**, không chờ họ lên xác nhận; người chưa sẵn sàng được giữ vị trí nhưng không nhận máy. Giới hạn theo **tài khoản**; mọi người giặt mang chậu riêng; máy chạy quá dự kiến có phút còn lại thì dời mốc kiểm tra thay vì mặc định hỏng. Trước khi code luồng thực, chốt các câu còn mở trong [rà soát trước khi lập trình](ra-soat-truoc-khi-lap-trinh.md), đặc biệt thứ tự khôi phục khi có đổi lượt xen kẽ.
- Chọn nền tảng đăng nhập và phương thức thông báo. Vẽ màn hình di động: trang tòa, hàng đợi, máy/QR, đổi lượt, quản lý thành viên và sự cố.
- Thiết kế dữ liệu cho tòa, thành viên/phòng, máy, yêu cầu giặt, lượt giữ (lưu mốc vị trí trước khi giao để khôi phục khi lỗi), lời mời đổi, thông báo và nhật ký sự kiện. Không tạo hệ thống phiếu ưu tiên nhảy lên đầu.

## Giai đoạn 1 — Nền tảng

- Đăng nhập, tạo tòa, link mời có thể thu hồi, yêu cầu tham gia/duyệt/gỡ cư dân.
- Thêm/sửa máy, tạo QR, trang chi tiết từng máy; phân quyền ở máy chủ và kiểm tra mọi thao tác đúng tòa.
- Hiển thị trạng thái máy và yêu cầu giặt của bản thân trên điện thoại.

## Giai đoạn 2 — Hàng đợi và giao máy

- Tham gia/rời hàng, chọn/bật/tắt Sẵn sàng khi đang chờ; giữ vị trí người chưa sẵn sàng nhưng bỏ qua họ khi giao. Chống **một tài khoản** có hai yêu cầu chưa hoàn tất trong cùng tòa; không chặn người cùng phòng dùng tài khoản riêng.
- Bộ cấp phát theo tòa với giao dịch nguyên tử, chỉ xét người sẵn sàng; giữ máy 8 phút cấu hình kể từ lúc giao, nhường lượt, hết hạn tự động và thông báo trong web. Máy chờ khi không ai sẵn sàng. Ở giai đoạn này chỉ thử với máy đã được xác nhận trống; **không đưa cấp máy theo giờ xong dự kiến vào vận hành thật** trước khi hoàn thành xử lý bàn giao/lỗi ở giai đoạn 3.
- Ước tính khoảng giờ nhận máy, tách vị trí trong hàng khỏi số người sẵn sàng phía trước; xử lý thiếu dữ liệu và trường hợp nhiều máy trống gần cùng lúc. Thiết kế thẻ lượt cá nhân một chạm theo [trải nghiệm và tình huống biên](trai-nghiem-va-tinh-huong-bien.md).

## Giai đoạn 3 — Giặt, bàn giao, sự cố

- Bắt đầu giặt với số phút và lựa chọn bàn giao; nhắc mang chậu riêng, không thêm bước xác nhận chậu; hiển thị giờ dự kiến và nhắc kiểm tra.
- Tự lấy trong 10 phút cấu hình, lấy sớm, xác nhận bàn giao đồ; báo máy còn chạy với phút trên bảng để cập nhật mốc kiểm tra và khôi phục vị trí cũ trong cùng hàng.
- Trang máy tập trung vào bắt đầu giặt, lấy/chuyển đồ và báo máy còn chạy/hỏng; không có luồng xử lý thiếu hoặc cho mượn chậu. Quản lý xử lý máy hỏng thực sự, máy không rõ giờ còn lại hoặc bảo trì.

## Giai đoạn 4 — Đổi lượt và hoàn thiện

- Mời đổi hai vị trí, đồng ý/từ chối/hủy/hết hiệu lực; hiển thị kết quả dự kiến trước khi mời.
- Kênh chat theo tòa cho thành viên đã duyệt để trao đổi chung; quyền truy cập giới hạn đúng tòa, có chống spam và cách báo nội dung không phù hợp. Chat không thay các nút thao tác hàng hoặc máy; không thiết kế chat riêng cho chậu.
- Kiểm thử khả năng dùng trên điện thoại, độ trễ mạng, múi giờ, thông báo trễ, lịch sử thay đổi và khả năng phục hồi job nền.

## Kịch bản nghiệm thu trọng yếu

1. Một máy trống, hàng rỗng: người đầu chọn **Sẵn sàng** được nhận máy ngay; nếu chọn **Chưa sẵn sàng**, giữ vị trí nhưng máy không giao. Hai thao tác tham gia đồng thời không cùng nhận máy.
2. Hai máy trống, ba người chờ: đúng hai người **đang sẵn sàng đầu tiên theo thứ tự hàng** được hai máy; người chưa sẵn sàng giữ nguyên vị trí, máy dư chờ khi hết người sẵn sàng.
3. A → B → C → D: A và D đồng ý đổi → D → B → C → A; B hoặc D đã rời/được giao trước khi đồng ý thì không đổi.
4. Người giữ máy nhường lúc còn hạn: máy giao tiếp; người giữ không bắt đầu được nữa. Khi bắt đầu và hết hạn cùng lúc chỉ một trạng thái được ghi.
5. Máy đến giờ dự kiến nhưng thực tế còn chạy: giao lượt kiểm tra và bắt đầu 8 phút; người tới báo trong hạn và nhập phút còn lại từ bảng máy thì khôi phục vị trí, tạm ngừng giao máy đến mốc mới, sau mốc chỉ giao kiểm tra lại; nếu thời gian không rõ hoặc tiếp tục chạy quá mốc mới thì quản lý xử lý. Không tự coi chạy quá giờ là hỏng.
6. Ưu tiên tự lấy: người trước xác nhận lấy sớm thì có thể bàn giao sớm; mọi người được nhắc mang chậu riêng kể cả chọn tự lấy. Không kiểm thử quy trình thiếu chậu vì ngoài phạm vi ứng dụng.
7. Thông báo bị trễ hoặc trình duyệt đóng: mở lại web vẫn hiển thị trạng thái/hạn đúng theo máy chủ.
8. Cư dân ở tòa A không đọc hay sửa lượt/máy của tòa B dù biết URL hoặc QR.
9. A lỡ hạn, B chưa sẵn sàng, C sẵn sàng: giao C, B giữ chỗ; B bật sẵn sàng sau đó không thu hồi máy của C, được xét cho máy kế tiếp.
10. Máy trống nhưng không ai sẵn sàng: không tạo lượt giữ và không khởi động 8 phút; người đầu tiên bật sẵn sàng được xét ngay theo thứ tự người hiện đang sẵn sàng.
11. Bật/tắt sẵn sàng đồng thời với cấp máy: chỉ một kết quả nguyên tử; nếu đã được giao, hiển thị nút Nhường lượt thay vì cho tắt sẵn sàng. Đổi lượt không làm thay đổi trạng thái sẵn sàng của hai người.
12. Bấm Bắt đầu đúng sát hạn trong mạng chậm hoặc gửi lặp: chỉ thời điểm máy chủ nhận yêu cầu xác định hợp lệ; không tạo hai mẻ giặt, hiển thị kết quả thật khi kết nối lại.
13. Hàng A → B → C, A nhận máy rồi báo lỗi trong hạn: phục hồi A trước B và C; A tắt Sẵn sàng thì B được xét máy khác, A bật lại thì không lấy máy đã giao cho B và được xét trước C còn chờ.
14. A → B → C, A chưa sẵn sàng, B được giao, sau đó A và C đổi lượt thành C → A: khi B báo lỗi, kiểm thử quy tắc thứ tự được duyệt (đề xuất giữ khóa: C → B → A). Không thể đồng thời giữ B sau A và trước C theo quan hệ cũ.
15. Người phía trước đã khôi phục vị trí sau lỗi và đang chưa sẵn sàng bật lại: ETA người phía sau được tính lại, có thông báo khi dịch đáng kể; khoảng giờ ban đầu không được trình bày như cam kết cố định.
16. Hai tài khoản hợp lệ cùng phòng có thể vào hàng và giặt riêng; một tài khoản không thể tạo yêu cầu mới khi yêu cầu cũ đang giặt hoặc chưa bàn giao.
18. Người được giao báo máy còn 12 phút trên bảng: giữ vị trí, máy không bị gắn hỏng, ETA dời; tới mốc mới mời người sẵn sàng kiểm tra lại; nếu vẫn chạy quá mốc mới, quản lý xử lý.

## Tiêu chí hoàn thành MVP

Một tòa thử nghiệm có thể cấu hình số máy riêng (bản thử hỗ trợ 1–30, tòa nhỏ thường 1–3), cư dân được duyệt xem vị trí và ETA có điều kiện, bật/tắt sẵn sàng trong lúc chờ mà không mất chỗ, thao tác bàn giao trên điện thoại; quản lý xử lý máy lỗi; không trùng lượt giữ hoặc mất ưu tiên khi xảy ra thao tác đồng thời. Chỉ giao cho người đang sẵn sàng theo giờ dự kiến để chống người quên lên; chỉ cho bắt đầu giặt sau khi người được giao xác nhận tình trạng máy tại chỗ. Máy đã được báo lỗi phải chờ xử lý, không tự khai báo trống.
