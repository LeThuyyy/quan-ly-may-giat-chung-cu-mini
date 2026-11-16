# Luồng trạng thái và quy tắc xử lý

Tài liệu này là mô hình đề xuất để hiện thực đặc tả, không thay thế các quyết định vận hành còn mở trong [phân tích nghiệp vụ](phan-tich-nghiep-vu.md).

## 1. Ba trạng thái độc lập

Không gộp trạng thái **máy** với trạng thái **lượt cư dân**: một máy có thể đang chạy mà đã quá giờ dự kiến, hoặc đã giao lượt đến kiểm tra nhưng chưa được xác nhận đủ điều kiện để bắt đầu giặt. Giao lượt dựa trên giờ dự kiến không phải là xác nhận máy đã trống thực tế. Khi hiện thực cần lưu riêng **mẻ giặt cũ/đồ còn chờ bàn giao**, **lượt giữ kiểm tra mới**, **tình trạng vận hành** và **điều kiện để mời người tới máy**; bảng dưới chỉ là trạng thái hiển thị tổng hợp. Xem [rà soát trước khi lập trình](ra-soat-truoc-khi-lap-trinh.md).

| Đối tượng | Trạng thái đề xuất | Chuyển tiếp chính |
|---|---|---|
| Máy (trạng thái hiển thị tổng hợp, không dùng làm một cột trạng thái duy nhất) | CÓ_THỂ_GIAO, GIỮ_LƯỢT, ĐANG_GIẶT, ƯU_TIÊN_TỰ_LẤY, CHỜ_MỐC_MỚI, CẦN_KIỂM_TRA, BẢO_TRÌ | Có thể giao → giữ → đang giặt → có thể giao lượt kiểm tra khi đến giờ dự kiến của chế độ cho chuyển đồ, hoặc ưu tiên tự lấy → có thể giao khi hết hạn/lấy sớm; báo còn chạy với phút trên bảng → chờ mốc mới → xét giao lượt kiểm tra, không tự khẳng định đã dừng; không rõ phút/thiếu chậu/hỏng → cần kiểm tra → quản lý xử lý → xét giao. Mẻ cũ còn chờ bàn giao và lượt kiểm tra của người mới có thể cùng tồn tại. |
| Yêu cầu giặt | ĐANG_CHỜ (kèm `sẵn_sàng: có/không`), GIỮ_MÁY, ĐANG_GIẶT, CHỜ_BÀN_GIAO, HOÀN_TẤT, ĐÃ_RỜI, HẾT_HẠN | Chỉ ĐANG_CHỜ + sẵn sàng mới được xét giao → giữ → đang giặt → chờ bàn giao → hoàn tất. Đổi sẵn sàng không đổi vị trí; rời/nhường/hết hạn kết thúc yêu cầu hiện tại. |
| Lời mời đổi lượt | CHỜ_TRẢ_LỜI, ĐỒNG_Ý, TỪ_CHỐI, ĐÃ_HỦY, HẾT_HIỆU_LỰC | Đồng ý chỉ có hiệu lực khi cả hai còn đang chờ, đúng tòa và vị trí hiện tại của người nhận vẫn phía sau. |

Những trạng thái hiển thị cho người dùng cần diễn giải bằng ngôn ngữ dễ hiểu: máy `CÓ_THỂ_GIAO` sau giờ dự kiến có thể hiển thị “Đến giờ dự kiến xong · Chờ người đến kiểm tra/bàn giao”, **không** hiển thị “Trống” khi chưa có xác nhận thực tế. Máy mới được xác nhận trống thì hiển thị “Trống”. Máy `GIỮ_LƯỢT` vẫn có thể đang chứa đồ của người trước, chờ người được giao kiểm tra và chuyển vào chậu trước khi bấm Bắt đầu.

## 2. Quy tắc cấp máy

Trong một giao dịch theo tòa: kiểm tra người chờ hợp lệ **và đang sẵn sàng** cùng máy đủ điều kiện **để giao lượt đến kiểm tra**; sắp máy theo mã máy ổn định nếu cùng lúc; sắp người theo **một thứ tự hàng duy nhất**, chỉ xét những người đang sẵn sàng, **bỏ qua nhưng giữ nguyên vị trí** người chưa sẵn sàng; không có hàng ưu tiên hay phiếu nhảy lên đầu; ghép từng cặp; tạo lượt giữ với hạn bắt đầu = thời điểm giao + 8 phút mặc định, loại người được giao khỏi hàng chờ, đánh dấu máy được giữ; vô hiệu lời mời đổi lượt có liên quan. Sau commit mới gửi thông báo và cập nhật các màn hình. Không chờ người nhận bấm xác nhận mới bắt đầu đồng hồ. Nếu không ai sẵn sàng, không tạo lượt giữ; máy ở trạng thái chờ người sẵn sàng.

