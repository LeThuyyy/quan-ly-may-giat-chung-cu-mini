# Rà soát nghiệp vụ trước khi lập trình

Tài liệu này phân biệt **đã thống nhất** từ đặc tả/trao đổi và **đề xuất cần xác nhận**. Không coi một đề xuất là quyết định đã được người vận hành duyệt. Mục tiêu: tránh sửa mô hình dữ liệu và bộ cấp máy giữa chừng.

## I. Nền tảng đã thống nhất

- Mỗi tòa có **một hàng đợi chung** cho 1–3 máy; không đặt lịch trước hoặc chọn giờ nhắc.
- Cư dân chọn Sẵn sàng/Chưa sẵn sàng lúc vào hàng; có thể đổi khi còn chờ. Người chưa sẵn sàng giữ vị trí nhưng được bỏ qua; họ không nhận hạn 8 phút. Nếu không ai sẵn sàng, máy chờ.
- Chỉ giao cho người sẵn sàng theo thứ tự hàng; khi giao máy bắt đầu ngay hạn 8 phút, không chờ người đó lên hoặc nhận thông báo. Quên lên/hết hạn thì mất lượt; báo máy không dùng được trong hạn thì không bị phạt và được trở lại cùng hàng.
- Người đã được giao máy không thể tắt Sẵn sàng để né hạn; có thể Nhường lượt. Giao máy mới không thu hồi máy đã giao cho người khác.
- Chọn ưu tiên tự lấy 10 phút thì cửa sổ này diễn ra **trước khi giao lượt**; người trước lấy sớm có thể kết thúc cửa sổ sớm. Mốc 8/10 phút cấu hình theo tòa.
- Đồng hồ web báo **giờ dự kiến**, không đo máy thật. Người nhận phải kiểm tra máy đã dừng, cách xử lý đồ hợp lệ rồi mới bắt đầu giặt.
- Báo máy chưa dùng được trong hạn: mục tiêu là giữ vị trí công bằng, không phát hành vé ưu tiên chen lên đầu bất cứ lúc nào; người chưa sẵn sàng vẫn có thể được người khác vượt qua để nhận máy. Vị trí cần một định nghĩa chính xác ở mục II.1.
- Đã chốt giới hạn theo **tài khoản**, không phải phòng; mặc định mỗi người giặt mang chậu riêng, web chỉ nhắc và **không có quy trình xử lý chậu**. Phí dịch vụ cố định theo tháng được thu bên ngoài ứng dụng; web không tính, hiển thị hay thu phí.
- Theo ủy quyền của người dùng, quy tắc đề xuất xử lý máy chạy quá giờ là dời giờ dự kiến theo số phút còn lại trên bảng điều khiển, không mặc định máy hỏng; quản lý chỉ nhận vấn đề máy không xác minh được hoặc hỏng thật.
- Có kênh chat theo tòa để trao đổi chung, **không** dùng tin chat làm lệnh thay đổi trạng thái. Tin chat và thông báo là hỗ trợ, hành động chính thức vẫn ở trang máy/hàng đợi.

## II. Quyết định ảnh hưởng nghiệp vụ/kiến trúc — phân biệt đã chốt với còn mở

### 1. “Trả về vị trí cũ” khi những người khác đổi lượt trong lúc đang giữ máy — BẮT BUỘC

Mô tả hiện tại “sau tất cả người vốn ở trước, trước tất cả người vốn ở sau” **có thể bất khả thi**. Ví dụ ban đầu `A → B → C`, A chưa sẵn sàng nên B được giao máy; A và C đổi thành `C → A`. Khi B báo lỗi, không thể vừa đặt B sau A (vốn đứng trước B) vừa trước C (vốn đứng sau B), bởi C giờ đứng trước A.

