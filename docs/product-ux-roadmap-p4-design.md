# Đặc tả thiết kế P4 — Đức toàn diện, ledger quy mô lớn và đồng bộ an toàn

**Trạng thái:** Đề xuất để phê duyệt.  
**Phạm vi:** Thiết kế và tiêu chí phát hành; tài liệu này **không** triển khai mã, không thay đổi schema và không thay đổi dữ liệu người dùng.  
**Tác giả:** Manus AI  
**Cơ sở mã rà soát:** `main` tại `d7980dc`.

## 1. Mục tiêu sản phẩm

P4 tập trung vào ba chất lượng nền tảng cần thiết để VWCE Vault đáng tin cậy trong sử dụng hằng ngày: **tiếng Đức nhất quán trên toàn bộ giao diện**, **trải nghiệm sổ giao dịch vẫn mượt mà khi có 100–1.000+ dòng**, và **đồng bộ/xung đột giải thích được, có đường đi rõ ràng, không làm mất dữ liệu**.

> P4 không đưa ra khuyến nghị đầu tư, không suy diễn dữ liệu giá, không tự sửa giao dịch và không tự chọn bên thắng trong xung đột.

Các hợp đồng hiện hữu là điểm xuất phát. Ledger hiện đã có cửa sổ tăng dần 60 dòng, lọc trước khi hiển thị và phân tích chạy trên toàn bộ sổ thay vì trên phần đang thấy.[1] Bề mặt giao dịch đã có filter, sort, time lens, saved views và inbox chất lượng; tuy nhiên vẫn còn validation, ngày và một số nhãn trực tiếp bằng tiếng Việt.[2] Xung đột hiện được dừng an toàn, yêu cầu người dùng chọn local/remote và xác nhận trước khi áp dụng.[3]

| Trụ cột | Kết quả người dùng nhận được | Nguyên tắc thiết kế |
|---|---|---|
| **P4.1 — Deutsch tief** | Chuyển sang `Deutsch` cho ra một sản phẩm Đức hoàn chỉnh, kể cả lỗi, empty state, hộp thoại, trợ năng, số và ngày. | Không dịch dữ liệu do người dùng nhập; không đổi tính toán tài chính. |
| **P4.2 — Ledger confidence** | 1.000 giao dịch vẫn tìm/lọc/xem thêm dễ hiểu; kết quả phân tích không đổi theo số dòng đang hiển thị. | Bảo toàn progressive window 60 dòng và full-ledger analytics. |
| **P4.3 — Sync confidence** | Người dùng biết dữ liệu đang local, đang chờ, bị chặn hay đã đồng bộ; mọi điểm đăng xuất cùng một cơ chế bảo vệ. | Manual, explicit, fail-safe; không tự merge xung đột. |

## 2. Ranh giới không được vượt qua

P4 phải nằm hoàn toàn ở lớp trình bày, view-model, test và tài liệu. Nó không thay đổi schema Dexie, phiên bản Dexie, nội dung backup, kiểu `Transaction`, luật kế toán/analytics, hay cơ chế push/pull/outbox/auth bên trong `src/lib/**`. Các callback đồng bộ đã có sẽ được dùng lại; P4 không thêm polling nền, automation, webhook hoặc dịch vụ bên ngoài.

| Được phép trong P4 | Không được phép trong P4 |
|---|---|
| Copy song ngữ có type check; formatter số/ngày ở lớp UI; test locale; scan chuỗi hiển thị. | Dịch hoặc sửa `notes`, ISIN, tên chứng khoán hay bất kỳ dữ liệu người dùng nào. |
| Benchmark fixture xác định; test view-model, DOM bound và Playwright; báo cáo đo tách riêng. | Tạo index, cache song song, virtual-list dependency hoặc tải toàn bộ hàng vào DOM. |
| Hợp nhất UI status; điều hướng/focus; callback logout duy nhất từ App shell; copy giải thích rõ resolution. | Auto-resolve, field-level merge, overwrite im lặng, retry push vô hạn hoặc bypass recovery/logout guard. |

## 3. Thiết kế P4.1 — Localization Đức sâu

### 3.1. Hợp đồng locale mới ở lớp trình bày

`LocaleProvider` hiện quản lý `vi`/`de` và gán `lang` đúng lên thẻ `html`.[4] P4 giữ cơ chế đó, nhưng thêm một lớp **formatter thuần phía UI** để tất cả nơi hiển thị có cùng quy tắc.

