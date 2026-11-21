# Bàn giao công việc

> Bắt đầu bằng file này và `git status --short --branch`. Chỉ mở các file liên quan tác vụ; không coi nội dung này là quyền phê duyệt merge/push.

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