**Đề xuất mặc định (chưa duyệt):** mỗi yêu cầu giặt có một khóa thứ tự tồn tại cả trong lúc đang giữ máy; việc giao máy chỉ ẩn người khỏi danh sách **đang chờ**, không xóa khóa. Đổi lượt chỉ hoán đổi khóa của **hai người đang chờ**, không hoán đổi khóa người đang giữ. Khi báo lỗi hợp lệ, người giữ trở lại hàng tại khóa của họ. Trật tự **hiện tại của các khóa** quyết định, không cố tái lập quan hệ với từng người trong ảnh chụp quá khứ. Với khóa ban đầu A=1, B=2, C=3 rồi A/C đổi, kết quả xác định là `C(1) → B(2) → A(3)`. Điều này có nghĩa B không chen trước C đã đổi lên hợp lệ. Những người đã nhận máy không bị thu hồi.

Cần xác nhận chấp nhận hệ quả này, vì cách nói trước đây “trước mọi người vốn đứng sau” sẽ không còn đúng nếu những người ấy đã đổi lượt trong lúc B giữ máy. Nếu không chấp nhận, phải cấm/giới hạn một số lần đổi lượt trong thời gian người khác đang giữ máy; trải nghiệm sẽ phức tạp hơn.

**Test:** cùng lúc đổi lượt + cấp máy; hai lượt giữ báo lỗi theo thứ tự ngược; người giữ báo lỗi sau khi người mang khóa thấp hơn đã rời hàng; người đổi lượt đã nhận máy; báo lỗi hai lần không tạo hai hàng chờ.

### 2. Máy “đến giờ” nhưng có thể vẫn đang chạy hoặc còn đồ — BẮT BUỘC

Trạng thái một cột duy nhất như `ĐANG_GIẶT → CÓ_THỂ_GIAO → GIỮ_LƯỢT` làm mất bối cảnh **người giặt cũ và mẻ đang chờ bàn giao**. Ví dụ 20:00 dự kiến xong, 20:00 giao B lên kiểm tra, nhưng đồ A vẫn còn trong máy và máy vẫn chạy.

**Đề xuất kỹ thuật an toàn:** tách (a) mẻ giặt và người sở hữu đồ còn chờ bàn giao, (b) hạn giữ của B, (c) tình trạng vận hành máy bình thường/cần kiểm tra/bảo trì, (d) điều kiện có thể mời người đến kiểm tra. Có thể đồng thời có **mẻ A chờ bàn giao + lượt kiểm tra của B** trên cùng máy; đây không phải hai mẻ đang chạy. Giao B không có nghĩa máy vật lý đã trống. Sau khi B xác nhận tại máy mới ghi chuyển đồ/lấy đồ và cho B bắt đầu mẻ của mình.

**Quy tắc vận hành đề xuất theo ủy quyền người dùng:** “vẫn đang chạy” ở mốc dự kiến **không mặc định là máy hỏng**. Người được giao tới máy báo và nhập số phút còn lại hiển thị (hoặc “không rõ”); lượt giữ được giải phóng, vị trí người báo khôi phục, máy **tạm ngừng giao** tới mốc mới. Người giặt trước có thể xác nhận máy đã dừng/đã lấy đồ để mời kiểm tra sớm. Tới mốc mới, hệ thống chỉ mời người sẵn sàng **kiểm tra lại**, không tự ghi máy đã dừng. Nếu máy tiếp tục chạy không rõ thời gian hoặc có dấu hiệu hỏng, chuyển CẦN_KIỂM_TRA; cư dân có thể báo tình trạng trong web/chat, chỉ chuyển quản lý khi không tự giải quyết được hoặc máy thật sự có vấn đề. Thiếu chậu là **vướng mắc bàn giao**, xử lý theo mục II.3, không coi máy hỏng. Một lần dời mốc tự động tối đa trước khi chuyển quản lý là **mặc định đề xuất**, cần thử thực tế để tránh khóa máy vì chu trình dài nhưng cũng tránh giao kiểm tra lặp vô hạn.

### 3. Chậu giặt — ngoài phạm vi xử lý của ứng dụng

