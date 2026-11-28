# Frontend finalization — milestone 28/11/2026

## Nhắc lấy đồ dự kiến — 28/11/2026

- Người dùng yêu cầu thêm nhắc lấy đồ; branch `feature/wash-pickup-reminder` từ develop `43cb636`. Dùng cùng subscription, không xin quyền mới.
- Nhắc tại giờ `estimatedEndAt`, không chờ cửa sổ SELF_PICKUP10phút, không xác nhận máy dừng. Không gửi mẻ đã hoàn tất/cần quản lý hoặc mốc quá30phút; dời giờ trước khi gửi theo mốc mới.
- Frontend293/293 + docs/lint/typecheck và webpackbuild đạt. Browser production390/1440 với mockAPI: không overflow/pageerror/consoleerror; chỉ sửa nội dung settings và xử lý title serviceworker, chưa gửi push thật. Java tích hợp112/112đạt, 0failure/error/skipped (JDK25 compile21, `test` không clean vì JAR đang chạy). Người dùng yêu cầu tích hợp develop và xuất mã nguồn nộp bài; đang chuẩn bị PR/CI, chưa xác minh deploy và chưa nghiệm thu Apple/FCM/iPhone thật.

## Bổ sung Web Push — 28/11/2026

- Nhánh hiện tại `feature/web-push-notifications`, nềndevelop `11dc64c`; người dùng yêu cầu phát hành, đang chuẩn bị PR/CI vào develop; chưa cấu hình VAPID trên Render. Mục milestone cũ phía dưới là lịch sử, không phải trạng thái nhánh mới.
- Đã thêm đăng ký thiết bị và outbox Java sau giao lượt, scheduler gửi riêng, PWA/serviceworker và mục Tài khoản cho iPhoneHomeScreen/ChromePC. Cấu hình và nghiệm thu thiết bị thật: [Web Push](web-push.md).
- Kiểm chứng local cuối: frontend291/291 + docs/lint/typecheck; webpack productionbuild exit0; Java106/106 bằng JDK25 compile release21. Clean ở repo chính bị JAR server đang chạy khóa, đã chạy `test` thay vì kill server. Chưa nghiệm thu Java21 runtime/PostgreSQL/Apple hoặc FCM thật.
- Browser smoke đã kiểm tra6trạng thái desktop/mobile bằng mockAPI/permission, tài nguyênPWA thật; không gọi subscription/send thật. Các vấn đề a11y của shell cũ và các backlog bên dưới không được coi đã giải quyết toàn bộ.

## Baseline và phạm vi

Nhánh làm việc `fix/final-integration-verification` từ develop `9df0dd3`. Giữ AppShell/sidebar/navigation/design system hiện có, không redesign lại. Chưa commit/push/deploy. Hai tài liệu local `docs/phan-cong-va-deadline.md` và tệp Word tạm không thuộc thay đổi.

## Đã triển khai

- Snapshot Java thêm `notifications`: incomingSwaps (tối đa50 PENDING còn hạn), outgoingResponses (20 ACCEPTED/REJECTED), latestHold riêng tài khoản/tòa có trạng thái persisted và expiresAt. Không tạo bảng thông báo giả, không dùng client countdown để ghi EXPIRED.
- OperationalNotifications: thông báo giao máy hiện tại, còn tối đa2phút theo serverNow, hết hạn được Java xác nhận, đề nghị/phản hồi đổi lượt mới; quản lý nhận việc duyệt/sự cố từ dữ liệu API thật. Baseline lịch sử khi login, dedup trong scope phiên đang mở, nút điều hướng/đóng và aria-live. Chỉ thông báo trong trang, không push hay hứa nhận khi đóng trang; tập facts bounded không bảo đảm bắt mọi sự kiện khi offline lâu.
- `api-json.ts`: timeout15giây bao phủ cả đọc body, không bị vô hiệu bởi signal bên ngoài; xử lý body/network lỗi, giữ tương thích mutation200bodyrỗng/204, từ chối read200nonJSON. Không retry mutation tự động.
- Sửa404icon bằng icon.svg app-local.
- Nhật ký dịch before/after enum ra tiếng Việt, giữ raw values trong details kỹ thuật.