| Nhu cầu | API đề xuất | Quy tắc đầu ra |
|---|---|---|
| Số tiền EUR | `formatCurrency(value, locale)` | `de-DE`: `1.234,56 €`; `vi-VN`: cách hiển thị Việt đang được chấp thuận. |
| Số lượng chứng chỉ | `formatQuantity(value, locale, maxDigits)` | Dùng dấu thập phân theo locale; không làm tròn dữ liệu lưu trữ. |
| Ngày giao dịch | `formatDate(value, locale)` | `de-DE`: ngày/tháng/năm; không dùng formatter `VN` trên UI Đức. |
| Nhãn tháng | `formatMonthKey(YYYY-MM, locale)` | Ví dụ `März 2026` thay vì chuỗi kỹ thuật `03/2026` nếu chỗ đó là nhãn ngôn ngữ tự nhiên. |
| Bản dịch domain | `domainCopy(locale)` với `satisfies Record<AppLocale, …>` | Mỗi key bắt buộc có đủ VI/DE khi biên dịch. |

Không cần một mega-dictionary gây merge conflict. Copy gần domain có thể tiếp tục nằm cạnh `Transactions`, `SyncConflictSection`, Import hoặc Overview, nhưng mọi dictionary phải khai báo đủ hai locale bằng TypeScript. `src/lib/locale.tsx` chỉ tiếp tục là host cho trạng thái locale và các nhãn điều hướng/cài đặt dùng chung; formatter mới không đụng data, sync hay auth.

### 3.2. Phạm vi kiểm tra và ưu tiên chuyển đổi

P4.1 bắt đầu từ mọi điểm có thể phá vỡ niềm tin người dùng Đức: status đồng bộ, thao tác ghi/xóa, lỗi/recovery, ngày/số và dialog. Sau đó mới dọn những leaf component còn tiếng Việt. Việc audit đã xác nhận một số ví dụ cụ thể: `Transactions` có validation Vietnamese hard-code và dùng `formatDateVN`; `RecentTransactions`, `RhythmHero`, `TodayCenter`, `TraceSheet`, `BottomDock`, `Popover`, `ActionMenu`, `AppFailureBoundary` và `SyncStatusIndicator` là các ứng viên cần rà soát. `SyncStatusIndicator` hiện ghép đuôi `chờ` cố định nên không thể đúng khi UI là tiếng Đức.[2] [5]

| Đợt | Bề mặt bắt buộc | Kết quả chi tiết |
|---|---|---|
| **P4.1a — Critical actions** | `App`, `Settings`, `Transactions`, `SyncStatusIndicator`, `SyncConflictSection`, Import PDF. | Mọi banner, error, loading, validation, confirmation, empty state, `aria-label` và status sau hành động đều hoàn toàn Đức; ngày/số Đức tại chính những bề mặt này. |
| **P4.1b — Product sweep** | Overview và leaf component; Simulation, Goals, Notfallmappe, Handoff, Timeline, navigation, failure boundary, sheets/popovers. | Không còn copy giao diện tiếng Việt khi `locale=de`; tất cả format date/number visible phù hợp `de-DE`. |
| **P4.1c — Regression guard** | Unit/RTL và Playwright mobile 390 px cho route chính/phụ. | Test đặt locale `de`, kích hoạt cả state thành công, rỗng, offline, lỗi, validation và dialog; scan hiển thị chặn rò rỉ về sau. |

Dữ liệu người dùng được giữ nguyên ngôn ngữ của họ. Ví dụ một `notes` do người dùng nhập bằng tiếng Việt vẫn hiển thị như vậy trong giao diện Đức; đó là nội dung dữ liệu, không phải lỗi localization. Tương tự, các token kỹ thuật như `VWCE`, `ISIN`, `MFA`, `TOTP`, mã giao dịch, mã lỗi và `XOA`/token xác nhận sẽ được xử lý theo ngữ cảnh an toàn chứ không bị scan lỗi một cách máy móc.

### 3.3. Kiểm thử và tiêu chí chấp nhận P4.1

Một script audit không có dependency mới sẽ quét source UI để **báo candidate** Vietnamese hard-code, có allow-list ghi rõ lý do. Script này không quyết định một mình; route test mới là nguồn kiểm chứng hành vi. Ban đầu audit chạy dạng báo cáo để tạo baseline minh bạch, sau khi triệt tiêu toàn bộ candidate đã phân loại thì mới trở thành gate CI cho source UI mới.

