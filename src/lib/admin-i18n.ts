/**
 * Admin UI 9-language dictionary (th/en/zh/vi/ja/ko/ru/es).
 * Simplified Chinese uses zh strings + browser font; cn alias → zh.
 */

export type AdminLocale = "th" | "en" | "zh" | "vi" | "ja" | "ko" | "ru" | "es";

export const ADMIN_LOCALES: AdminLocale[] = ["th", "en", "zh", "vi", "ja", "ko", "ru", "es"];

type Dict = Record<string, Partial<Record<AdminLocale, string>> & { th: string; en: string }>;

const D: Dict = {
  "nav.dashboard": { th: "ภาพรวม", en: "Overview", zh: "總覽", vi: "Tổng quan", ja: "概要", ko: "개요", ru: "Обзор", es: "Resumen" },
  "nav.members": { th: "สมาชิก", en: "Members", zh: "會員", vi: "Thành viên", ja: "会員", ko: "회원", ru: "Участники", es: "Miembros" },
  "nav.orders": { th: "ออเดอร์", en: "Orders", zh: "訂單", vi: "Đơn hàng", ja: "注文", ko: "주문", ru: "Заказы", es: "Pedidos" },
  "nav.support": { th: "ซัพพอร์ต", en: "Support", zh: "支援", vi: "Hỗ trợ", ja: "サポート", ko: "지원", ru: "Поддержка", es: "Soporte" },
  "nav.community": { th: "ข่าวสาร / แจ้งปัญหา", en: "News / Reports", zh: "公告 / 問題回報", vi: "Tin tức / Báo lỗi", ja: "お知らせ / 問題報告", ko: "소식 / 문제 신고", ru: "Новости / Обращения", es: "Noticias / Reportes" },
  "nav.aicost": { th: "ต้นทุน AI", en: "AI cost", zh: "AI 成本", vi: "Chi phí AI", ja: "AIコスト", ko: "AI 비용", ru: "Стоимость AI", es: "Coste AI" },
  "nav.finance": { th: "การเงิน", en: "Finance", zh: "財務", vi: "Tài chính", ja: "財務", ko: "재무", ru: "Финансы", es: "Finanzas" },
  "nav.packages": { th: "แพ็กเกจ", en: "Packages", zh: "方案", vi: "Gói", ja: "プラン", ko: "패키지", ru: "Пакеты", es: "Paquetes" },
  "nav.iam": { th: "แอดมิน & สิทธิ์", en: "Staff & roles", zh: "權限", vi: "Nhân sự", ja: "権限", ko: "권한", ru: "Роли", es: "Roles" },
  "nav.chatmon": { th: "มอนิเตอร์แชท", en: "Chat Monitor", zh: "對話監控", vi: "Giám sát chat", ja: "チャット監視", ko: "채팅 모니터", ru: "Мониторинг чатов", es: "Monitor de chats" },
  "nav.settings": { th: "ตั้งค่า", en: "Settings", zh: "設定", vi: "Cài đặt", ja: "設定", ko: "설정", ru: "Настройки", es: "Ajustes" },
  "nav.affiliate": { th: "แอฟฟิลิเอต", en: "Affiliate", zh: "聯盟", vi: "Affiliate", ja: "アフィリエイト", ko: "제휴", ru: "Партнёры", es: "Afiliados" },
  "nav.back": { th: "← หลังบ้าน", en: "← Admin", zh: "← 後台", vi: "← Admin", ja: "← 管理", ko: "← 관리", ru: "← Админ", es: "← Admin" },
  "title.admin": { th: "หลังบ้าน", en: "Admin", zh: "管理後台", vi: "Quản trị", ja: "管理画面", ko: "관리자", ru: "Админка", es: "Admin" },
  "title.members": { th: "สมาชิก", en: "Members", zh: "會員", vi: "Thành viên", ja: "会員", ko: "회원", ru: "Участники", es: "Miembros" },
  "title.user360": { th: "User 360", en: "User 360", zh: "用戶全景", vi: "User 360", ja: "ユーザー360", ko: "User 360", ru: "User 360", es: "User 360" },
  "title.orders": { th: "ออเดอร์", en: "Orders", zh: "訂單", vi: "Đơn hàng", ja: "注文", ko: "주문", ru: "Заказы", es: "Pedidos" },
  "title.iam": { th: "พนักงาน & บทบาท", en: "Staff & roles", zh: "員工與角色", vi: "Nhân sự & vai trò", ja: "スタッフと役割", ko: "스태프 & 역할", ru: "Сотрудники и роли", es: "Personal y roles" },
  "search.placeholder": { th: "ค้น email / ชื่อ / เบอร์", en: "Search email / name / phone", zh: "搜尋電郵/名稱/電話", vi: "Tìm email / tên / SĐT", ja: "メール/名前/電話", ko: "이메일/이름/전화", ru: "Email / имя / телефон", es: "Email / nombre / teléfono" },
  "filter.all_tiers": { th: "ทุก tier", en: "All tiers", zh: "全部等級", vi: "Mọi tier", ja: "全ティア", ko: "전체 티어", ru: "Все уровни", es: "Todos los tiers" },
  "filter.all_plans": { th: "ทุก plan", en: "All plans", zh: "全部方案", vi: "Mọi plan", ja: "全プラン", ko: "전체 plan", ru: "Все планы", es: "Todos los planes" },
  "filter.all_status": { th: "ทุกสถานะ", en: "All status", zh: "全部狀態", vi: "Mọi trạng thái", ja: "全状態", ko: "전체 상태", ru: "Все статусы", es: "Todos los estados" },
  "filter.active": { th: "ใช้งาน", en: "Active", zh: "啟用", vi: "Hoạt động", ja: "有効", ko: "활성", ru: "Активен", es: "Activo" },
  "filter.suspended": { th: "ระงับ", en: "Suspended", zh: "停用", vi: "Tạm khóa", ja: "停止", ko: "정지", ru: "Блок", es: "Suspendido" },
  "col.email": { th: "อีเมล", en: "Email", zh: "電郵", vi: "Email", ja: "メール", ko: "이메일", ru: "Email", es: "Email" },
  "col.name": { th: "ชื่อ", en: "Name", zh: "名稱", vi: "Tên", ja: "名前", ko: "이름", ru: "Имя", es: "Nombre" },
  "col.plan": { th: "plan", en: "Plan", zh: "方案", vi: "Plan", ja: "プラン", ko: "플랜", ru: "План", es: "Plan" },
  "col.tier": { th: "tier", en: "Tier", zh: "等級", vi: "Tier", ja: "ティア", ko: "티어", ru: "Уровень", es: "Tier" },
  "col.trial": { th: "ทดลอง", en: "Trial", zh: "試用", vi: "Trial", ja: "トライアル", ko: "트라이얼", ru: "Триал", es: "Prueba" },
  "col.yam": { th: "ยาม", en: "Credits", zh: "時", vi: "Yam", ja: "時", ko: "크레딧", ru: "Кредиты", es: "Créditos" },
  "col.joined": { th: "สมัคร", en: "Joined", zh: "註冊", vi: "Đăng ký", ja: "登録", ko: "가입", ru: "Регистрация", es: "Alta" },
  "col.status": { th: "สถานะ", en: "Status", zh: "狀態", vi: "Trạng thái", ja: "状態", ko: "상태", ru: "Статус", es: "Estado" },
  "action.adjust": { th: "ปรับยาม", en: "Adjust credits", zh: "調整時", vi: "Chỉnh yam", ja: "時を調整", ko: "크레딧 조정", ru: "Коррекция", es: "Ajustar" },
  "action.suspend": { th: "ระงับบัญชี", en: "Suspend", zh: "停用帳號", vi: "Khóa", ja: "停止", ko: "정지", ru: "Заблокировать", es: "Suspender" },
  "action.restore": { th: "คืนสถานะ", en: "Restore", zh: "恢復", vi: "Khôi phục", ja: "復帰", ko: "복구", ru: "Восстановить", es: "Restaurar" },
  "action.extend": { th: "ต่ออายุ", en: "Extend sub", zh: "延長會籍", vi: "Gia hạn", ja: "延長", ko: "연장", ru: "Продлить", es: "Extender" },
  "action.extend_trial": { th: "ต่อ trial", en: "Extend trial", zh: "延長試用", vi: "Gia hạn trial", ja: "トライアル延長", ko: "트라이얼 연장", ru: "Продлить триал", es: "Extender trial" },
  "action.refund": { th: "คืนเงิน + ดึงยาม", en: "Refund + clawback", zh: "退款並扣時", vi: "Hoàn tiền", ja: "返金+回収", ko: "환불+회수", ru: "Возврат", es: "Reembolso" },
  "action.save": { th: "บันทึก", en: "Save", zh: "儲存", vi: "Lưu", ja: "保存", ko: "저장", ru: "Сохранить", es: "Guardar" },
  "action.grant": { th: "มอบบทบาท", en: "Grant role", zh: "授予角色", vi: "Gán vai trò", ja: "役割付与", ko: "역할 부여", ru: "Выдать роль", es: "Asignar rol" },
  "action.invite": { th: "เชิญแอดมิน", en: "Invite staff", zh: "邀請管理員", vi: "Mời admin", ja: "招待", ko: "초대", ru: "Пригласить", es: "Invitar" },
  "tab.overview": { th: "ภาพรวม", en: "Overview", zh: "概覽", vi: "Tổng quan", ja: "概要", ko: "개요", ru: "Обзор", es: "Resumen" },
  "tab.billing": { th: "บิล/ออเดอร์", en: "Billing", zh: "帳單", vi: "Thanh toán", ja: "請求", ko: "결제", ru: "Оплата", es: "Facturación" },
  "tab.yam": { th: "ยาม", en: "Credits", zh: "時", vi: "Yam", ja: "時", ko: "크레딧", ru: "Кредиты", es: "Créditos" },
  "tab.profiles": { th: "ดวง", en: "Profiles", zh: "命盤", vi: "Hồ sơ", ja: "プロフィール", ko: "프로필", ru: "Профили", es: "Perfiles" },
  "tab.notes": { th: "โน้ต", en: "Notes", zh: "備註", vi: "Ghi chú", ja: "メモ", ko: "메모", ru: "Заметки", es: "Notas" },
  "tab.affiliate": { th: "แอฟฟิลิเอต", en: "Affiliate", zh: "聯盟", vi: "Affiliate", ja: "アフィリ", ko: "제휴", ru: "Партнёр", es: "Afiliado" },
  "empty": { th: "ไม่พบข้อมูล", en: "No data", zh: "無資料", vi: "Không có dữ liệu", ja: "データなし", ko: "데이터 없음", ru: "Нет данных", es: "Sin datos" },
  "ok": { th: "สำเร็จ", en: "Done", zh: "完成", vi: "Xong", ja: "完了", ko: "완료", ru: "Готово", es: "Listo" },
  "err": { th: "ผิดพลาด", en: "Error", zh: "錯誤", vi: "Lỗi", ja: "エラー", ko: "오류", ru: "Ошибка", es: "Error" },
  "note.required": { th: "ต้องใส่หมายเหตุ", en: "Note required", zh: "需要備註", vi: "Cần ghi chú", ja: "メモ必須", ko: "메모 필수", ru: "Нужна заметка", es: "Nota requerida" },
  "affiliate.readonly": {
    th: "อ่านอย่างเดียว · จัดการที่โมดูล Affiliate",
    en: "Read-only · manage in Affiliate module",
    zh: "唯讀 · 請至聯盟模組管理",
    vi: "Chỉ đọc · quản lý ở module Affiliate",
    ja: "読取専用 · Affiliateモジュールで管理",
    ko: "읽기 전용 · Affiliate 모듈에서 관리",
    ru: "Только чтение · модуль Affiliate",
    es: "Solo lectura · módulo Affiliate",
  },
  "packages.sot": {
    th: "แพ็กเกจ checkout ใช้โค้ด packages.ts เป็นแหล่งเดียว",
    en: "Checkout packages: single source packages.ts",
    zh: "結帳方案以 packages.ts 為唯一來源",
    vi: "Gói checkout: nguồn packages.ts",
    ja: "決済プランは packages.ts のみ",
    ko: "체크아웃 패키지 SoT: packages.ts",
    ru: "Пакеты checkout: packages.ts",
    es: "Paquetes checkout: packages.ts",
  },
  /* ── สถิติผู้ใช้ (dashboard /admin · /api/admin/user-stats) ── */
  "stats.title": { th: "สถิติผู้ใช้", en: "User statistics", zh: "用戶統計" },
  "stats.online_now": { th: "ออนไลน์ตอนนี้", en: "Online now", zh: "目前在線" },
  "stats.online_def": { th: "นับผู้ใช้ที่มีกิจกรรมภายใน {m} นาทีล่าสุด (login / ใช้งานหน้าเว็บ / งาน AI)", en: "Users active within the last {m} minutes (login / page use / AI jobs)", zh: "最近 {m} 分鐘內有活動的用戶（登入／瀏覽／AI 任務）" },
  "stats.no_online": { th: "ยังไม่มีใครออนไลน์", en: "No one online", zh: "目前無人在線" },
  "stats.new_today": { th: "สมัครใหม่วันนี้", en: "New signups today", zh: "今日新註冊" },
  "stats.new_7d": { th: "7 วัน", en: "7 days", zh: "7天" },
  "stats.new_30d": { th: "30 วัน", en: "30 days", zh: "30天" },
  "stats.active_users": { th: "ผู้ใช้ใช้งานจริง", en: "Active users", zh: "活躍用戶" },
  "stats.yam_total": { th: "ยามคงเหลือรวม", en: "Total credits left", zh: "剩餘時總量" },
  "stats.yam_avg": { th: "เฉลี่ยต่อคน", en: "avg/user", zh: "人均" },
  "stats.yam_spent": { th: "ใช้ไปทั้งหมด", en: "total spent", zh: "已用" },
  "stats.signup_trend": { th: "สมัครใหม่รายวัน 30 วันล่าสุด", en: "Daily signups · last 30 days", zh: "近30天每日註冊" },
  "stats.verified": { th: "ยืนยันแล้ว", en: "Verified", zh: "已驗證" },
  "stats.unverified": { th: "ยังไม่ยืนยัน", en: "unverified", zh: "未驗證" },
  "stats.by_signup": { th: "ช่องทางสมัคร", en: "Signup channel", zh: "註冊管道" },
  "stats.plan_free": { th: "แผนฟรี", en: "Free plan", zh: "免費方案" },
  "stats.plan_paid": { th: "แผนจ่ายเงิน", en: "Paid plan", zh: "付費方案" },
  "stats.features": { th: "การใช้งานฟีเจอร์ (จากตารางงานจริง)", en: "Feature usage (from job tables)", zh: "功能使用（任務表實數）" },
  "stats.today": { th: "วันนี้", en: "Today", zh: "今日" },
  "stats.week7": { th: "7 วันล่าสุด", en: "Last 7 days", zh: "近7天" },
  "stats.revenue": { th: "รายได้", en: "Revenue", zh: "收入" },
  "stats.this_week": { th: "สัปดาห์นี้", en: "This week", zh: "本週" },
  "stats.this_month": { th: "เดือนนี้", en: "This month", zh: "本月" },
  "stats.orders_paid": { th: "ออเดอร์สำเร็จ", en: "paid orders", zh: "成功訂單" },
  "stats.recent_users": { th: "ผู้ใช้ล่าสุด 20 คน", en: "Latest 20 users", zh: "最新20位用戶" },
  "stats.view_all": { th: "ดูสมาชิกทั้งหมด", en: "View all members", zh: "查看全部會員" },
  "stats.col_online": { th: "ออนไลน์", en: "Online", zh: "在線" },
  "stats.last_active": { th: "ใช้งานล่าสุด", en: "Last active", zh: "最後活躍" },
  "stats.feature_fusion": { th: "รวมดวง 6 ศาสตร์ (fusion)", en: "Fusion (6 sciences)", zh: "六科融合" },
  "stats.feature_palm": { th: "ดูลายมือ (palm)", en: "Palm reading", zh: "手相" },
  "stats.feature_export": { th: "Export PDF", en: "Export PDF", zh: "匯出PDF" },
  "stats.feature_hourkey": { th: "งานเบื้องหลังอื่น (jobs)", en: "Other background jobs", zh: "其他背景任務" },
  /* ── การแจ้งเตือนหลังบ้าน (/admin/notify · r497) ── */
  "nav.notify": { th: "แจ้งเตือน", en: "Notifications", zh: "通知", vi: "Thông báo", ja: "通知", ko: "알림", ru: "Уведомления", es: "Notificaciones" },
  "title.notify": { th: "การแจ้งเตือน", en: "Notifications", zh: "通知", vi: "Thông báo", ja: "通知", ko: "알림", ru: "Уведомления", es: "Notificaciones" },
  "notify.hint": {
    th: "แจ้งเตือนเด้งถึงมือถือแอดมินเมื่อมีเหตุการณ์สำคัญ — เปิดแจ้งเตือนบนเครื่องนี้ก่อน แล้วเลือกเหตุการณ์ที่ต้องการ",
    en: "Push alerts to your phone on key events — enable this device first, then pick events.",
    zh: "重要事件即時推播到你的手機 — 先在此裝置開啟通知，再選擇事件。",
  },
  "notify.device": { th: "เครื่องนี้", en: "This device", zh: "此裝置" },
  "notify.device_ok": { th: "เครื่องนี้เปิดรับแจ้งเตือนแล้ว", en: "This device is subscribed", zh: "此裝置已訂閱通知" },
  "notify.device_off": { th: "เครื่องนี้ยังไม่เปิดรับแจ้งเตือน", en: "This device is not subscribed yet", zh: "此裝置尚未訂閱通知" },
  "notify.devices": { th: "เครื่องที่รับแจ้งเตือน", en: "Subscribed devices", zh: "已訂閱裝置" },
  "notify.enable_device": { th: "เปิดแจ้งเตือนบนเครื่องนี้", en: "Enable on this device", zh: "在此裝置開啟通知" },
  "notify.test": { th: "ทดสอบแจ้งเตือน", en: "Send test push", zh: "傳送測試通知" },
  "notify.test_sent": { th: "ส่งแล้ว เช็คแจ้งเตือนบนเครื่อง", en: "Sent — check your device", zh: "已傳送 — 請查看裝置通知" },
  "notify.no_sub": { th: "ยังไม่มีเครื่องไหน subscribe — กดเปิดแจ้งเตือนบนเครื่องนี้ก่อน", en: "No subscribed device — enable this device first", zh: "尚無已訂閱裝置 — 請先在此裝置開啟通知" },
  "notify.no_vapid": { th: "server ยังไม่ตั้งค่า VAPID key", en: "Server VAPID keys not configured", zh: "伺服器未設定 VAPID 金鑰" },
  "notify.unsupported": { th: "เบราว์เซอร์นี้ไม่รองรับแจ้งเตือน", en: "This browser does not support push", zh: "此瀏覽器不支援推播" },
  "notify.ios_install": { th: "iOS ต้องติดตั้งแอปไว้หน้าจอโฮมก่อนถึงเปิดแจ้งเตือนได้", en: "On iOS, install the app to the home screen first", zh: "iOS 需先將應用加入主畫面才能開啟通知" },
  "notify.denied": { th: "ถูกปฏิเสธสิทธิ์แจ้งเตือน — เปิดใหม่ในตั้งค่าเบราว์เซอร์", en: "Permission denied — allow notifications in browser settings", zh: "通知權限被拒 — 請到瀏覽器設定開啟" },
  "notify.events": { th: "เหตุการณ์ที่แจ้งเตือน", en: "Events", zh: "通知事件" },
  "notify.ev.user_signup": { th: "สมาชิกสมัครใหม่", en: "New signup", zh: "新會員註冊" },
  "notify.ev.user_signup.desc": { th: "มีคนสมัครสมาชิกใหม่ · กดแล้วเปิดหน้าสมาชิก", en: "A new user signed up · opens Members", zh: "有新用戶註冊 · 點擊開啟會員頁" },
  "notify.ev.order_paid": { th: "มีการชำระเงิน", en: "Payment received", zh: "收到付款" },
  "notify.ev.order_paid.desc": { th: "มีออเดอร์จ่ายเงินสำเร็จ · กดแล้วเปิดหน้าออเดอร์", en: "An order was paid · opens Orders", zh: "訂單付款成功 · 點擊開啟訂單頁" },
  "notify.ev.job_fail_spike": { th: "งานพังผิดปกติ", en: "Job failure spike", zh: "任務異常失敗" },
  "notify.ev.job_fail_spike.desc": { th: "งานเบื้องหลังพังหลายงานใน 10 นาที · กดแล้วเปิดหลังบ้าน", en: "Multiple background jobs failed within 10 minutes", zh: "10 分鐘內多個背景任務失敗" },
  "notify.worker_note": {
    th: "ตัวส่งจริงคือ watcher หลังบ้าน (เช็คทุก 60 วิ) — แจ้งเตือนถึงทุกเครื่องที่เปิดรับของแอดมินแต่ละคน",
    en: "Delivered by the backend watcher (polls every 60s) to every subscribed device of each admin.",
    zh: "由後台 watcher（每 60 秒輪詢）送到每位管理員已訂閱的所有裝置。",
  },
};

export function normalizeAdminLocale(raw: string | null | undefined): AdminLocale {
  const x = String(raw || "th").trim().toLowerCase().replace("_", "-");
  if (x.startsWith("zh") || x === "cn" || x === "hans" || x === "hant") return "zh";
  if (x.startsWith("en")) return "en";
  if (x.startsWith("th")) return "th";
  if ((ADMIN_LOCALES as string[]).includes(x)) return x as AdminLocale;
  return "th";
}

export function tAdmin(key: string, locale: AdminLocale, fallback?: string): string {
  const row = D[key];
  if (!row) return fallback || key;
  return row[locale] || row.en || row.th || fallback || key;
}

export function adminDict(locale: AdminLocale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(D)) out[k] = tAdmin(k, locale);
  return out;
}