## Kiểm chứng thực tế

- Frontend baseline trước sửa:235/235. Cuối đợt `npm run check`:docs/lint/typecheck đạt, **250/250 test đạt** (25tệp).
- Java `mvn -B -f backend/pom.xml clean test`: **94/94 đạt**, 0failure/error/skipped; cảnh báo Mockito agent không làm fail.
- `npm run build -- --webpack`: exit0. Không đổi cấu hình deploy/production.
- Chrome/Playwright với Java8090 + Next3010, DB `.data/final-verification` riêng. Tạo tài khoản/tòa qua API, thao tác sự kiện backend thật, UI phản ánh: đề nghị đổi lượt mới, đồng ý, giao máy, yêu cầu duyệt; reload không replay lịch sử swap. **10 trang quản lý tại1440px/390px** HTTP200, chờ hết loading rồi chụp; không tràn ngang, pageerror/consoleErrors/failedApi đều rỗng ở lần cuối.
- Ảnh/results: Downloads/kiem-thu-final-notifications-20261128-settled. Script/tool ngoài repo ở AppData/Local/laundry-video-tools-edd2faff7f4b4e8696271ae3241e71aa/verify-final.cjs. Hai lần đầu script dùng selector logout/heading không phù hợp mọi mobile/view; đã sửa script, giữ evidence cũ, không tính các lần dừng đó là lỗi nghiệp vụ.
- Kiểm tra browser này chỉ tạo2máy và vài thành viên, không phải test đủ30máy/hàng dài/nhiềuchat/mọivai trò. Chưa test mobile390 sau sửa nhãn nhật ký cuối; unit nhãn + check/build cuối đạt.

## Chưa xong / việc kế tiếp

1. Cài @axe-core/playwright4.14.1 và lighthouse13.6.0 bị tool bảo vệ chặn, cần user cho phép rõ. Chưa chạy axe/Lighthouse, không có điểm accessibility/performance. Không thay bằng kết quả navigation timing dev để gọi performance PASS.
2. Notification hiện kiểm tra gần hết hạn khi snapshot cập nhật; không có durable unread/read across devices. Chưa e2e đợi8phút expire/2phút warning hoặc tạo sự cố mới; có unit/server lifecycle tests nhưng không coi tương đương browser.
3. Cần stress dữ liệu lớn, kiểm tra keyboard/focus/dialog/contrast tự động, production-mode Lighthouse và thêm test đầy đủ scope đổiaccount/tòa đang mutation. Một số parent handler cũ còn cần review.
4. Chưa audit tất cả query/N+1/index/deadlock/scheduled jobs hoặc schema upgrade fileH2cũ; đây là milestone notifications/integration, không hardening toàn bộ.
5. Không thực hiện public deployment. In-memory opaque sessions, H2/ddl-auto vẫn local coursework constraints. Không mở secret/session/dữ liệu thật.

## Chạy milestone

Java21: `C:/Program Files/Microsoft/jdk-21.0.13.102-hotspot`. Maven3.9.11: `%LOCALAPPDATA%/laundry-java-tools-0917c41981b34e3e98b4a65667dcf94c/extracted/apache-maven-3.9.11/bin/mvn.cmd` (chưa trong PATH).

- Java: SERVER_PORT=8090, SPRING_DATASOURCE_URL=jdbc:h2:file:<repo>/.data/final-verification;DB_CLOSE_ON_EXIT=FALSE; dùng Maven spring-boot:run từ đúng workingDirectory.
- Next: JAVA_API_ORIGIN=http://127.0.0.1:8090, APP_ORIGIN=http://localhost:3010, npm run dev -- --hostname127.0.0.1 --port3010 (hostname là một option và giá trị riêng khi gõ thực tế).
- Không reset database, kill process rộng hoặc publish report chứa cookies/token. Kiểm tra cổng trước, server background có thể đã dừng khi phiên kết thúc.