Máy **không đủ điều kiện giao** nếu bảo trì, còn chạy và đang chờ mốc dự kiến mới, đang trong cửa sổ ưu tiên tự lấy hoặc đã được giữ. Máy đang giặt chỉ đủ điều kiện khi đã tới giờ **dự kiến** xong với chế độ cho chuyển đồ, hoặc người trước xác nhận đã lấy đồ, hoặc hết thời gian tự lấy theo nội quy. Đây là giao lượt để cư dân lên kiểm tra; không khẳng định máy thực tế đã dừng. Chỉ người được giao mới xác nhận tình trạng và bắt đầu giặt; nếu họ báo chưa dùng được trong hạn, khôi phục vị trí công bằng trong cùng hàng và tạm ngừng giao máy tới khi có cách xử lý. Thiếu chậu là vướng mắc bàn giao, không mặc định là máy hỏng hay phải gọi quản lý.

## 3. Hết hạn và nhường lượt

- Nhường lượt: xác nhận đúng chủ lượt, đúng trạng thái GIỮ_MÁY; đóng lượt giữ; nếu máy đủ điều kiện giao thì cấp cho **người đang chờ và sẵn sàng đầu tiên**, bỏ qua người chưa sẵn sàng. Không có ai sẵn sàng thì máy chờ, không đếm hạn cho ai.
- Hết 8 phút **kể từ lúc giao máy**: tác vụ xử lý có thể chạy lặp; chỉ đóng lượt nếu vẫn là lượt giữ hiện tại và thời gian máy chủ đã qua hạn, chưa bắt đầu giặt/chưa báo lỗi hợp lệ. Người quên lên mất lượt; chỉ giao tiếp nếu có người chờ **đang sẵn sàng**. Nếu không có thì máy chờ người sẵn sàng hoặc người mới vào hàng và chọn sẵn sàng (không coi đó là xác minh vật lý máy trống). Không để trạng thái giữ mồ côi.
- Bắt đầu giặt: chỉ đúng người được giao và trước hạn, sau khi xác nhận tại máy rằng đã dừng và đồ trước được bàn giao, được ghi thời lượng phút hợp lệ và chế độ bàn giao; chuyển máy và lượt sang đang giặt nguyên tử. QR mở đúng trang máy; nếu muốn bảo đảm cư dân ở gần máy, cần chốt cơ chế kiểm chứng thêm vì QR/link có thể được lưu hoặc chia sẻ.
- Nếu thao tác bắt đầu và tác vụ hết hạn đua nhau, chỉ một bên thắng; bên còn lại đọc trạng thái mới và trả thông báo phù hợp, không tạo hai mẻ giặt.

## 4. Đến giờ dự kiến và bàn giao

- Đến giờ xong dự kiến: với chế độ cho chuyển đồ, **nếu có người chờ đang sẵn sàng** thì giao lượt kiểm tra ngay và chạy hạn 8 phút; nếu không, máy chờ, không tạo hạn. Thời gian dự kiến trễ không biến thành kết quả đo thực. Với lựa chọn tự lấy, bắt đầu cửa sổ ưu tiên 10 phút (đề xuất tính từ giờ xong dự kiến mới nhất, không từ lúc job thực thi), **chưa giao lượt** trong cửa sổ này. Nếu có báo máy còn chạy trước khi cửa sổ bắt đầu, cập nhật giờ dự kiến rồi tính lại mốc 10 phút; nếu đã bắt đầu thì không âm thầm đặt lại hạn, phải báo rõ cho cư dân và xử lý mâu thuẫn trước khi giao.
- Trước khi giao lượt kiểm tra, nếu người đang giặt thấy bảng máy thay đổi thời lượng, họ có thể cập nhật số phút còn lại; hệ thống ghi lịch sử, điều chỉnh mốc dự kiến/cửa sổ tự lấy chưa bắt đầu và ETA. Sau khi đã giao lượt cho người khác, không âm thầm thu hồi hoặc gia hạn lượt giữ; người được giao kiểm tra và báo còn chạy trong hạn theo quy tắc bên dưới.
- Người giặt trước xác nhận đã lấy đồ: kết thúc cửa sổ tự lấy sớm và có thể giao lượt ngay; người được giao vẫn phải kiểm tra máy thực tế trước khi bắt đầu.
- Chế độ cho chuyển đồ: mặc định người giặt trước đã đặt chậu riêng cạnh máy. Người được **giao lượt** tới kiểm tra trong 8 phút; nếu máy đã dừng, chuyển đồ vào chậu của người trước, xác nhận bàn giao và thông báo cho họ rồi mới bắt đầu mẻ mới. Web không có nhánh xử lý thiếu hoặc cho mượn chậu.
- Khi báo “Chưa dùng được máy” trong hạn vì máy còn chạy hoặc có vấn đề kỹ thuật: ghi lý do; hủy lượt giữ; **khôi phục người đó vào cùng hàng** theo mốc thứ tự trước khi giao (trường hợp đổi lượt xen kẽ xem [rà soát trước khi lập trình](ra-soat-truoc-khi-lap-trinh.md)). Giữ nguyên cờ Sẵn sàng; không tạo phiếu ưu tiên riêng. Nếu bảng hiển thị phút còn lại hợp lệ, cập nhật mốc dự kiến, đưa máy sang CHỜ_MỐC_MỚI và không giao tới mốc đó; khi đến mốc, chỉ giao lượt **kiểm tra lại**, không tự xác nhận máy đã dừng. Nếu không rõ phút, máy có dấu hiệu hỏng hoặc tiếp tục chạy quá mốc mới, chuyển CẦN_KIỂM_TRA để xác minh. Khôi phục vị trí và chặn giao máy trong cùng giao dịch; không xây nhánh xử lý chậu.