**Đã chốt:** mặc định mỗi cư dân mang và đặt chậu riêng khi giặt, kể cả chọn tự lấy. Web chỉ nhắc, không kiểm tra chậu và không xây các luồng quên chậu/cho mượn chậu/chậu thay thế. Người được giao vẫn phải kiểm tra máy đã dừng và xác nhận đã lấy hoặc chuyển đồ trước khi bắt đầu mẻ mới. **Vẫn cần chốt riêng** cửa sổ 10 phút bắt đầu từ giờ xong dự kiến hay lúc máy được xác nhận dừng; đây là quy tắc thời gian, không phải quy tắc chậu.

### 4. Không ai nhận thông báo, người đã được giao bắt đầu máy thật nhưng web không ghi nhận — BẮT BUỘC

Sau 8 phút, hệ thống có thể giao máy cho người kế tiếp trong khi ngoài đời người trước đã bấm chạy. Điều này là **sai trạng thái vật lý**, không giải quyết được chỉ bằng retry mạng.

**Đề xuất:** trên giao diện yêu cầu ghi Bắt đầu thành công **trước** khi bấm Start ở máy thật; nếu người dùng đã lỡ bấm máy trước, cung cấp nút “Máy đang chạy nhưng web chưa ghi nhận” để đóng giao tự động và báo quản lý đối soát, không tự tạo mẻ giặt theo khai báo không kiểm chứng. Khi cập nhật web thất bại/không chắc chắn, hiển thị hướng dẫn không khởi động máy và tải lại trạng thái. Mọi yêu cầu Bắt đầu/báo lỗi được chấp nhận theo thời điểm **máy chủ nhận**, không theo thời gian thiết bị; tại đúng hạn thì coi là hết hạn (đề xuất kỹ thuật). Dùng ID lượt giữ và idempotency để retry không sinh mẻ thứ hai.

### 5. Giới hạn theo tài khoản — ĐÃ CHỐT

**Đã chốt:** mỗi người có tài khoản riêng và được xếp lượt **độc lập**, dù ở cùng phòng và người khác trong phòng đang giặt. Tòa thu phí dịch vụ cố định theo tháng bên ngoài; **web không có chức năng phí**. Thông tin phòng/phí không phải khóa chung ngăn những người cùng phòng dùng hàng đợi.

**Mặc định triển khai:** mỗi tài khoản có tối đa một yêu cầu chưa hoàn tất trong tòa, tính cả đang chờ/giữ/đang giặt/chờ bàn giao; chặn đồng thời ở máy chủ. Khi quản lý duyệt tham gia nên xác minh cư dân để hạn chế tạo nhiều tài khoản. Người dùng có thể yêu cầu lượt mới sau khi lượt trước hoàn tất bàn giao. Không thiết kế dữ liệu hoặc API phí; việc thu phí cố định theo tháng diễn ra ngoài ứng dụng.

### 6. Sẵn sàng, độ tin cậy thông báo và việc “giữ chỗ” — CẦN CHỐT CHÍNH SÁCH

“Sẵn sàng” nghĩa có thể bắt đầu trong 8 phút **bất cứ lúc nào**. Trình duyệt đóng hoặc điện thoại mất mạng không tự tắt cờ. Nếu web chỉ có thông báo trong trang, người dùng có thể không thấy mình đã được giao dù có ý định lên; hết hạn vẫn mất lượt theo quy tắc hiện tại. Chỉ bật web push khi có quyền và thiết bị hỗ trợ cũng không bảo đảm giao tới.

**Đề xuất triển khai:** cảnh báo rõ rủi ro khi bật Sẵn sàng; hiện đồng hồ trên trang tòa, push nếu được cấp quyền và có thể bổ sung kênh thay thế. Nếu chưa có kênh gửi ra ngoài trang, không quảng bá “sẽ được nhắc” như một cam kết. Không ngầm gia hạn 8 phút khi mất thông báo. Người chưa sẵn sàng giữ vị trí vô thời hạn ở MVP, nhưng không ngăn máy dùng; có thể gợi ý tự rời hàng sau thời gian dài, không tự xóa/phạt khi chưa công bố quy tắc.

### 7. ETA là dự kiến cho mốc nào, và độ lệch được công bố ra sao — CẦN CHỐT CÁCH HIỂN THỊ

