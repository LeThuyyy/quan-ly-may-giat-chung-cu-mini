# API trạng thái yêu cầu cá nhân

## Endpoint

`GET /api/buildings/{buildingId}/queue/me`

Java và Next.js dùng cùng đường dẫn. Trình duyệt gọi Next.js bằng cookie opaque hiện có; Next.js dùng bridge chuyển tiếp phiên Java. Không gửi tên đăng nhập/accountId trong request để chọn người xem: Java luôn lấy tài khoản từ Authentication.

Chỉ thành viên APPROVED của tòa (quản lý hoặc cư dân) được xem. GET không yêu cầu CSRF và không thay đổi dữ liệu. Response cá nhân có `Cache-Control: private, no-store`.

## Response 200

Ví dụ đang giữ máy:

```json
{
  "state": "HELD",
  "queueEntryId": "11111111-1111-4111-8111-111111111111",
  "ready": null,
  "holdId": "22222222-2222-4222-8222-222222222222",
  "machineId": "33333333-3333-4333-8333-333333333333",
  "expiresAt": "2026-11-21T10:08:00Z",
  "serverNow": "2026-11-21T10:02:00Z"
}
```

UUID trên chỉ là ví dụ hợp đồng. Mọi field luôn có trong JSON, field không áp dụng là null. Thời điểm là Instant UTC ISO-8601.

| state | queueEntryId | ready | holdId / machineId | expiresAt |
|---|---|---|---|---|
| NONE | null | null | null | null |
| WAITING | ID yêu cầu đang chờ | true/false | null | null |
| HELD | ID yêu cầu đang giữ | null | ID lượt giữ ACTIVE / máy | Hạn 8 phút |
| WASHING | ID yêu cầu đang giặt | null | ID lượt giữ STARTED / máy | null |

`serverNow` luôn có, lấy từ Clock Java trong cùng snapshot. `holdId` ở WASHING là lượt đã bắt đầu (không còn hiệu lực để nhường/xác nhận kiểm tra), không phải một hold ACTIVE mới. API chưa cung cấp thời lượng, giờ kết thúc mẻ hoặc dữ liệu bàn giao; đó là phần B.

### Hết hạn nhưng job chưa xử lý

Tại `serverNow >= expiresAt`, dữ liệu có thể vẫn là HELD nếu job chưa commit. API **không trả NONE**, không tự hết hạn/dispatch qua GET và không gia hạn. UI khóa thao tác khi tới hạn, tải lại/poll bằng cơ chế chung; sau khi job xử lý, kết quả sẽ chuyển về NONE hoặc trạng thái mới nếu người dùng đã có yêu cầu mới hợp lệ.

### Snapshot nhất quán

Service lấy khóa theo tòa giống các mutation để đọc entry và hold nhất quán khi cấp/nhường/bắt đầu đồng thời. GET chỉ đọc, không chỉnh sửa hoặc cấp lượt. Các request riêng tới `/buildings/{id}`, `/holds` và `/queue/me` vẫn có thể cách nhau một mutation; đây không phải API snapshot toàn tòa. Nếu dữ liệu khác request mâu thuẫn, UI dùng UNKNOWN/tải lại, không tự đoán NONE.

## Lỗi

- 401: chưa đăng nhập hoặc phiên hết hạn; Next.js xóa cookie opaque khi bridge yêu cầu.
- 403: không thuộc tòa hoặc chưa được duyệt.
- 404: tòa không tồn tại.
- 400: UUID không hợp lệ.
- 409: dữ liệu không nhất quán (nhiều yêu cầu active hoặc HELD/WASHING thiếu lượt liên kết). Không trả NONE trong trường hợp này; UI khóa thao tác và yêu cầu tải lại/quản lý kiểm tra.
- 502 từ bridge: không kết nối được Java hoặc phản hồi không hợp lệ; không biến thành NONE.

Lỗi Next.js có dạng `{ "error": "..." }` theo route-helpers. Java vẫn dùng cơ chế lỗi Spring hiện có, bridge chuẩn hóa cho trình duyệt.

## Tích hợp phần A/B/C

- C dùng response.state cho `QueuePanel.participation`; đang tải/lỗi/không nhận diện trạng thái thì UNKNOWN.
- WAITING phải đối chiếu queueEntryId với danh sách chờ; HELD phải đối chiếu holdId trước khi hiện card. Không dùng các kết quả của tòa/tài khoản cũ sau khi chuyển lựa chọn.
- Sau join/readiness/leave/yield/confirm-check, tải lại cả trạng thái cá nhân, queue và holds. Cha sở hữu polling, component không tạo polling riêng.
- B giữ `active`/state của yêu cầu nhất quán khi hoàn tất hoặc chuyển bàn giao. Nếu thêm trạng thái HANDOVER/COMPLETED thì cập nhật service/hợp đồng/test và frontend; không để trạng thái chưa được hỗ trợ biến thành NONE.
- Không đổi `/start` hoặc `/unusable` trong phần API đọc này.

## Kiểm thử

```powershell
mvn -f backend/pom.xml "-Dtest=QueueStatusTest" test
npm test -- src/lib/__tests__/queue-status-route.test.ts
```

Java test bao gồm NONE/WAITING/HELD/WASHING, rời/nhường/khôi phục, đúng mốc hết hạn khi job trễ, dữ liệu lỗi, phân quyền, không cho override accountId và đọc đồng thời dispatch. Route test xác minh UUID, cookie, no-store và không biến lỗi thành NONE.
