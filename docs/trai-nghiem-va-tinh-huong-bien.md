# Trải nghiệm cư dân và các tình huống biên

## 1. Nguyên tắc giao diện

- **Sẵn sàng nghĩa là có thể lên và bắt đầu trong 8 phút bất cứ khi nào được giao**, kể cả khi máy trống sớm hơn giờ dự kiến. Không ngầm suy ra sự sẵn sàng từ việc mở web, quét QR, bật thông báo hay vị trí điện thoại.
- Khi bấm **Vào hàng**, hiển thị hai lựa chọn rõ ràng: “Sẵn sàng nhận máy trong 8 phút” và “Chưa sẵn sàng — giữ chỗ, chưa được giao máy”. Không tự mặc định chọn sẵn sàng; ghi nhận lựa chọn rõ ràng của cư dân. Khi có máy trống, cảnh báo ngay trong màn hình này rằng chọn sẵn sàng có thể khiến đồng hồ 8 phút bắt đầu **ngay lúc tham gia**.
- Trên trang tòa, ghim thẻ lượt của tôi: `Thứ 3 trong hàng · 1 người sẵn sàng trước bạn · Sẵn sàng: Có/Không`. Có nút một chạm để đổi sẵn sàng khi **còn đang chờ**, cùng nút Rời hàng riêng biệt có xác nhận. Giải thích “Tắt Sẵn sàng không làm mất vị trí; người phía sau có thể nhận máy trước bạn”.
- Khi đã **được giao**, thay thẻ bằng `Máy 2 · Bắt đầu trước 20:16 · còn 07:42`, nút chính “Mở máy 2 / Quét QR”, nút phụ “Nhường lượt”, “Máy chưa dùng được”. Không cho tắt sẵn sàng như cách né hạn lúc này; muốn thôi nhận thì nhường lượt.
- Trước giờ dự kiến có thể gửi gợi ý “Bạn còn muốn nhận máy trong 8 phút khi đến lượt không?” với nút chuyển sẵn sàng ngay tại web. Đây là **gợi ý**, không phải nhắc theo giờ do người dùng chọn và không tự đổi cờ nếu họ không trả lời. Thông báo có thể trễ/mất; trang tòa là nguồn thông tin chính.
- Khi không ai sẵn sàng mà có máy có thể giao: hiển thị `Máy đang chờ người sẵn sàng`; người trong hàng có thể bật sẵn sàng để được xét ngay. Không hiển thị đồng hồ đếm ngược giả cho người chưa được giao.
- Ở màn hình máy có nút mở chat tòa cho những trao đổi chung; hành động **Đã lấy đồ**, **Đã bàn giao đồ**, **Máy còn chạy** và **Chưa dùng được máy** tách khỏi chat. Không thêm nút liên quan thiếu chậu hoặc cho mượn chậu. Chat không tự thay đổi trạng thái máy hay gia hạn 8 phút.
- Thời gian trên máy giặt là **dự kiến**. Hiển thị “Thứ 3 trong hàng” khác với “còn 1 người sẵn sàng trước bạn”; nếu chưa đủ dữ liệu, ghi “Chưa ước tính được giờ nhận máy”. Khi chưa sẵn sàng, không hứa một giờ nhận máy.
- Form bắt đầu giặt cho nhập số phút trên bảng điều khiển, chọn chế độ bàn giao và nhắc **mang/đặt chậu riêng cạnh máy**. Không có bước xác nhận chậu hay nhánh cho mượn chậu. Người nhận chỉ xác nhận đã dừng và bàn giao đồ sau khi thực sự kiểm tra máy. Số người cùng phòng không ảnh hưởng quyền vào hàng của từng tài khoản.

## 2. Các tình huống phải xử lý