## 5. Đổi lượt và đồng thời

Người A mời B đang phía sau, bất kể hai người đang sẵn sàng hay chưa. Lời mời không khóa hàng; khi B đồng ý, kiểm tra lại hai yêu cầu còn `ĐANG_CHỜ`, A vẫn trước B, lời mời còn hiệu lực và chưa bị hủy; hoán đổi khóa thứ tự của **đúng hai yêu cầu**, không đổi cờ sẵn sàng của từng người. Nếu một yêu cầu vừa được giao máy hoặc rời hàng, lời mời hết hiệu lực; sau khi người đã nhận máy báo lỗi và quay về hàng, lời mời cũ không sống lại. Mốc khôi phục khi máy lỗi là vị trí **ngay trước lần giao máy**, kể cả khi vị trí ấy vừa được đổi hợp lệ. Ngăn hai lời mời gửi đang chờ bởi cùng một người bằng ràng buộc dữ liệu và kiểm tra giao dịch.

## 6. Ước tính thời gian

Đầu vào: thời gian còn lại của các mẻ đang chạy; máy trống/giữ/chờ bàn giao/bảo trì; thời lượng giặt ước tính của người trước; thời gian chuyển đồ và giới hạn giữ lượt; cửa sổ tự lấy; **cờ sẵn sàng** của người chờ. Tính mô phỏng phân người **đang sẵn sàng** lên những máy có giờ khả dụng sớm nhất, xuất **khoảng** thời gian, không phải một mốc cố định. Hiển thị vị trí trong hàng nguyên gốc riêng với số người sẵn sàng phía trước. Người chưa sẵn sàng không có giờ nhận máy chắc chắn: hiển thị “Bật Sẵn sàng để được xét nhận máy”, có thể chỉ hiện khoảng tham khảo sau khi bật. Khi họ bật sẵn sàng, tính lại ETA toàn tòa; người phía sau đã được giao máy không bị thu hồi. Để tránh tạo cảm giác bị chen ngang, ghi rõ khoảng giờ chỉ là mô phỏng theo **trạng thái sẵn sàng hiện tại**; người đứng trước đang chưa sẵn sàng (bao gồm người được khôi phục sau lỗi) có thể bật trở lại, làm khoảng giờ lùi. Thông báo khi ETA dịch đáng kể. Không thể hứa khoảng giờ luôn chứa giờ nhận máy thực tế, vì máy có thể chạy quá dự kiến hoặc ngừng hoạt động vô thời hạn. Ước tính ưu tiên dữ liệu thật, dùng mặc định theo tòa cho các lượt chưa bắt đầu và mở rộng khoảng khi thiếu chắc chắn. Nếu mọi máy không có thời gian dùng lại có thể ước tính, hiển thị vị trí nhưng không hiện ETA. Không đưa máy bảo trì vào lịch giả lập.

## 7. Dấu vết cần lưu

Lưu sự kiện theo tòa, máy, người thao tác, thời điểm máy chủ, loại thao tác và trạng thái trước/sau cho: tham gia/rời hàng, **bật/tắt sẵn sàng**, bị bỏ qua do chưa sẵn sàng (nếu cần truy vết), đổi lượt, giao/nhường/hết hạn, bắt đầu giặt, cập nhật phút, xác nhận đã dừng/lấy/chuyển đồ, báo lỗi, quản lý mở lại máy. Nhật ký giúp xử lý tranh chấp và sai trạng thái; hạn chế dữ liệu cá nhân trong thông báo/QR.
