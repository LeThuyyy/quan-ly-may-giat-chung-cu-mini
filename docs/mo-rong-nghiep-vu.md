# Mở rộng nghiệp vụ — bản làm việc

Baseline: develop `7821931`. Nhánh `feature/business-expansion` được chuẩn bị bàn giao qua PR sau khi Thủy chạy thử và xác nhận ổn. Mã gốc A/B/C được giữ, phần mở rộng do Thủy yêu cầu và nghiệm thu với hỗ trợ triển khai/kiểm thử của Claude Code. Đây là bản bài tập cục bộ, không phải tuyên bố hoàn thành mọi hạng mục hardening hoặc đủ điều kiện vận hành thật.

## Những phần đã triển khai

- Gỡ/khôi phục cư dân: manager DELETE `/api/buildings/{id}/members/{accountId}`; POST `.../restore`; GET `/members/removed?page=0&size=20`. Không tự gỡ, không gỡ quản lý, chặn mẻ chưa hoàn tất. Gỡ WAITING/HELD kết thúc yêu cầu/hold, xét cấp lại. REMOVED không vào lại bằng mã mời; khôi phục PENDING cần duyệt riêng.
- Thu hồi lời mời: GET `/invitations` phân trang, POST `/invitations/{invitationId}/revoke`. ID quản trị UUID riêng, không trả token/hash. Link cũ có backfill metadata, vẫn giữ primary key hash. Thu hồi idempotent không tự hủy đơn PENDING. Join kiểm tra lại link sau khóa tòa, dùng Clock.
- Đổi lượt: GET/POST `/swaps`, POST `/swaps/{swapId}/accept|reject|cancel`. Người gửi đang chờ mời người phía sau; hai vị trí đổi trực tiếp, readiness giữ nguyên; hết hạn 10 phút; một outgoing chưa giải quyết; assignment/leave/removal invalidation vĩnh viễn. Giao dịch theo khóa tòa. GET chỉ project EXPIRED, không ghi dữ liệu.
- ETA: GET `/eta/me`, chỉ ready WAITING có khoảng giờ; dùng inspectionAt mẻ thật, lượt tương lai 45 phút +5–10 bàn giao, hold có thời gian chờ còn lại. Một máy = một slot dù mẻ cũ và inspection hold cùng tồn tại. Khoảng tham khảo, không cận trên bảo đảm; unready/unverified/sự cố không hứa giờ.
- QR/trang máy: `/buildings/{buildingId}/machines/{machineId}`, GET API machine detail chỉ member APPROVED và đúng máy/tòa; QR SVG sinh cục bộ từ APP_ORIGIN trusted (mặc định localhost:3000), không token. Login giữ URL trực tiếp. QR tĩnh không chứng minh hiện diện. Nếu chạy cổng khác phải đặt APP_ORIGIN tương ứng. Điện thoại không quét được URL localhost của máy tính.
- Chat: GET/POST `/chat/messages`; POST `/chat/messages/{messageId}/report|hide`; GET `/chat/reports` quản lý. Văn bản 1–1000 ký tự, cooldown 5 giây/tài khoản/tòa, UUID retry, báo cáo không auto-hide. Hidden body=null, tombstone. Chỉ APPROVED, lưu30ngày, job dọn theo batch. Chat tab riêng, read polling5giây khi đang hiện; không ghi trạng thái giặt.
- Nhật ký: GET `/activity?page=0&size=20&type=&machineId=`, chỉ quản lý, lưu90ngày; event ghi cùng transaction (MANDATORY), rollback không giữ event giả, tác vụ hệ thống actorId=null. Chỉ allowlist trạng thái/UUID, không token/body chat. UI quản trị có pagination, chưa có filter UI (API hỗ trợ).

## Web Push — thông báo giao lượt trên thiết bị