| Tiêu chí | Cách chứng minh trước merge |
|---|---|
| Đức không lẫn copy giao diện Việt trên tất cả routes. | Playwright chạy locale `de` tại Overview, Transactions, Simulation, Settings, Notfallmappe, Handoff, Timeline và Goals; screenshot mobile 390 px; assertions trên landmark, CTA, dialog và alert. |
| Các action nguy hiểm/quan trọng nói tiếng Đức. | RTL test save-invalid, delete-confirm, import-risk, recovery, sync offline/conflict, logout blocked. |
| Số, lượng, ngày đúng locale nhưng economics không đổi. | Unit test formatter; snapshot dữ liệu fixture trước/sau chỉ khác presentation; `analyzeTransactions` giữ nguyên output số học. |
| Không có tràn chữ ở Đức. | Browser smoke 390 px kiểm `document.documentElement.scrollWidth <= innerWidth`; visual review riêng ở strings dài của conflict/import/settings. |
| Accessibility không giảm. | `html[lang=de]`, tên điều khiển tiếng Đức, dialog giữ focus/Escape/Tab trap, live region phù hợp. |

## 4. Thiết kế P4.2 — Benchmark và hợp đồng ledger quy mô lớn

### 4.1. Điều P4 phải bảo vệ

Hợp đồng hiện hành yêu cầu đọc ledger cục bộ một lần, chỉ render tối đa 60 dòng lúc đầu, tăng thêm 60, lọc trước sort/group/window và tính toán danh mục trên toàn bộ ledger.[1] P4 **không** thay thế điều này bằng virtual list hay caching mới. Mục tiêu của benchmark là biến hợp đồng đã có thành bằng chứng định lượng, không đổi cách tính hay lưu dữ liệu.

Fixture benchmark là dữ liệu test xác định, không phải dữ liệu thị trường hoặc hồ sơ người dùng. Nó có ngày, loại giao dịch, amounts, lots, missing-price và quality cases được tạo lặp lại theo quy tắc cố định; vì vậy có thể tái lập lỗi sort/filter mà không tiết lộ dữ liệu thật.

| Dataset | Vai trò | Cam kết sản phẩm |
|---|---|---|
| **100 dòng** | Cỡ nhỏ, kiểm UX không thoái hóa. | Toàn bộ filter, quality và saved view hoạt động như hiện nay. |
| **1.000 dòng** | Envelope P4 bắt buộc, đúng tài liệu hiện hành. | Initial DOM ≤60 rows; mở rộng theo 60; analytics không phụ thuộc window. |
| **5.000 dòng** | Probe chẩn đoán, không là lời hứa hỗ trợ chính thức. | Phát hiện sớm regression phi tuyến; không thay đổi scope nếu chậm. |

### 4.2. Hai lớp đo tách biệt

Timing trong CI biến động theo runner, vì vậy P4 không dùng một con số ms đơn lẻ để làm hỏng PR tốt. Contract correctness sẽ là **blocking CI**; benchmark thời gian bắt đầu bằng artifact/baseline được ghi nhận trên cùng runner, rồi mới ratify ngân sách sau tối thiểu năm lần chạy xanh.

| Lớp | Công cụ/đầu ra đề xuất | Điều được kiểm chứng | Trạng thái gate |
|---|---|---|---|
| **Contract benchmark** | Vitest, fixture deterministic, `transactionsListWindow` và analytics. | Stable order; filter trước window; no duplicate/no loss; count/group; analytics full-ledger invariant. | Bắt buộc trên mọi PR. |
| **DOM/interaction benchmark** | Playwright trên Transactions thật, 1.000 dòng, capture performance marks + DOM counts. | Initial 60; mỗi “tải thêm” thêm ≤60; search/filter/sort reset bound đúng; interaction tiếp tục có phản hồi. | Bắt buộc về correctness; timing là report ban đầu. |
| **Performance budget** | JSON artifact gồm runner, browser, commit, median/p95 của warm runs. | Chống regression tương đối với baseline đã phê duyệt. | Advisory trước, chỉ thành gate khi baseline ổn định được owner phê duyệt. |

### 4.3. Chỉ số và điều kiện chấp nhận

Các giới hạn UX bên dưới là mục tiêu thiết kế để đánh giá trên máy tham chiếu/browser profile được ghi lại trong artifact. Chúng không nên được chuyển thành absolute CI gate trước khi có baseline thực tế, vì sẽ tạo race/flakiness thay vì bảo vệ người dùng.