Đề xuất gọi là “**Khoảng giờ hệ thống dự kiến giao máy để bạn lên kiểm tra và bắt đầu giặt**”, không phải giờ máy đã sạch đồ hoặc giờ chắc chắn bắt đầu giặt. Tính theo cờ Sẵn sàng **hiện tại**, thời lượng máy đang chạy, giả định lượt tới và thời gian bàn giao. Người chưa sẵn sàng chỉ xem vị trí và hướng dẫn bật Sẵn sàng; những người đang sẵn sàng thấy vị trí thực + số người sẵn sàng phía trước + khoảng giờ có điều kiện.

**Không thể đảm bảo cận trên hữu hạn**: người đứng trước có thể bật Sẵn sàng, máy chạy quá giờ hoặc phải bảo trì. Vì vậy phải ghi “dự kiến theo trạng thái hiện tại; có thể đổi”, cập nhật sau mọi thay đổi; nếu không đủ dữ liệu thì không hiện khoảng giờ. Khi một người đứng trước bật lại và ETA của người sau tăng, không được nói giờ ban đầu là cam kết. Chốt một thời lượng giặt mặc định để mô phỏng (đề xuất 45 phút, cấu hình theo tòa), biên bàn giao dự phòng (đề xuất 5–10 phút), và ngưỡng gửi **thông báo ETA thay đổi** (đề xuất chỉ khi trễ trên 15 phút, tránh spam); các con số này chưa được người vận hành duyệt.

### 8. Quét QR là lối tắt hay bằng chứng hiện diện — CẦN CHỐT

QR tĩnh được chụp lại thì người ở xa cũng mở trang máy được. **Đề xuất MVP:** QR chỉ mở đúng trang, khi bắt đầu buộc người nhận xác nhận “Tôi đã kiểm tra máy X và đồ/chậu” nhưng không coi đó là bằng chứng ở gần. Nếu nội quy cần xác thực hiện diện, phải chọn thêm mã thay đổi tại máy/phần cứng hoặc cơ chế phù hợp; không quảng cáo QR tĩnh như cơ chế chống gian lận.

## III. Các ca ít gặp nhưng nên đặc tả trước khi làm API