| Tình huống | Quy tắc xử lý / phản hồi đề xuất |
|---|---|
| A lỡ hạn, B chưa sẵn sàng, C sẵn sàng | Đóng lượt A; bỏ qua B nhưng giữ vị trí; giao C và bắt đầu 8 phút cho C. B không nhận hạn và không bị phạt. |
| A lỡ hạn, không ai khác sẵn sàng | Không giao; máy chờ. Khi người trong hàng bật sẵn sàng hoặc người mới vào hàng chọn sẵn sàng, xét lại ngay theo thứ tự **những người đang chờ và sẵn sàng**. |
| B chưa sẵn sàng ở đầu hàng, C phía sau được giao rồi B mới bật sẵn sàng | Không thu hồi máy C; B đứng trước những người chờ sau B cho **máy đủ điều kiện kế tiếp**. Nếu còn một máy khác đủ điều kiện, có thể giao B ngay. |
| Người chờ bật Sẵn sàng đúng lúc máy khả dụng | Giao dịch nguyên tử: hoặc cờ được bật và người đó được xét trong lượt cấp phát, hoặc họ được xét ở lần cấp phát kế tiếp; không giao trùng máy. Cập nhật màn hình sau commit. |
| Người chờ tắt Sẵn sàng đúng lúc được giao | Thao tác nào thắng giao dịch quyết định: nếu đã được giao, không cho tắt, hiển thị máy và nút Nhường lượt; nếu tắt trước, không giao. Không che một lượt giữ đang chạy. |
| Người sẵn sàng nhưng quên tắt trước khi máy về sớm | Vẫn được giao và hạn 8 phút bắt đầu ngay. Họ có thể Nhường lượt ngay; hết hạn thì mất vị trí theo quy tắc đã chốt. Giao diện phải giải thích hậu quả trước khi chọn Sẵn sàng. |
| Người chưa sẵn sàng đứng đầu rất lâu | Tiếp tục giữ vị trí nhưng không chặn máy; người sau sẵn sàng vẫn nhận được máy. Có thể gợi ý rời hàng sau thời gian dài, nhưng **không tự xóa lượt** ở MVP. |
| Có máy trống, người đang chờ chưa sẵn sàng và người mới vào chọn sẵn sàng | Người mới được giao (vì người cũ chưa sẵn sàng); người cũ vẫn giữ vị trí, có thể nhận máy tiếp theo khi bật sẵn sàng. Xác nhận điều này trên màn hình Vào hàng. |
| Nhiều máy cùng khả dụng, một số người chưa sẵn sàng | Ghép các máy với người đang sẵn sàng theo thứ tự hàng, mỗi người tối đa một máy; nếu dư máy thì chờ. Cờ sẵn sàng của người bị bỏ qua không tự thay đổi. |
| Đổi lượt khi một bên chưa sẵn sàng | Cho đổi vị trí của đúng hai người nếu cả hai vẫn còn chờ; mỗi người **giữ nguyên cờ sẵn sàng**. Hiển thị lại ETA và vị trí, không ngầm bật sẵn sàng sau khi đổi. |
| Người được khôi phục vị trí sau máy lỗi rồi tạm chưa sẵn sàng | Họ giữ vị trí trong **cùng hàng**, không có phiếu ưu tiên riêng; người khác đang sẵn sàng vẫn được dùng máy. Khi bật lại, xét theo vị trí hiện tại, không vượt người vốn đứng trước hoặc thu hồi máy đã giao. |
| Đã giao máy, người được giao báo vẫn chạy và bảng máy hiển thị phút còn lại | Ghi nhận phút còn lại; hủy giữ máy, khôi phục mốc vị trí của họ và tạm ngừng giao máy tới mốc mới; sau đó chỉ giao người sẵn sàng lên kiểm tra, không tự coi đã dừng. Không mặc định hỏng. Nếu không rõ phút hoặc tiếp tục quá mốc mới, báo quản lý. |
| A được giao máy lỗi, trước đó hàng là A → B → C | Khôi phục A → B → C; nếu A tắt Sẵn sàng thì B có thể nhận máy khác. Khi A bật lại, A đứng trước C còn chờ nhưng không giành lại máy của B. Nếu B đã từng đứng trước A theo thứ tự hàng trước khi giao, A không vượt B. |
| A được khôi phục sau lỗi, tắt Sẵn sàng rồi bất ngờ bật lại | Tính lại ETA của người phía sau; khoảng giờ dự kiến phải ghi là tính theo trạng thái Sẵn sàng hiện tại; báo khi A bật lại làm thay đổi đáng kể, không hứa khoảng giờ luôn bao trùm mọi tình huống. Không âm thầm gắn cho A quyền chen lên đầu; không cam kết ETA của người khác giữ nguyên. |
| Giao theo giờ dự kiến nhưng không ai đến kiểm tra, hết 8 phút | Người giữ mất lượt; nếu có người khác sẵn sàng thì có thể giao họ đến kiểm tra theo dữ liệu web, **không** ghi máy đã dừng thực tế. Nếu người mới báo lỗi thì khóa máy. |
| Cư dân quét QR sai máy hoặc mở link cũ | Hiển thị số máy, tòa và người đang được giao; cấm bắt đầu trên máy không phải lượt của họ. QR không chứng minh hiện diện vật lý vì có thể chụp hoặc chia sẻ. |
| Mạng chậm/mất đúng lúc bấm Bắt đầu hoặc báo lỗi | Không dựa vào màn hình để kết luận đã thành công; hiển thị “Đang gửi” và cho kiểm tra trạng thái từ máy chủ khi nối lại. API chống gửi lặp, ưu tiên thời điểm **máy chủ nhận yêu cầu** so với hạn. Nếu nhận sau hạn thì từ chối, giải thích và không khởi động mẻ giặt trên web. |
| Đã được giao, chỉ còn vài giây, quét QR hoặc nhập phút quá lâu | Hiển thị hạn rõ ràng trên toàn luồng; không tự gia hạn vì mở form. Nếu hết hạn trước khi gửi thành công thì từ chối, yêu cầu người dùng không vận hành máy khi web chưa ghi nhận và liên hệ quản lý nếu máy đã được khởi động thực tế. |
| Máy bị quản lý đánh dấu bảo trì trong khi đang giữ | Thu hồi lượt giữ và thông báo người nhận; khôi phục vị trí hàng trước lúc giao như trường hợp máy lỗi. Không giao máy bảo trì cho người tiếp theo. Nếu đang giặt, không xóa mẻ giặt thực tế; yêu cầu quản lý xử lý. |
| Hai người cùng phòng ở ghép dùng hai tài khoản đã duyệt | Cả hai được xếp và giặt riêng; chỉ chặn **mỗi tài khoản** tạo yêu cầu chưa hoàn tất thứ hai trong tòa. Tiền dịch vụ theo số người cùng phòng không làm hai tài khoản phải chia sẻ một lượt. |
| Mất thông báo hoặc đóng web khi được giao | Hạn vẫn chạy theo máy chủ. Khi mở lại, tải trạng thái thật: còn hạn thì hiển thị máy/hạn; đã hết hạn thì thông báo mất lượt và nút vào hàng lại; không tuyên bố push luôn tới. |
| Tác vụ nền xử lý trễ, server khởi động lại | Xử lý bù theo thời điểm hạn gốc, idempotent. Không kéo dài hạn vì job chạy muộn; không giao cùng máy hai lần. Nếu đã hết hạn từ trước, giao cho người sẵn sàng ở thời điểm xử lý và công bố **hạn mới từ lúc giao thực tế**, không lùi giờ giao về quá khứ. |
| Chủ lượt nhường và người đứng sau chưa sẵn sàng | Giữ vị trí cho người chưa sẵn sàng, chỉ giao người đang sẵn sàng tiếp theo; nếu không có thì máy chờ. |