| Hành vi 1.000 giao dịch | Mục tiêu UX P4 | Contract bất biến bắt buộc |
|---|---|---|
| Mở Transactions lần đầu | Hiển thị 60 dòng đầu; UI ổn định, không render 1.000 article. | `visible=60`, số row DOM ≤60 và tháng rỗng không hiện. |
| Đổi search/filter/sort/time lens | Phản hồi cảm nhận được trong khoảng dưới 200 ms desktop hoặc 400 ms mobile-emulation trên môi trường tham chiếu. | Reset về 60; filter trước sort/window; tie-break `date → updatedAt → id` giữ ổn định. |
| “Tải thêm” | Không làm giật đáng kể; chỉ tăng tối đa 60 item. | Không trùng/mất id; visible tăng chính xác; footer phản ánh remaining. |
| Inbox dữ liệu | Tối đa 3 vấn đề lúc đầu, thêm từng 3. | Chỉ display-only; tombstone bị loại; không tự fill hay mutate giao dịch. |
| Summary/analysis | Không bị ảnh hưởng bởi scroll, filter hoặc visible limit. | Kết quả analytics dùng toàn bộ ledger như hiện nay, không dùng phần window. |

P4 thêm command tách riêng, ví dụ `npm run benchmark:ledger`, không chạy mặc định trong `npm test`. Output là JSON nhỏ có metadata môi trường, số giao dịch, warm-run median/p95 và DOM counts; không có transaction data hay thông tin cá nhân. Bộ test release vẫn giữ `npm test`, `npm run build`, preview smoke, edge smoke và release verification hiện tại.[6]

### 4.4. Ma trận regression

| Case | Dữ liệu | Assertions chính |
|---|---|---|
| Chronological expansion | 1.000 transactions, ngày trùng nhau. | 60 đầu rồi 120; next item đúng, id duy nhất, stable tie-break. |
| Text localized search | 1.000 transactions, type labels VI/DE. | Search label hiện hành theo locale trả đúng subset trước window. |
| Combined filters | Activity + type + year + time lens + amount sort. | Kết quả deterministic, group không rỗng, filter thay đổi resets limit. |
| Missing price/lots/quality | Mixture normal + incomplete + tombstone. | Analytics warning chính xác, inbox display-only, không đụng bản ghi. |
| 5.000 diagnostic | Fixture cố định, không gate sản phẩm. | Không lỗi, không full DOM render; số liệu dùng làm tín hiệu tối ưu sau này. |

## 5. Thiết kế P4.3 — Sync/conflict rõ ràng và cùng một cơ chế bảo vệ

### 5.1. Mô hình Sync Health nhìn từ người dùng

Tại thời điểm này, Settings có trigger sync, import guard với pending sync, conflict section và tổng hợp status; `App` đã sở hữu recovery, conflict banner và guarded sign-out. Tuy nhiên, nút `Abmelden` ở cuối Settings gọi trực tiếp `auth.signOut()`, tạo một seam cần hợp nhất với app-level logout guard trước khi gọi là hoàn thiện.[7]

P4 đưa ra một view-model UI thuần `SyncHealth`, chỉ đọc các tín hiệu sẵn có: signed-in, online, isSyncing, pending/dead outbox counts, conflict count, recovery/read-only state và kết quả callback gần nhất trong session. Nó không gọi engine, không ghi database và không suy đoán server state.

| Trạng thái ưu tiên | Người dùng thấy | CTA chính | Điều hệ thống **không** làm |
|---|---|---|---|
| **Recovery locked** | “Hoàn tất khôi phục trước khi đồng bộ.” | Mở flow khôi phục đã có. | Không push/pull/ghi mới. |
| **Conflict needs decision** | Số xung đột, entity và timestamp an toàn; sync tạm dừng. | “Xử lý xung đột”. | Không tự chọn local/remote; không overwrite im lặng. |
| **Offline** | “Các thay đổi vẫn trên thiết bị này.” | Không hứa “đã đồng bộ”; nêu điều kiện online. | Không đổi status thành synced hoặc giả lập retry. |
| **Queued / needs attention** | Số thay đổi chờ hoặc items chưa gửi được, phân biệt với success. | “Đồng bộ ngay” hoặc xem chi tiết an toàn. | Không xóa/retry vô hạn hoặc làm mất outbox. |
| **Syncing** | Tiến trình rõ, action disabled chống double-submit. | Không có CTA cạnh tranh. | Không cho chạy hai sync song song. |
| **Clean** | “Đã kiểm tra đồng bộ” trong ngữ cảnh session. | “Đồng bộ lại” thủ công. | Không tuyên bố tuyệt đối nếu offline/unknown. |

