# Bàn giao công việc

> Bắt đầu bằng file này và `git status --short --branch`. Chỉ mở các file liên quan tác vụ; không coi nội dung này là quyền phê duyệt merge/push.

## RÀ SOÁT TÍNH NĂNG HIỆN CÓ — 2026-11-28

- Người dùng yêu cầu sửa lỗi ưu tiên quan trọng, mỗi lỗi commit/push riêng. ChromeFCM dấu`:` đã mergePR17 `1141294`, Java113test và CIgreen. Chưa khẳng định Render deploy/thiết bị nhận thật.
- Đăng ký mật khẩu >72byteUTF-8 (73ASCII hoặc25ký tự`ắ`) đã tái hiện ServletException/500 do BCrypt. Sửa kiểm tra400 trước băm + lỗi inline/hint đăng ký; không cắt password, không thay dữ liệu/hash tài khoản cũ. Test biên24ký tự`ắ`=72byte đăng ký/đăng nhập đạt; LaundryApiTest7/7 và AuthSection5/5 đạt.
- Audit chưa tìm thấy bypassquyền/cấp trùng máy trong các đường core đã đọc. Các lỗi đang sửa riêng: parent mutation đổi tòa trả chậm, modal mất focus khi gõ, swap không live-refresh, báo lỗi kỹ thuật khi có mẻ cũ, retryownerRemaining gây falseincident. Không coi audit này là chứng nhận hết mọi lỗi.

## SỬA ĐĂNG KÝ CHROME WEB PUSH — 2026-11-28

- Người dùng báo Chrome hiện400 “Dữ liệu gửi lên không hợp lệ” khi bấm bật. Tái hiện bằng MockMvc token FCM tổng hợp có dấu`:`: expected200, actual400. Nguyên nhân xác minh được: regex path quá chặt, chặn dấu`:` hợp lệ trong FCM token (chưa thu thập endpoint thật của người dùng).
- Branch `fix/chrome-push-endpoint`: cho phép`:` trong path của provider đã allowlist; không nới host/protocol/cổng/userinfo/query/fragment/traversal. Regression kiểm tra đăng ký→status→delete qua CSRF và URL giả vẫn bị chặn. Toàn bộ Java113/113đạt, 0failure/error/skipped (JDK25 compile21), test tái hiện lỗi trước sửa400 và đạt sau sửa. Người dùng yêu cầu sửa lỗi theo ưu tiên, mỗi lỗi commit/push riêng; đang chuẩn bị PR/CI cho sửa Chrome. Chưa xác minh deploy/đăng ký thiết bị thật.

## NHẮC LẤY ĐỒ — 2026-11-28

- Người dùng yêu cầu thêm nhắc lấy đồ; làm trên `feature/wash-pickup-reminder` từ develop `43cb636` (PR15 WebPush đã merge). Không đổi VAPID/quyền đăng ký hoặc quy tắc giặt/bàn giao.
- Nhắc tại giờ xong **dự kiến** (không phải xác nhận máy dừng); SELF_PICKUP nhắc ngay `estimatedEndAt`, không chờ10phút. Mẻ đã hoàn tất/cần quản lý không nhắc. Một mẻ/thiết bị một nhắc; chỉ thử gửi trong30phút từ mốc hiện tại, không phát lịch sử cũ sau downtime. Dời mốc trước gửi phải chờ mốc mới.
- Đã tích hợp backend:4class PickupReminder, Delivery flag tương thích cũ, payload/tag riêng, indexdue. Java tích hợp chính `mvn ... test`112/112đạt, 0failure/error/skipped (JDK25 compile21, không clean vì JAR server đang chạy). Frontend293/293 + docs/lint/typecheck/build đạt; browser production390/1440 mockAPI không overflow/console/pageerror. Người dùng đã yêu cầu đưa phần nhắc lấy đồ vào develop và xuất thư mục mã nguồn nộp bài; đang chuẩn bị PR/CI, chưa xác minh deploy Render. Render WebPush bản trước còn cần người dùng deploy đúng commit và cấu hình VAPID; chưa nghiệm thu push trên iPhone thật.