## 3. Các ranh giới chưa nên tự giả định

1. Có yêu cầu phải quét QR mới được bắt đầu giặt hay QR chỉ là đường dẫn tiện lợi? QR tĩnh không chống người ở xa thao tác; nếu cần chứng minh hiện diện, phải có phương án khác và đánh giá chi phí vận hành.
2. Máy vẫn chạy **có số phút còn lại trên bảng**: người tới kiểm tra ghi phút, máy tạm chờ mốc mới; tới hạn chỉ được giao người lên kiểm tra, không tự xác nhận đã dừng. Chỉ chuyển quản lý khi máy có dấu hiệu hỏng hoặc tình trạng không xác minh được. Không thiết kế luồng thiếu chậu.
3. Đã chốt: không dùng phiếu ưu tiên nhảy lên đầu. Người được khôi phục vị trí có thể tắt Sẵn sàng mà không mất vị trí như những người đang chờ khác. Khi họ bật lại, ETA người phía sau có thể đổi; cần hiển thị khoảng dự kiến và thông báo nếu dịch đáng kể. **Cách xác định vị trí khi có đổi lượt xen kẽ chưa chốt** (xem [rà soát trước khi lập trình](ra-soat-truoc-khi-lap-trinh.md)); ngưỡng “đáng kể” cũng chưa chốt.
4. Thời gian chờ quá lâu có tự đóng lượt hay không? MVP **không tự đóng**; nếu bổ sung phải có cảnh báo, thời gian gia hạn và quy định rõ ràng.
5. Thao tác đã bắt đầu máy giặt ngoài đời nhưng ghi vào web thất bại: cần quy trình báo quản lý và đối soát tình trạng máy thay vì tự tạo mẻ giặt giả hoặc im lặng cấp máy tiếp.