Thứ tự ưu tiên quan trọng: recovery và conflict luôn che trạng thái “synced”; offline không thể hiển thị như clean cloud state; queued/dead không thể bị làm mờ thành một dấu check. `SyncStatusIndicator`, header/avatar, banner App và Settings phải tiêu thụ cùng input/label logic để không có hai nơi nói mâu thuẫn.

### 5.2. Trải nghiệm Settings mới

Nút Sync hàng đầu vẫn ở vị trí dễ thấy, nhưng có một **Sync Health summary** ngay dưới nó. Summary gồm trạng thái, mô tả ngắn, count thích hợp và CTA duy nhất theo status. Chi tiết queue/conflict vẫn mở trong phần Advanced để giữ màn Settings gọn, nhưng banner conflict hoặc CTA phải focus đến đúng section như hiện có.

| Bề mặt | Thiết kế P4 | Ràng buộc UX và dữ liệu |
|---|---|---|
| Header/avatar/status badge | Localized label + count theo `SyncHealth`; không hard-code `chờ`. | Chỉ status; không thực hiện sync khi người dùng chỉ xem menu. |
| Sync Health summary | Đề mục, trạng thái, thông điệp trung thực, CTA duy nhất; `aria-live` cho result. | Không persist “last success” mới vào schema; chỉ dùng result trong session nếu có. |
| Queue/dead attention | Giải thích “đang chờ” khác “không gửi được”; link/focus tới xử lý đã có. | Không tự revive/dead-letter; dùng capability hiện hữu và error an toàn. |
| Conflict card | Giữ metadata tối thiểu, local/remote actions, dialog xác nhận, warning server deletion. | Không hiển thị dữ liệu nhạy cảm đầy đủ hoặc field-level merge. |
| Import with pending sync | Giữ lựa chọn “đẩy trước”, nêu risk, yêu cầu explicit accept. | Không được rút ngắn confirmation hay bỏ safety backup. |
| Logout ở Settings | Thay `auth.signOut()` trực tiếp bằng `onRequestSignOut` từ App shell, dùng đúng guard/banners/retry flow. | Mọi đường đăng xuất cùng blocker rule; auth không đổi. |

### 5.3. Resolution không thay đổi semantics

Màn conflict hiện đã có local/remote, confirmation dialog, focus trap, alert/status và các result safe.[3] P4 cải thiện cách hiểu, không thay đổi thuật toán resolution:

1. Card nói rõ object nào bị xung đột và thời gian thiết bị/server được cập nhật, hoặc server đã xóa.
2. Người dùng chọn **Giữ dữ liệu trên thiết bị** hoặc **Dùng dữ liệu đã đồng bộ**. Chọn server deletion dùng wording đỏ, nêu rõ hậu quả.
3. Dialog nhắc hậu quả đúng choice, mặc định focus vào “Quay lại” và chỉ gọi resolution sau confirm.
4. Sau callback, status result phải tách rõ: thành công, local saved but queued, remote changed again / needs review, needs-network, hoặc failed without mutation.
5. Khi server state đổi trong lúc xử lý, UI không cố ghi đè lần nữa; reload conflict và yêu cầu người dùng xem lại.

Không thêm “Merge từng trường”, “Luôn chọn mới nhất” hay “Resolve all”. Các lựa chọn đó không an toàn cho giao dịch tài chính khi không có model/domain semantics mới được owner chấp thuận.

### 5.4. Test matrix Sync Health

| Scenario | Điều cần chứng minh |
|---|---|
| Chưa đăng nhập | Sync nói rõ cần đăng nhập; không gọi engine. |
| Offline có thay đổi local | Không hiện synced; data giữ nguyên; CTA không giả thành công. |
| Clean signed-in | Một sync click, disabled trong flight, kết quả success localized. |
| Pending/dead item | Count và wording đúng; không bị che bởi “Đã đồng bộ”. |
| Một/nhiều conflict | Banner, avatar và Settings cùng count/label; CTA focus section; local/remote dialog rõ ràng. |
| Server deletion | Warning riêng; only confirmation có thể áp dụng deletion. |
| Network/revision race | Không overwrite; feedback safe; list refresh; người dùng vẫn có data local. |
| Recovery locked | Sync/import/logout đều theo guard tồn tại. |
| Logout từ avatar và Settings | Cùng app-shell handler, cùng blocker/retry/recovery flow; tuyệt đối không có direct bypass. |
| Locale Đức | Toàn bộ status, alert, CTA, dialog và `aria-label` bằng Đức. |