| Trường hợp | Hành vi đề xuất và giới hạn |
|---|---|
| Đến sớm: máy thực tế dừng trước dự kiến | Người giặt cũ có thể xác nhận đã lấy đồ để bàn giao sớm; trường hợp còn đồ nhưng chưa lấy, không tự kết luận máy trống. Cần quyết định có cho người khác khai báo đã dừng sớm không. |
| Máy chạy lâu hơn dự kiến, người trước sửa thời lượng | Nếu chưa ai được giao, cập nhật ETA; nếu đã giao B, **không âm thầm** tước quyền B: B báo còn chạy, nhập phút còn lại nếu thấy trên bảng máy, phục hồi vị trí B và tạm ngừng giao tới mốc mới. Chỉ khóa để quản lý xử lý nếu không rõ thời gian, lại chạy quá mốc mới hoặc có dấu hiệu hỏng. Người giặt trước được cập nhật số phút còn lại **trước khi giao B**, có lịch sử và tính lại ETA; sau khi B đã được giao, không âm thầm thu hồi lượt B, mà B kiểm tra và báo còn chạy trong hạn. |
| Giao/nhường/hết hạn đồng thời nhiều máy | Khóa theo tòa/giao dịch nguyên tử; mỗi máy chỉ có một lượt giữ, mỗi yêu cầu chỉ gắn một máy; nhiều máy rảnh xét theo thứ tự mã máy ổn định. |
| Đã nhận máy rồi thử đổi lượt hoặc tắt Sẵn sàng | Từ chối nếu đã giữ máy; hiển thị Nhường lượt. Lời mời đổi lượt cũ vô hiệu khi được giao và không tự sống lại nếu quay về hàng sau lỗi. |
| Tới đúng giây thứ 8:00 hoặc thứ 10:00 | Đề xuất thời điểm máy chủ `now < deadline` mới nhận thao tác; `now >= deadline` thì hạn đã hết. Hạn ghi từ lúc giao thật, không phải lúc job dự kiến chạy; job trễ không rút ngắn hạn mới. |
| Người vừa được giao bị quản lý gỡ khỏi tòa | Thu hồi lượt giữ, hủy lời mời liên quan và xét giao người hợp lệ tiếp theo; nếu mẻ đang chạy, chỉ quản lý đối soát, không tự xóa dữ liệu mẻ/đồ. |
| Người dùng gửi lặp, mở hai tab hoặc hai tài khoản cùng phòng | Ràng buộc DB và khóa giao dịch, thao tác idempotent; màn hình cũ tải lại trạng thái thay vì ghi đè trạng thái mới. **Hai tài khoản hợp lệ cùng phòng được xếp/giặt độc lập**, không bị chặn theo phòng. |
| Máy đang bảo trì được mở lại trong khi có người chờ | Chỉ người được phân quyền mở; ghi người và lý do, xét giao ngay cho người sẵn sàng theo thứ tự; không tự giữ người báo lỗi trên máy đã khôi phục nếu họ không sẵn sàng. |
| Lời mời đổi lượt bị bỏ quên | Theo quy tắc hiện có vẫn có thể treo vô hạn và chặn người gửi mời người khác; đề xuất hạn phản hồi 10 phút hoặc nút Hủy lời mời, có thể cả hai. Chốt thời hạn nếu áp dụng. |
| Người nhận được lời mời đổi lượt nhưng người mời không còn ở phía trước | Từ chối thực hiện giao dịch và báo lời mời hết hiệu lực; không tự hoán đổi vị trí khiến người mời lại lên trước. |
| Rời hàng khi máy đang giữ, đang giặt hoặc đã báo lỗi | Rời hàng chỉ áp dụng trạng thái đang chờ; đang giữ dùng Nhường lượt; đang giặt cần hoàn tất bàn giao; sau lỗi quay lại chờ thì được rời và mất vị trí bình thường. |
| Người đã nhận máy báo lỗi quá hạn | Không hồi sinh lượt giữ đã hết hoặc khôi phục vị trí cũ. Vẫn cho phép **báo tình trạng máy** để chặn cấp sai; quản lý đối soát thứ tự nếu có tranh chấp. |
| Máy bị hỏng giữa chừng khi đang giặt | Ghi sự cố, không tự tuyên bố mẻ hoàn tất; ngừng cấp máy, hướng dẫn người giặt liên hệ quản lý, bảo vệ thông tin về đồ. |
| Tòa chỉ có một máy bị khóa | Giữ hàng và cờ Sẵn sàng, không giao máy; hiển thị “Chưa ước tính được giờ nhận máy” tới khi có xác nhận mở lại. |
| Đổi cấu hình từ 8 sang 6 phút khi đang có lượt giữ | Đề xuất chỉ áp dụng **lượt giao mới**, không rút ngắn hay kéo dài hạn đã công bố; ghi phiên bản cấu hình và người thay đổi. Tương tự cửa sổ tự lấy đã bắt đầu. |
| Nhiều người cùng quản lý xử lý một báo lỗi | Một quyết định thắng theo phiên bản sự cố, quyết định sau phải thấy trạng thái mới; không mở máy đang có báo lỗi mới hơn. |

## IV. Bất biến kỹ thuật và cổng nghiệm thu