- Gửi khi Java commit hold mới, không gửi trong transaction khóa tòa; outbox và subscription được lưu DB. Rollback allocation không tạo thông báo; sender kiểm tra hold/quyền còn hiệu lực và revision thiết bị trước mỗi lần gửi, giới hạn retry/TTL, gỡ404/410. Push scheduler riêng không chặn job deadline.
- Chrome PC và iPhone iOS16.4+ đã thêm Home Screen: bật/tắt theo thiết bị trong Tài khoản; không tự xin quyền hoặc đăng ký tài khoản mới chỉ vì browser đã cho phép. Thông báo là mời **kiểm tra máy**, không chứng minh trống và không gia hạn8phút. Có nhắc lấy đồ tại `estimatedEndAt` (kể cả SELF_PICKUP), chỉ nhắc nếu máy đã dừng mới lấy; hủy/bỏ qua mẻ đã hoàn tất/cần quản lý, không đổi trạng thái vật lý. Không phát lại mốc đã trễ hơn30phút; mỗi mẻ/thiết bị một nhắc với retry bounded. Chưa gửi nhắc sắp hết hạn giữ qua push.
- Cần3biếnVAPID, HTTPS và backend hoạt động; Render Free ngủ có thể trễ. Chưa nghiệm thu nhận qua Apple/FCM/iPhone thật. Hướng dẫn và giới hạn: [Web Push](web-push.md).

## Nền tảng được sửa

BuildingAccessService repository-only: các mutation giặt/cấp máy kiểm tra membership sau khóa tòa, chặn race removal. UI quản trị/chat/swap có scope/unmount guard. Wash components dùng scoped fetch/refresh để phản hồi mutation cũ không tác động phiên mới. Polling vận hành đổi sang completion-scheduled, tránh interval chồng lặp.

## Kiểm chứng trong lượt hiện tại

- Java: đã chạy `clean test` cuối đợt sau snapshot/test cạnh tranh bổ sung, **88/88 đạt**, không lỗi/thất bại/bỏ qua. Có test ETA giữ UNAVAILABLE nếu có hold hết hạn chưa xử lý, không giả máy trống.
- Frontend sau snapshot: **212/212 test đạt**, docs/lint/typecheck đạt; production build cuối đợt exit0.
- Thủy đã mở bản mở rộng ở localhost:3006, chạy thử và xác nhận ổn ở các thao tác đã thử. Đây là nghiệm thu thủ công của người dùng, không thay thế các kiểm tra còn thiếu bên dưới.
- Đã chạy Java/Next riêng tại 8086/3006, database `.data/expansion-preview`; qua HTTP thật: tạo thành viên, ACCEPTED swap, ETA UNREADY, post/hide chat body=null, QR SVG, revoke, remove/restore và activity list đều đạt. Đây không phải test trình duyệt đầy đủ/mobile.

## Sửa hồi quy lời mời và chat — 26/11/2026

- Nhánh local `fix/swap-inbox-chat-composer`: chưa commit/push. Giữ nguyên production schema, không reset dữ liệu.
- Thêm GET `/swaps/pending?page=&size=` chỉ trả PENDING còn hạn, và GET `/swaps/outgoing` cho lời mời gửi đang chờ của chính tài khoản. API cũ `/swaps` tiếp tục lịch sử phân trang. Bridge kiểm tra page/size thay vì cố định trang0; UI chia danh sách đang chờ/lịch sử, có trang trước/sau. Lời mời gửi đang chờ hiện riêng với nút hủy, không bị trang lịch sử hoặc incoming mới đẩy mất. Java vẫn xác thực APPROVED và kiểm tra hạn; GET không ghi/expire.
- Chat tách trạng thái đọc nền và mutation: poll thành công không disable textarea hoặc mất focus; đang gửi hoặc lỗi/mất quyền thì vẫn khóa, giữ draft khi đọc lỗi. Nút gửi tiếp tục chặn trong lúc request khác chưa xong, không tự retry mutation.
- Hồi quy Java tạo55 lời mời lịch sử mới hơn và incoming còn hạn: outgoing cũ luôn truy cập được, pending có phân trang, đúng mốc hết hạn không còn actionable. UI kiểm tra hủy outgoing khi đang xem trang lịch sử khác. Test chat dùng timer và response chậm: giữ focus/draft xuyên poll5giây; lỗi502 vẫn khóa mà không xóa nội dung.
- Kết quả sau sửa: `clean test` Java **89/89 đạt**, frontend **220/220 đạt**, docs/lint/typecheck và production build đạt. Chưa kiểm thử lại trình duyệt thật sau hai sửa này; kết quả browser mô tả ở các mục trước thuộc bản trước sửa.

## Hoàn thiện đồng bộ, giao diện và kiểm thử bổ sung — 26/11/2026