## 6. Thứ tự triển khai và các PR độc lập

P4 cần được chia để mỗi PR có một mục tiêu tin cậy, dễ review và có khả năng rollback. Không merge tự động; mỗi PR vẫn cần review người dùng sau khi các gate xanh.

| PR đề xuất | Nội dung | Phụ thuộc | Gate trước review |
|---|---|---|---|
| **P4.1a — Locale foundation & critical actions** | Formatter UI, typed local dictionaries, Transactions validation/date/number, Settings/App/SyncStatusIndicator/Import DE. | Không phụ thuộc schema. | `npm test`, `npm run build`, test Đức cho action nguy hiểm, 390 px smoke. |
| **P4.1b — German product sweep** | Leaf components và routes còn lại; audit script report → gate sau baseline. | P4.1a. | Full DE route matrix, no overflow, no mixed UI copy. |
| **P4.2 — Ledger benchmark contract** | Fixture, unit contract suite, Playwright DOM/interactions, benchmark artifact/document. | Có thể làm song song với P4.1b nếu tránh sửa `Transactions` cùng lúc. | Existing tests + 1.000-row assertions; timing report không flaky. |
| **P4.3a — Sync Health & guarded logout** | Pure UI model, status copy thống nhất, Settings summary, route toàn bộ logout qua App. | P4.1a cho copy/format. | Sync status matrix, guard regression, keyboard/focus tests. |
| **P4.3b — Conflict clarity & release polish** | Wording/visual hierarchy cho conflict, mobile DE/VI states, final e2e matrix. | P4.3a. | `npm test`, build, preview/edge/release smoke và review thao tác conflict. |

## 7. Release definition of done

P4 chỉ được coi là hoàn tất khi mọi dòng dưới đây đúng trên `main` và trong CI. Nếu benchmark mới phát hiện regression, phải giữ scope ở layer view-model/UI hoặc mở một đề xuất riêng; không được lén thay đổi schema/sync engine để “qua số”.

| Nhóm | Điều kiện release |
|---|---|
| **Localization** | Đức nhất quán cho mọi UI copy tại route đã liệt kê; date/number locale-aware; raw user data được giữ nguyên; DE and VI tests xanh. |
| **Ledger** | Hợp đồng 60-row và analytics full-ledger được chứng minh ở 1.000 fixture; Playwright không full-render; benchmark artifact có baseline được đọc/review. |
| **Sync safety** | Một logout guard duy nhất; mọi status ưu tiên nhất quán; không auto-resolve; conflict/recovery/import/offline tests xanh. |
| **Non-regression** | Không có migration/schema/`src/lib` data-sync-auth thay đổi; `npm test`, `npm run build`, preview smoke, edge smoke và release verification đều xanh. |
| **UX review** | 390 px Đức và Việt: không horizontal overflow, CTA không cắt chữ, focus/dialog/live region hoạt động; các quyết định destructive được review thủ công. |

## 8. Quyết định cần owner phê duyệt

Thiết kế này đề xuất bắt đầu bằng **P4.1a** vì nó xử lý trực tiếp vấn đề người dùng nhìn thấy mỗi ngày: tiếng Đức bị lẫn ở thời điểm lưu/xóa/lỗi/status. P4.2 chạy tiếp theo để tạo dữ liệu quyết định cho tương lai 1.000+ giao dịch, còn P4.3a được thực hiện sau khi foundation copy đã ổn để các trạng thái sync không tự quay về tiếng Việt.

> Xác nhận cần thiết trước khi bắt đầu mã: phê duyệt thứ tự **P4.1a → P4.1b/P4.2 → P4.3a → P4.3b** và các ranh giới không thay schema, không thay `src/lib` data/sync/auth, không auto-resolve xung đột.

## References

[1]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/d7980dc/docs/transactions-scale.md "Transactions at scale"
[2]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/d7980dc/src/pages/Transactions.tsx "Transactions page"
[3]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/d7980dc/src/components/SyncConflictSection.tsx "Sync conflict section"
[4]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/d7980dc/src/lib/locale.tsx "Locale provider"
[5]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/d7980dc/src/components/SyncStatusIndicator.tsx "Sync status indicator"
[6]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/d7980dc/package.json "Package scripts"
[7]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/d7980dc/src/pages/Settings.tsx "Settings sync and logout surface"