## WEB PUSH — 2026-11-28

- Nhánh `feature/web-push-notifications` từ develop `11dc64c`; giữ thay đổi `CLAUDE.md` của lượt `/init` trước đó ngoài commit tính năng. Người dùng đã yêu cầu đưa lên Render; đang chuẩn bị PR/CI vào develop. Chưa cấu hình khóa trên Render, phiên hiện tại không có Render API/CLI credentials.
- Thêm PWA manifest, PNG Home Screen icons, service worker chỉ push/click (không cache dữ liệu), mục bật/tắt trong Tài khoản cho iPhone iOS16.4+ đã cài Home Screen và Chrome PC; không tự xin quyền khi tải trang.
- Java lưu subscription theo tài khoản và outbox cùng transaction giao hold; sender xử lý sau commit, TTL theo hạn hold, giới hạn retry, kiểm tra quyền/hold/revision và gỡ endpoint404/410. Không tự suy máy trống; thông báo là mời kiểm tra máy.
- Có env `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`; chưa cấu hình thì tắt sạch. Script `scripts/generate-web-push-keys.mjs` tạo cặp khóa trên máy; không lưu khóa riêng vào repo. Chi tiết ở `docs/web-push.md`.
- Kiểm chứng cuối: `npm run check` đạt docs/lint/typecheck và **291/291test**, `npm run build -- --webpack` exit0 (WASM fallback do nativeSWC Windows không nạp được). Java tích hợp `mvn -B -f backend/pom.xml test` **106/106**, 0failure/error/skipped, JDK25 compile release21 (không phải runtimeJDK21). `clean test` ở repo chính bị khóa JAR của backend8080 đang chạy; không kill server/đụng DB để ép clean. Test gồm nhiều thiết bị, tắt riêng thiết bị, rollback, hold hết hạn, retry, CSRF/quyền, chuẩn bị cryptoApple và scheduler độc lập.
- Browser smoke production build cuối: **6/6kịch bản** desktop1440/mobile360/390 với API/permission mocked; không overflow/console/pageerror, không xin quyền trước bấm, nútpush44px. Tài nguyênPWA/đăng kýSW thật, không gửi/subscribe push. Ảnh/results: `%TEMP%/web-push-qa-3015/`; đã dừng riêng QA3015. Shell cũ còn vài nút32–38px và contrast nhãn4.17/4.45:1, chưa audit/fix toàn shell.
- Chưa gửi qua Apple/FCM thật, chưa nghiệm thu iPhone thật. Render Free ngủ vẫn làm chậm job; không hứa nhận đúng giờ hay exactly-once. Không tự đổi plan/deploy/dữ liệu.

## FRONTEND FINALIZATION / NOTIFICATIONS — 2026-11-28

- Tiếp tục trên `fix/final-integration-verification`, nền develop `9df0dd3`; không redesign hoặc deploy.
- Thêm notification facts trong snapshot Java, thông báo trong trang dedup/scoped từ dữ liệu thật; sửa timeout bao phủ body read và external signal; icon404; Việt hóa before/after nhật ký.
- Cuối milestone: Java clean test **94/94**, frontend **250/250**, docs/lint/typecheck và webpackproductionbuild đạt. Chrome desktop1440/mobile390 trên10trang, notification luồng thật và reload: đạt; khôngpageerror/console/API lỗi lần cuối.
- Axe/Lighthouse chưa cài/chạy do cần user cấp phép riêng. Chưa harden mọi backend group hoặc stress dữ liệu lớn; chi tiết evidence và backlog trong `docs/HANDOVER.md`.
- Chưa commit/push/PR. Không đưa dữ liệu thử, ảnh/browser scripts hoặc tài liệu local/tệp Word tạm vào commit.

## PRODUCT REFINEMENT — 2026-11-26