- Bổ sung route Next.js `POST /api/buildings/{id}/holds/{holdId}/unusable` nối tới endpoint Java hiện có và nút **Báo máy chưa dùng được** trong `WashHoldActions` khi máy đã trống nhưng gặp sự cố kỹ thuật tại chỗ, đảm bảo cư dân được khôi phục mốc vị trí hàng và máy chuyển sang `NEEDS_CHECK`.
- Đồng bộ độ lệch đồng hồ máy chủ (`serverNow`) cho các bộ đếm ngược tại `MachineHoldCard`, `WashHoldActions`, `WashCycleCard` và bổ sung `serverNow` + cơ chế polling 5 giây (tạm dừng khi tab ẩn) cho `MachineDetailPage`.
- Loại bỏ hiện tượng nhấp nháy thông báo lỗi sự cố giả trên `WashManagerPanel` trong lúc đang tải dữ liệu quản lý lần đầu và sửa fixture `LaundryApp.test.tsx` để không phát sinh cảnh báo thiếu `key` của React.
- Nâng cấp toàn diện hệ thống thiết kế UI/UX (`globals.css` và các component), bổ sung thanh tóm tắt trạng thái cá nhân/tòa nhà, chuẩn hóa toàn bộ nút/form/danh sách ở `ChatPanel`, `QueueEstimate`, `QueueSwapPanel`, `BuildingAdminPanel`, `MachineDetailPage`, và tối ưu thứ tự hiển thị ưu tiên thao tác vận hành trên màn hình di động (`360px`, `390px`, `768px`, `1024px`, `1440px`).
- Bổ sung kiểm thử cạnh tranh giữa chấp nhận đổi lượt và gỡ thành viên (`QueueSwapTest`), kiểm thử mô phỏng ETA nhiều máy có bảo trì/lượt giữ (`MachineDetailEtaIntegrationTest`), kiểm thử route `/unusable` và kiểm thử bù lệch đồng hồ client/server: Java `clean test` đạt **91/91**, Frontend `npm run check` đạt **230/230**, production build đạt.

## Các việc CHƯA hoàn tất so với kế hoạch

- Đã thêm GET `/snapshot` dưới khóa tòa, trả machine/queue, membership hiện tại, holds (kể cả ACTIVE quá hạn chưa xử lý), yêu cầu cá nhân, mẻ, previousCycle, ETA/swap và serverNow. Dashboard dùng endpoint này; danh sách quản trị tách riêng. ETA/swap panel hiện vẫn fetch riêng theo refreshKey nên không khẳng định toàn bộ màn hình cùng một snapshot. GET không dispatch/expire/ghi audit. Hai test snapshot Java và ba test bridge mới đã đạt; bổ sung ba test cạnh tranh swap/chat sau lần clean85test đã đạt riêng.
- Chưa đồng bộ độ lệch đồng hồ server ở mọi countdown, chưa chuẩn hóa mọi mutation cha/refresh cũ; phạm vi scoped guard hiện ở wash/new panels.
- Chat hiện phân trang page/size và refresh trang đang xem, chưa cursor/delta; cooldown và quyền ở Java. Khi đổi draft sau kết quả chưa rõ cần xem kỹ quy tắc UUID, không tuyên bố chống mọi loại lặp.
- QR/trang máy chưa nghiệm thu bằng quét điện thoại, chưa kiểm tra kết nối LAN. Machine page chưa polling chung như dashboard, có nút tải lại.
- Đã bổ sung test double accept, invalidate do đổi thứ tự và concurrent chat cooldown/idempotency. Chưa bao phủ hết swap vs removal/timeouts, mọi ETA/multi-machine hoặc migration schema trên file H2 cũ thật. Test backfill hiện mô phỏng row metadata null trong H2 memory.
- Đã chạy Playwright/Chrome thao tác thật sau snapshot: gửi/nhận swap, chat, revoke, remove/restore, activity, machine QR và layout390px; PASS, không pageerror. Ảnh/results cục bộ ở Downloads/kiem-thu-snapshot-20261125. Chưa test hết offline/scope/QR đăng nhập/quét điện thoại, không coi smoke test này là nghiệm thu mọi luồng. Audit chỉ ghi sự kiện mới sau nâng cấp, không tạo lịch sử giả cho quá khứ.
- Không tự reset/drop database cũ. Schema nullable managementId là nâng cấp additive, không tự rollback schema khi revert code.

Không commit dữ liệu thử, node_modules, video, ZIP hay next-env.d.ts tự sinh. Lệnh kiểm tra: `mvn -B -f backend/pom.xml clean test`, `npm run check`, `npm run build`.