1. Một yêu cầu giặt chỉ có **một vòng đời**: chờ (có/không sẵn sàng), giữ máy, giặt, chờ bàn giao, hoàn tất hoặc kết thúc do rời/hết hạn. Máy đang chờ bàn giao mẻ cũ có thể đồng thời có người mới giữ **quyền tới kiểm tra**, nhưng không có hai mẻ đang chạy.
2. Cùng một thời điểm: mỗi máy tối đa một người giữ; **mỗi tài khoản** tối đa một yêu cầu chưa hoàn tất trong tòa, không giới hạn gộp theo phòng; yêu cầu đã hoàn tất không được phục hồi bằng request cũ.
3. Vị trí thuộc **yêu cầu hiện tại**, không thuộc tài khoản vĩnh viễn. Rời hàng, nhường hoặc hết hạn rồi tham gia lại nhận khóa cuối mới. Báo lỗi hợp lệ trên lượt giữ thì **cùng yêu cầu** quay lại với khóa cũ; đổi lượt hoán đổi đúng hai khóa của người còn chờ.
4. Cấp máy, đổi lượt, bật/tắt Sẵn sàng, báo lỗi và timeout phải tuần tự hóa theo tòa. Mỗi thao tác lặp lại không tạo thêm lượt, hạn hoặc mẻ giặt. Dùng thời gian máy chủ và ID sự kiện/lượt giữ để bỏ qua job timeout cũ.
5. Không coi giờ dự kiến là bằng chứng máy đã dừng; không cho phép bắt đầu giặt khi chưa có xác nhận kiểm tra/bàn giao. Không dùng tình trạng chậu để tự động chuyển trạng thái máy; lỗi máy thực sự cần xác minh trước khi mở lại.
6. ETA có thể tăng hoặc giảm, không cam kết đúng giờ. Cập nhật sau thay đổi hàng, cờ Sẵn sàng, mẻ đang chạy, bàn giao, máy lỗi/mở lại, cấu hình và đổi lượt.

**Cổng triển khai:** có thể làm đăng nhập, quản lý tòa/máy, hàng đợi và bộ cấp phát thử với máy được **xác nhận trống**. Không đưa tính năng cấp máy theo giờ xong dự kiến vào vận hành thật trước khi có đường báo máy chưa dùng được, tạm ngừng giao máy, khôi phục thứ tự, xác nhận lấy/chuyển đồ và đối soát sự cố. Đây là cổng an toàn, không phải thay đổi phạm vi đã chốt.

## V. Danh sách xác nhận tối thiểu với chủ tòa

1. Khi người giữ báo máy lỗi, đồng ý **giữ khóa thứ tự** qua thời gian giữ (nên người đã đổi lượt lên trước trong lúc đó có thể đứng trước họ), thay cho câu chữ “trước mọi người vốn đứng sau” không thể luôn thỏa mãn?
2. Đã chốt: mặc định cư dân mang chậu; ứng dụng chỉ nhắc và không xử lý trường hợp quên/cho mượn chậu. Không cần quyết định thêm về chậu trước khi code.
3. Đã đề xuất tách “còn chạy có phút” (dời mốc và mời kiểm tra lại) khỏi “máy thật sự hỏng” (quản lý xử lý). Có chấp nhận một lần dời mốc tự động rồi mới chuyển quản lý không? Ai thay quản lý nếu có tranh chấp/hỏng mà họ vắng mặt?
4. Đã chốt giới hạn theo **tài khoản**, không theo phòng; mặc định đề xuất tính cả đang giặt/chưa bàn giao là một yêu cầu chưa hoàn tất. Có muốn nới để cùng tài khoản vào hàng khi mẻ trước vẫn đang chạy không?
5. QR chỉ là lối tắt hay phải chứng minh người dùng ở cạnh máy? Dùng thông báo trong web thôi có đủ cho bản thử nghiệm không?
6. Chọn giờ dự kiến là giờ **giao máy để kiểm tra**, thống nhất 10 phút tính từ giờ dự kiến hay từ lúc máy được xác nhận dừng, và chọn số phút mặc định/biên ETA/ngưỡng nhắc khi thay đổi.

7. Kênh chat theo tòa: chat chung toàn tòa hay thêm luồng theo máy/lượt; ai thấy tin cũ, lưu bao lâu, cho gửi ảnh hay chỉ văn bản, ai có quyền ẩn/báo cáo nội dung? MVP đề xuất **chỉ văn bản và thành viên đã duyệt**, có cách báo nội dung xấu và giới hạn tần suất gửi.

Các câu khác có thể nhận quy tắc mặc định minh bạch trong bảng mục III rồi điều chỉnh sau thử nghiệm, không nên âm thầm coi chúng là đã được duyệt. **Chưa nhận được ảnh chụp ứng dụng tham khảo**, nên chưa có nhận xét giao diện hoặc tính năng nào được rút ra từ ảnh.