- **Trạng thái workspace ban đầu:** Nhánh `develop` (`76680a6`, đã tích hợp PR #1–#13). Baseline ban đầu đạt 89/89 test Java và 220/220 test frontend.
- **Các Skill đã cài đặt và áp dụng (`.agents/skills/`, đã loại trừ khỏi Git commit qua `.git/info/exclude`):** `frontend-design`, `web-design-guidelines`, `vercel-react-best-practices`, `webapp-testing`, `systematic-debugging`, `test-driven-development`, `requesting-code-review`, `verification-before-completion`, `find-skills`.
- **Các vấn đề quan trọng phát hiện qua audit code & trình duyệt thật:**
  1. Backend Java đã có endpoint `POST /api/buildings/{buildingId}/holds/{holdId}/unusable` nhưng thiếu proxy route ở Next.js và thiếu nút thao tác trên UI khi cư dân nhận máy trống nhưng máy gặp lỗi kỹ thuật.
  2. Các đồng hồ đếm ngược (`MachineHoldCard`, `WashHoldActions`, `WashCycleCard`) so sánh trực tiếp `Date.now()` của trình duyệt với `expiresAt`/`estimatedEndAt` của server mà chưa bù độ lệch bằng `serverNow`.
  3. Trang chi tiết máy (`/buildings/{buildingId}/machines/{machineId}`) chưa có polling tự động khi mở trang qua QR, chưa trả `serverNow` từ `MachineDetailService`, và hiển thị mã trạng thái thô (`AVAILABLE`).
  4. Khi quản lý tải trang lần đầu, `issues` khởi tạo bằng `null` khiến `WashManagerPanel` nhấp nháy thông báo lỗi `"Không tải được danh sách sự cố"` trước khi request hoàn tất; fixture trong `LaundryApp.test.tsx` dùng `accountId` thay vì `id` gây cảnh báo React missing `key`.
  5. Giao diện ở các component mở rộng (`ChatPanel`, `QueueSwapPanel`, `QueueEstimate`, `BuildingAdminPanel`, `MachineDetailPage`, `MachineQrButton`) chưa được gắn class từ hệ thống thiết kế; trên mobile (`360px`/`390px`), hai form phụ (`Tạo tòa mới`, `Tham gia bằng mã mời`) chiếm toàn bộ màn hình đầu tiên trước phần hàng đợi và máy giặt.
  6. `README.md` và `backend/README.md` chưa cập nhật theo tiến độ thực tế của nhánh `develop`.
- **Công việc đã hoàn thành (chia theo 3 nhánh đẩy lên GitHub):**
  - `fix/business-completeness-and-sync`: Bổ sung route Next.js `/holds/[holdId]/unusable` và nút báo máy lỗi kỹ thuật trong `WashHoldActions`; đồng bộ `serverNow` cho mọi countdown và `MachineDetailService`; thêm polling 5 giây cho `MachineDetailPage`; sửa lỗi nhấp nháy `WashManagerPanel` và React key warning; chuẩn hóa định dạng mã nguồn Java và bổ sung test cạnh tranh swap-vs-removal cùng test ETA nhiều máy.
  - `feat/ui-ux-product-redesign`: Nâng cấp toàn diện hệ thống thiết kế trong `globals.css` và tất cả component; thêm thanh tóm tắt trạng thái vận hành cá nhân/tòa nhà; ưu tiên hiển thị bảng điều khiển tòa nhà trước form tạo/tham gia tòa trên màn hình di động; định dạng thời gian tiếng Việt rõ ràng trong bảng quản trị.
  - `docs/sync-handover-and-final-polish`: Cập nhật `README.md`, `backend/README.md`, `docs/mo-rong-nghiep-vu.md` và `WORK_STATUS.md` khớp trạng thái thực tế của mã nguồn.
  - `feat/ui-layout-polish`: Tinh gọn bố cục và thẩm mỹ toàn trang — sửa khoảng trống cột sidebar bằng sticky sidebar + `display: contents` trên mobile; gom `Hàng đợi chung` + `Ước tính tới lượt`, `MachineHoldCard` + `WashHoldActions`, và `Quản trị tòa nhà` + `Quản lý thành viên` thành lưới 2 cột cân đối (`.bento-2`); bổ sung bộ icon SVG đồng bộ (`Icons.tsx`); chuyển nút làm mới phụ sang `.btn-ghost` gọn nhẹ; cải thiện `ChatPanel`, `QueueSwapPanel`, `BuildingAdminPanel` (`id-chip`, `.pagination-bar`).
- **Kết quả kiểm thử thực tế:**
  - Backend Java (`mvn -B -f backend/pom.xml clean test`): **91/91 test đạt** (`0` lỗi, `0` thất bại, `0` bỏ qua).
  - Frontend (`npm run check`): docs/lint/typecheck đạt, **230/230 test đạt** (20 test files, 0 cảnh báo stderr).
  - Production build (`npx next build --webpack`): đạt (`exit 0`).
  - Trình duyệt thật (Playwright + Chrome kết nối Java backend thật trên `127.0.0.1:8080` và Next.js trên `localhost:3000`): đã kiểm thử các vai trò Quản lý, Cư dân đã duyệt, Cư dân chờ duyệt, Khách chưa đăng nhập ở các kích thước `360px`, `390px`, `768px`, `1024px`, `1440px`; không có lỗi console/pageerror, không tràn ngang (`overflow: NONE`).
- **Giới hạn còn tồn tại:** Phiên opaque của Next.js lưu in-memory và H2 dùng file cục bộ với `ddl-auto=update`, phù hợp phạm vi bài tập lớn chạy cục bộ, chưa предназнач cho môi trường multi-instance hoặc triển khai Internet công khai.

## Nút xác nhận máy trống phần A — 2026-11-22

- PR #6 (test cạnh tranh) đã squash merge vào develop thành `0566db9`. Các ghi chú bên dưới là lịch sử.
- Thêm `ConfirmMachineFreeButton.tsx` độc lập cho C ghép vào danh sách máy, chưa sửa `LaundryApp.tsx` hoặc backend. Dùng POST confirm-free hiện có.
- Chỉ hiện cho quản lý; mở xác nhận rồi phải tích đã kiểm tra máy tại chỗ, đã dừng và trống đồ. Chỉ AVAILABLE/NEEDS_CHECK và xác minh không có hold mới cho gửi; RUNNING/MAINTENANCE/trạng thái mới/holds chưa tải khóa thao tác.
- Chặn gửi lặp; 401 báo hết phiên, 403 khóa quyền, lỗi/kết quả chưa rõ yêu cầu refresh và dấu tích mới; thành công không gửi lại trên snapshot cũ. Abort/bỏ kết quả cũ khi đổi tòa/tài khoản/máy/trạng thái/hold.
- Thành công yêu cầu cha refresh máy/queue/holds/trạng thái cá nhân, không tự hiển thị máy Trống vì có thể vừa cấp ngay. Không dùng nút để bỏ qua mẻ/bàn giao của B.
- Thêm 18 test DOM và hướng dẫn `src/components/ConfirmMachineFreeButton.md`. Đã chạy `npm run check`: docs/lint/typecheck đạt, **86/86 test frontend đạt**; `npm run build` đạt. Không chạy lại Java vì không đổi Java/API.
- Chưa ghép giao diện/chạy browser-Java end-to-end; chưa commit/push phần nút mới.

## Test cạnh tranh phần A — 2026-11-22

- API trạng thái cá nhân đợt trước đã được merge qua PR #5 vào develop (`d29a3c8`). Các mục phía dưới là lịch sử, không phải trạng thái chưa push hiện tại của API.
- Chỉ thay đổi `AllocationServiceTest.java` và ghi chú này; không đổi production Java, API/payload start-unusable, UI hoặc nghiệp vụ mẻ/bàn giao của B.
- Bổ sung 5 nhóm tình huống với tổng 11 lượt test mới: cùng tài khoản join hai lần; bật/tắt Sẵn sàng đua cấp máy; start đua yield; unusable đua expire ở trước/đúng hạn; hai job hết hạn đồng thời xử lý nhiều tòa và giữ nguyên tòa có lượt chưa hết hạn.
- Kiểm tra cả trạng thái persisted của request/hold, số lượt hợp lệ, người kế tiếp và trạng thái máy. Không bắt buộc một worker phải thắng; lỗi ngoài mã nghiệp vụ dự kiến sẽ làm test thất bại. Một số tình huống được lặp 3 lần, không coi đây là chứng minh mọi lịch xen kẽ đều an toàn.
- Helper đồng thời chờ đủ hai worker sẵn sàng rồi mới mở latch; có timeout và shutdown để tránh treo suite. Clock điều khiển, không sleep chờ 8 phút.
- Đã chạy riêng AllocationServiceTest: **23/23 đạt**. Đã chạy toàn bộ bằng `mvn -B -f backend/pom.xml clean test`: **47/47 test Java đạt, 0 lỗi/thất bại/bỏ qua; BUILD SUCCESS**. Chưa phát hiện lỗi cần sửa mã nghiệp vụ trong các lần chạy này.
- Không chạy lại frontend vì không thay đổi frontend. Chưa commit/push đợt test mới.

## API trạng thái cá nhân phần A — 2026-11-21

- PR #4 đã squash merge vào develop thành `9bbad59`. Đã fetch và xác nhận nội dung mã nền local bằng develop; chưa thay đổi lịch sử nhánh để làm API này.
- Thêm GET `/api/buildings/{buildingId}/queue/me` bằng `QueueStatusController`/`QueueStatusService`, trả NONE/WAITING/HELD/WASHING, queueEntryId, ready, holdId, machineId, expiresAt và serverNow. Chỉ đọc tài khoản Authentication, chỉ thành viên APPROVED; no-store ở Java và Next.js.
- Service dùng khóa theo tòa trong giao dịch ngắn để đọc entry/hold nhất quán; không sửa dữ liệu hoặc dispatch qua GET. Lượt HELD đã tới hạn nhưng job chưa xử lý vẫn trả HELD + deadline, không trả NONE giả; dữ liệu lỗi trả 409.
- Thêm GET vào route Next.js queue/me, không đổi PATCH/DELETE. Không đổi start/unusable/mẻ giặt/bàn giao của B hoặc khung UI của C.
- Thêm 8 test Java và 10 test route. Đã chạy toàn bộ Java: **36/36 đạt, 0 lỗi/thất bại/bỏ qua**; `npm run check`: docs/lint/typecheck đạt, **68/68 frontend test đạt**; `npm run build` đạt.
- Hợp đồng chi tiết trong `docs/api-trang-thai-ca-nhan.md`; cập nhật backend README và hướng dẫn QueuePanel. C có thể dùng state cho participation, lỗi/đang tải vẫn UNKNOWN. Các GET riêng không bảo đảm snapshot nguyên tử toàn tòa; khi mâu thuẫn phải tải lại.
- Chưa ghép UI hoặc chạy trình duyệt–Java end-to-end; chưa commit/push API mới.

## Component hàng đợi phần A — 2026-11-21

- Phần trước đã commit `998ed75`, push nhánh `feature/automatic-machine-assignment` và squash merge PR #3 vào `develop` thành `6d7d316`; không thay đổi main. Các dòng bên dưới là lịch sử của đợt trước.
- Thêm `QueuePanel.tsx` độc lập: danh sách theo khóa thứ tự nhưng hiển thị vị trí liên tục, số người sẵn sàng phía trước, vào/rời hàng và đổi Sẵn sàng bằng API hiện có. Không sửa `LaundryApp.tsx`, không tạo API mẻ giặt/bàn giao của B.
- Yêu cầu prop participation do server xác minh; HELD/WASHING không cho vào lại hoặc rời hàng ở panel. Không suy ra NONE chỉ từ việc không có tên trong queue/holds; chưa có API trạng thái cá nhân đầy đủ thì truyền UNKNOWN. Snapshot mâu thuẫn khóa thao tác.
- Chống gửi lặp, xử lý session hết hạn, lỗi mạng/kết quả chưa rõ, refresh lỗi và response cũ khi đổi tòa. Không optimistic update vì bật Sẵn sàng có thể được giao máy ngay.
- Thêm 16 test DOM; đã chạy `npm run check`: docs/lint/typecheck đạt, **58/58 test frontend đạt**; `npm run build` và `git diff --check` đạt. Không đổi Java trong đợt này; 28 test Java là kết quả đợt trước.
- Hướng dẫn ghép/trạng thái/callback trong `src/components/QueuePanel.md`. Chưa nối trang chính, chưa kiểm thử trình duyệt–Java thật, chưa commit/push thay đổi QueuePanel.
- Việc kế tiếp: thống nhất API trạng thái yêu cầu cá nhân với B và dữ liệu/refresh với C để ghép QueuePanel/MachineHoldCard. Không để C truyền NONE khi thiếu dữ liệu; không tự mở rộng start/unusable khi chưa chốt hợp đồng.

## Cập nhật phần A — 2026-11-21

- Tiếp tục phần độc lập của A, chưa commit/push và chưa đổi nhánh.
- Job hết hạn chuyển sang truy vấn trực tiếp ID tòa bằng JPQL, tránh truy cập quan hệ lazy của entity khi không có persistence context.
- `LaundryService` từ chối cả bật/tắt bảo trì khi máy đang chạy hoặc có lượt giữ; xác nhận máy trống khi đang chạy/bảo trì trả 409 thay vì lỗi nội bộ. Không thay đổi luồng mẻ giặt/bàn giao của B.
- Bổ sung test service: mốc trước/đúng hạn, job chạy trễ/lặp, không ai sẵn sàng, cấp đồng thời một/hai máy, nhường lặp, bắt đầu so với hết hạn, bảo trì không làm mất trạng thái đang chạy/giữ lượt. Test dùng Clock điều khiển và vô hiệu job nền trong context test đó.
- Thêm `AllocationApiTest` cho xác thực, CSRF, chủ lượt, thành viên đã duyệt và đường dẫn khác tòa. Ngày 2026-11-21 đã cài Microsoft OpenJDK 21 và tải Maven 3.9.11 từ Maven Central (kiểm tra SHA-512), được người dùng cho phép chạy. Chạy cả `test` và `clean test`: **28/28 test Java đạt, 0 lỗi, 0 thất bại, 0 bỏ qua; BUILD SUCCESS**. Không cần sửa thêm mã sau khi chạy. Có cảnh báo Mockito/Byte Buddy về dynamic agent trên JDK, không làm test thất bại.
- Next.js có thêm 4 route: GET `/api/buildings/{id}/holds`; POST `/api/buildings/{id}/holds/{holdId}/yield`; POST `.../confirm-check`; POST `/api/buildings/{id}/machines/{machineId}/confirm-free`. Mutation kiểm tra Origin/Host, UUID và dùng bridge/session hiện có.
- Thêm test route và `vitest.config.mjs` để giải alias `@/`. Đã chạy `npm run check`: docs/lint/typecheck đạt, **29/29 test frontend đạt**; `npm run build` đạt; `git diff --check` không báo lỗi khoảng trắng (có cảnh báo chuyển LF/CRLF).
- Hoàn thành component độc lập `src/components/MachineHoldCard.tsx`: hiển thị máy/hạn giữ, xác nhận kiểm tra, nhường, chống bấm lặp, bỏ response cũ khi chuyển tòa, khóa thao tác khi hết phiên/mất mạng hoặc tới hạn. Không gọi `/start` hay mở rộng `/unusable`.
- Thêm 13 test DOM cho card bằng React Testing Library/jsdom; tổng frontend hiện **42/42 test đạt**. Đã chạy lại check/build. Hướng dẫn props/refresh cho C ở `src/components/MachineHoldCard.md`. Chưa ghép vào `LaundryApp.tsx`, chưa kiểm thử end-to-end trình duyệt–Java; không coi tính năng đã xuất hiện trên trang chính.

### Việc tiếp theo của A

1. Kiểm thử Java đã xác minh qua `clean test`. Maven hiện được dùng qua đường dẫn tuyệt đối ở `%LOCALAPPDATA%/laundry-java-tools-0917c41981b34e3e98b4a65667dcf94c/extracted/apache-maven-3.9.11/bin/mvn.cmd`; chưa thêm Maven vào PATH. Java ở `C:/Program Files/Microsoft/jdk-21.0.13.102-hotspot`; đặt JAVA_HOME tương ứng khi chạy nếu shell chưa nhận cấu hình mới.
2. Chốt hợp đồng start/unusable với B; không tạo API bắt đầu thứ hai và giữ giao dịch/khóa theo tòa.
3. Card lượt giữ đã có; bàn giao props/refresh theo `src/components/MachineHoldCard.md` để C ghép khung và polling chung. Component hàng đợi riêng chưa làm; không tự sửa lớn `LaundryApp.tsx`.
4. Chỉ chuẩn bị commit/PR khi kiểm thử Java đã xác minh; không thêm tệp tạm Word `docs/~$an-cong-va-deadline.md` vào commit.

## Trạng thái 2026-11-18

- `develop` trên GitHub đã nhận PR #2 (giao diện Next.js nối Java). Nhánh làm việc hiện tại: `feature/automatic-machine-assignment`, tạo từ `origin/develop`; **chưa commit/push/PR**.
- Người dùng đã chốt quy tắc: lượt được giao giữ khóa thứ tự trong lúc giữ máy; nếu báo máy không dùng được trong hạn thì trở lại hàng ở khóa ấy, áp dụng thứ tự hiện tại sau các lần đổi lượt hợp lệ, không lấy máy đã cấp cho ai khác.
- Đang triển khai Java backend: `MachineHold`, `AllocationService`, `AllocationController`, job hết hạn 8 phút, trạng thái hàng WAITING/HELD/WASHING/LEFT; chỉ giao khi quản lý **xác nhận máy trống**, không suy từ `AVAILABLE`/giờ xong dự kiến. Người chưa sẵn sàng bị bỏ qua, nhường hoặc hết hạn mất lượt, báo máy không dùng được trả mốc vị trí và chặn máy lỗi. Start yêu cầu xác nhận đã kiểm tra thực tế. Mọi quyết định tòa được khóa DB.
- Có migration đơn giản cho hàng đợi cũ: backfill `state` từ `active`. Máy cũ không tự xác nhận trống (`verifiedFree` null được coi là false).
- Đã có 3 test Java mới cho giao máy nhiều máy/chưa sẵn sàng, nhường và khôi phục vị trí, bắt đầu phải xác nhận kiểm tra; các test Java cũ vẫn chạy. Lần chạy gần nhất: **15/15 test Java đạt**, `npm run check` và `npm run build` đạt; `git diff --check` đạt ở thời điểm trước khi cập nhật file này.
- **Chưa hoàn tất:** test thời hạn 8 phút với đồng hồ điều khiển; test cấp đồng thời và job hết hạn; luồng bắt đầu giặt chưa nhập số phút, chưa có bàn giao mẻ cũ. Frontend Next.js chưa nối API cấp máy/giữ lượt. Vì thế **chưa dùng tính năng này để vận hành thực tế**.
- `next-env.d.ts` có thay đổi tự sinh khi chạy Next dev/build; không chỉnh tay hoặc xóa thay đổi mà không kiểm tra. Không commit/push/merge cho đến khi phần chức năng và test hoàn tất.

## Bước tiếp theo

1. Hoàn thiện test thời hạn và cấp đồng thời, đảm bảo không cấp trùng máy hoặc một người hai máy; xử lý bắt đầu/hết hạn/báo lỗi đua nhau.
2. Thiết kế luồng nhập phút giặt và bàn giao trước khi đưa cấp máy theo **giờ dự kiến** vào sử dụng; hiện chỉ xét máy đã được quản lý xác nhận trống.
3. Nối UI vào API Java sau khi backend ổn; chạy toàn bộ test/build, cập nhật trạng thái, rồi mới đề xuất commit/PR. Người dùng kiểm tra cuối trước merge.
