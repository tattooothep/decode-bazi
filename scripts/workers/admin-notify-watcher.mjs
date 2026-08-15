#!/usr/bin/env node
import nextEnv from "@next/env";
import pg from "pg";
import webPush from "web-push";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const mobileDelivery = require("../../src/lib/mobile-notification-delivery.cjs");
const notificationPayload = require("../../src/lib/notification-payload.cjs");

nextEnv.loadEnvConfig(process.cwd(), false, console);

const DRY_RUN = process.argv.includes("--dry-run");
const ONCE = process.argv.includes("--once");
const OUTBOX_ONLY = process.argv.includes("--outbox-only");
const POLL_MS = Math.max(5_000, Number(process.env.ADMIN_NOTIFY_POLL_MS || 30_000));
const BATCH_SIZE = Math.max(1, Math.min(100, Number(process.env.ADMIN_NOTIFY_BATCH_SIZE || 50)));
const SPIKE_THRESHOLD = Math.max(1, Number(process.env.ADMIN_NOTIFY_FAIL_SPIKE || 3));
const WORKER_ID = `${process.pid}:${randomUUID().slice(0, 8)}`;
const MAX_SUB_FAIL = 5;
const DEFAULT_ON = new Set([
  "support_report_new", "support_user_reply", "payment_exception", "refund_failed",
  "service_unhealthy", "service_recovered", "admin_role_changed",
]);

const db = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 4,
});

let vapidReady = false;
try {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:tattoothep@gmail.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidReady = true;
  }
} catch {
  console.error(JSON.stringify({ event: "vapid_error", error_code: "vapid_setup_failed" }));
}

const COPY = {
  th: {
    user_signup: ["สมาชิกใหม่", "มีสมาชิกสมัครใหม่"], order_paid: ["มีการชำระเงิน", "มีออเดอร์ชำระเงินสำเร็จ"],
    job_fail_spike: ["งานล้มเหลวผิดปกติ", "มีงานเบื้องหลังล้มเหลวหลายรายการ"],
    support_report_new: ["มีรายงานปัญหาใหม่", "ผู้ใช้ส่งปัญหาใหม่ แตะเพื่อเปิด ticket"],
    support_user_reply: ["ผู้ใช้ตอบกลับแล้ว", "มีข้อความใหม่ใน ticket"],
    support_admin_reply: ["ทีมงานตอบกลับแล้ว", "แตะเพื่ออ่านคำตอบในศูนย์ช่วยเหลือ"],
    support_status_changed: ["สถานะปัญหาอัปเดต", "ทีมงานอัปเดตสถานะ ticket ของคุณ"],
    account_login: ["มีการเข้าสู่ระบบบัญชี", "หากไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านทันที"],
    password_changed: ["เปลี่ยนรหัสผ่านแล้ว", "รหัสผ่านบัญชี Hourkey ของคุณถูกเปลี่ยน"],
    password_reset: ["รีเซ็ตรหัสผ่านแล้ว", "รหัสผ่านบัญชี Hourkey ของคุณถูกรีเซ็ต"],
    store_purchase_updated: ["อัปเดตสมาชิกหรือการชำระเงินแล้ว", "แตะเพื่อตรวจสอบสถานะและใบเสร็จ"],
    payment_exception: ["การชำระเงินผิดปกติ", "พบออเดอร์ที่ชำระแล้วแต่ดำเนินการไม่สำเร็จ"],
    refund_failed: ["คืนเงินไม่สำเร็จ", "ตรวจสอบออเดอร์และการดึงยามโดยด่วน"],
    service_unhealthy: ["ระบบบางส่วนไม่พร้อม", "Health check ล้มต่อเนื่อง แตะเพื่อตรวจสอบ"],
    service_recovered: ["ระบบกลับมาปกติ", "บริการที่มีปัญหากลับมาทำงานแล้ว"],
    admin_role_changed: ["สิทธิ์แอดมินเปลี่ยน", "มีการเพิ่มหรือถอนบทบาทแอดมิน"],
  },
  en: {
    user_signup: ["New member", "A new member signed up"], order_paid: ["Payment received", "An order was paid successfully"],
    job_fail_spike: ["Job failure spike", "Multiple background jobs failed"],
    support_report_new: ["New issue report", "A user submitted an issue"], support_user_reply: ["User replied", "A support ticket has a new reply"],
    support_admin_reply: ["Support replied", "Open Help Center to read the response"], support_status_changed: ["Issue status updated", "Your support ticket status changed"],
    account_login: ["Account sign-in", "If this was not you, change your password now"], password_changed: ["Password changed", "Your Hourkey account password was changed"], password_reset: ["Password reset", "Your Hourkey account password was reset"],
    store_purchase_updated: ["Membership or payment updated", "Open the app to review status and receipt"],
    payment_exception: ["Payment exception", "A paid order could not be fulfilled"], refund_failed: ["Refund failed", "Review the order and credit clawback"],
    service_unhealthy: ["Service unhealthy", "Health checks failed repeatedly"], service_recovered: ["Service recovered", "Affected services are healthy again"],
    admin_role_changed: ["Admin access changed", "An admin role was granted or revoked"],
  },
  zh: {
    user_signup: ["新會員", "有新會員註冊"], order_paid: ["收到付款", "訂單付款成功"], job_fail_spike: ["任務異常", "多個背景任務失敗"],
    support_report_new: ["新的問題回報", "用戶送出新的問題"], support_user_reply: ["用戶已回覆", "支援 ticket 有新訊息"],
    support_admin_reply: ["團隊已回覆", "開啟支援中心查看回覆"], support_status_changed: ["問題狀態已更新", "你的 ticket 狀態已變更"],
    account_login: ["帳戶已登入", "若非本人操作，請立即更改密碼"], password_changed: ["密碼已更改", "您的 Hourkey 帳戶密碼已更改"], password_reset: ["密碼已重設", "您的 Hourkey 帳戶密碼已重設"],
    store_purchase_updated: ["會員或付款已更新", "開啟應用程式查看狀態與收據"],
    payment_exception: ["付款異常", "已付款訂單未能完成"], refund_failed: ["退款失敗", "請檢查訂單與點數回收"],
    service_unhealthy: ["系統異常", "健康檢查連續失敗"], service_recovered: ["系統已恢復", "受影響服務已恢復正常"],
    admin_role_changed: ["管理員權限變更", "管理員角色已新增或撤銷"],
  },
  cn: {
    user_signup: ["新会员", "有新会员注册"], order_paid: ["收到付款", "订单付款成功"], job_fail_spike: ["任务异常", "多个后台任务失败"],
    support_report_new: ["新的问题报告", "用户提交了新的问题"], support_user_reply: ["用户已回复", "支持工单有新消息"],
    support_admin_reply: ["客服团队已回复", "打开帮助中心查看回复"], support_status_changed: ["问题状态已更新", "你的支持工单状态已变更"],
    account_login: ["账户已登录", "若非本人操作，请立即更改密码"], password_changed: ["密码已更改", "您的 Hourkey 账户密码已更改"], password_reset: ["密码已重置", "您的 Hourkey 账户密码已重置"],
    store_purchase_updated: ["会员或付款已更新", "打开应用查看状态和收据"],
    payment_exception: ["付款异常", "已付款订单未能完成"], refund_failed: ["退款失败", "请检查订单与时数回收"],
    service_unhealthy: ["系统异常", "健康检查连续失败"], service_recovered: ["系统已恢复", "受影响的服务已恢复正常"],
    admin_role_changed: ["管理员权限变更", "管理员角色已授予或撤销"],
  },
  vi: {
    user_signup: ["Thành viên mới", "Có thành viên mới đăng ký"], order_paid: ["Đã nhận thanh toán", "Đơn hàng đã được thanh toán"], job_fail_spike: ["Nhiều tác vụ lỗi", "Nhiều tác vụ nền đã thất bại"],
    support_report_new: ["Báo cáo sự cố mới", "Người dùng vừa gửi một sự cố"], support_user_reply: ["Người dùng đã trả lời", "Phiếu hỗ trợ có tin nhắn mới"],
    support_admin_reply: ["Bộ phận hỗ trợ đã trả lời", "Mở Trung tâm trợ giúp để xem phản hồi"], support_status_changed: ["Trạng thái sự cố đã cập nhật", "Trạng thái phiếu hỗ trợ của bạn đã thay đổi"],
    account_login: ["Đăng nhập tài khoản", "Nếu không phải bạn, hãy đổi mật khẩu ngay"], password_changed: ["Đã đổi mật khẩu", "Mật khẩu tài khoản Hourkey đã được đổi"], password_reset: ["Đã đặt lại mật khẩu", "Mật khẩu tài khoản Hourkey đã được đặt lại"],
    store_purchase_updated: ["Đã cập nhật thành viên hoặc thanh toán", "Mở ứng dụng để xem trạng thái và biên lai"],
    payment_exception: ["Thanh toán bất thường", "Đơn đã thanh toán nhưng chưa thể hoàn tất"], refund_failed: ["Hoàn tiền thất bại", "Hãy kiểm tra đơn hàng và việc thu hồi giờ"],
    service_unhealthy: ["Dịch vụ gặp sự cố", "Kiểm tra tình trạng thất bại liên tiếp"], service_recovered: ["Dịch vụ đã phục hồi", "Các dịch vụ bị ảnh hưởng đã hoạt động bình thường"],
    admin_role_changed: ["Quyền quản trị đã thay đổi", "Một vai trò quản trị đã được cấp hoặc thu hồi"],
  },
  ja: {
    user_signup: ["新規会員", "新しい会員が登録しました"], order_paid: ["支払いを受領", "注文の支払いが完了しました"], job_fail_spike: ["ジョブ障害の増加", "複数のバックグラウンドジョブが失敗しました"],
    support_report_new: ["新しい問題報告", "ユーザーから問題が報告されました"], support_user_reply: ["ユーザーから返信", "サポートチケットに新しい返信があります"],
    support_admin_reply: ["サポートから返信", "ヘルプセンターで回答を確認してください"], support_status_changed: ["問題の状態を更新", "サポートチケットの状態が変わりました"],
    account_login: ["アカウントにログイン", "心当たりがない場合は今すぐパスワードを変更してください"], password_changed: ["パスワードを変更", "Hourkey のパスワードが変更されました"], password_reset: ["パスワードをリセット", "Hourkey のパスワードがリセットされました"],
    store_purchase_updated: ["会員情報または支払いを更新", "アプリで状態と領収書を確認してください"],
    payment_exception: ["支払い処理の異常", "支払い済み注文を完了できませんでした"], refund_failed: ["返金に失敗", "注文と時間の回収を確認してください"],
    service_unhealthy: ["サービスに異常", "ヘルスチェックが連続して失敗しました"], service_recovered: ["サービスが復旧", "影響を受けたサービスは正常に戻りました"],
    admin_role_changed: ["管理者権限を変更", "管理者ロールが付与または取り消されました"],
  },
  ru: {
    user_signup: ["Новый участник", "Зарегистрирован новый участник"], order_paid: ["Платеж получен", "Заказ успешно оплачен"], job_fail_spike: ["Сбой фоновых задач", "Несколько фоновых задач завершились с ошибкой"],
    support_report_new: ["Новое обращение", "Пользователь сообщил о проблеме"], support_user_reply: ["Ответ пользователя", "В обращении появилось новое сообщение"],
    support_admin_reply: ["Ответ поддержки", "Откройте центр помощи, чтобы прочитать ответ"], support_status_changed: ["Статус обращения обновлен", "Статус вашего обращения изменился"],
    account_login: ["Вход в аккаунт", "Если это были не вы, немедленно смените пароль"], password_changed: ["Пароль изменен", "Пароль аккаунта Hourkey был изменен"], password_reset: ["Пароль сброшен", "Пароль аккаунта Hourkey был сброшен"],
    store_purchase_updated: ["Статус подписки или платежа обновлен", "Откройте приложение, чтобы проверить статус и чек"],
    payment_exception: ["Ошибка платежа", "Оплаченный заказ не удалось выполнить"], refund_failed: ["Возврат не выполнен", "Проверьте заказ и списание часов"],
    service_unhealthy: ["Сервис недоступен", "Проверка состояния несколько раз завершилась ошибкой"], service_recovered: ["Сервис восстановлен", "Затронутые сервисы снова работают нормально"],
    admin_role_changed: ["Права администратора изменены", "Роль администратора назначена или отозвана"],
  },
  ko: {
    user_signup: ["신규 회원", "새 회원이 가입했습니다"], order_paid: ["결제 완료", "주문 결제가 완료되었습니다"], job_fail_spike: ["작업 실패 증가", "여러 백그라운드 작업이 실패했습니다"],
    support_report_new: ["새 문제 신고", "사용자가 문제를 신고했습니다"], support_user_reply: ["사용자 답변", "지원 티켓에 새 답변이 있습니다"],
    support_admin_reply: ["지원팀 답변", "도움말 센터에서 답변을 확인하세요"], support_status_changed: ["문제 상태 업데이트", "지원 티켓 상태가 변경되었습니다"],
    account_login: ["계정 로그인", "본인이 아니라면 지금 비밀번호를 변경하세요"], password_changed: ["비밀번호 변경", "Hourkey 계정 비밀번호가 변경되었습니다"], password_reset: ["비밀번호 재설정", "Hourkey 계정 비밀번호가 재설정되었습니다"],
    store_purchase_updated: ["멤버십 또는 결제 업데이트", "앱에서 상태와 영수증을 확인하세요"],
    payment_exception: ["결제 처리 이상", "결제된 주문을 완료하지 못했습니다"], refund_failed: ["환불 실패", "주문과 시간 회수를 확인하세요"],
    service_unhealthy: ["서비스 이상", "상태 확인이 연속으로 실패했습니다"], service_recovered: ["서비스 복구", "영향받은 서비스가 정상으로 돌아왔습니다"],
    admin_role_changed: ["관리자 권한 변경", "관리자 역할이 부여되거나 취소되었습니다"],
  },
  es: {
    user_signup: ["Nuevo miembro", "Se registró un nuevo miembro"], order_paid: ["Pago recibido", "El pedido se pagó correctamente"], job_fail_spike: ["Aumento de tareas fallidas", "Fallaron varias tareas en segundo plano"],
    support_report_new: ["Nuevo reporte de problema", "Un usuario reportó un problema"], support_user_reply: ["Respuesta del usuario", "Hay una nueva respuesta en el ticket"],
    support_admin_reply: ["Respuesta de soporte", "Abre el Centro de ayuda para leer la respuesta"], support_status_changed: ["Estado del problema actualizado", "Cambió el estado de tu ticket de soporte"],
    account_login: ["Inicio de sesión", "Si no fuiste tú, cambia tu contraseña ahora"], password_changed: ["Contraseña cambiada", "Se cambió la contraseña de tu cuenta Hourkey"], password_reset: ["Contraseña restablecida", "Se restableció la contraseña de tu cuenta Hourkey"],
    store_purchase_updated: ["Membresía o pago actualizado", "Abre la app para revisar el estado y el recibo"],
    payment_exception: ["Excepción de pago", "No se pudo completar un pedido pagado"], refund_failed: ["Reembolso fallido", "Revisa el pedido y la recuperación de horas"],
    service_unhealthy: ["Servicio con problemas", "Las comprobaciones de estado fallaron varias veces"], service_recovered: ["Servicio recuperado", "Los servicios afectados volvieron a la normalidad"],
    admin_role_changed: ["Acceso de administrador modificado", "Se concedió o revocó un rol de administrador"],
  },
};

function log(obj) { console.log(JSON.stringify({ ts: new Date().toISOString(), worker: WORKER_ID, ...obj })); }
function localeKey(raw) {
  const value = String(raw || "th").toLowerCase().replace("_", "-");
  if (value.startsWith("zh")) return "zh";
  const base = value.split("-")[0];
  return COPY[base] ? base : "en";
}
function messageFor(eventType, locale, payload, targetUrl = "/account") {
  const lang = localeKey(locale);
  const pair = COPY[lang]?.[eventType] || COPY.en[eventType] || ["hourkey", "There is a new update"];
  let body = pair[1];
  if (eventType === "job_fail_spike" && payload?.failed) body += ` (${payload.failed})`;
  if (eventType === "support_status_changed" && payload?.status) body += ` · ${payload.status}`;
  if ((eventType === "payment_exception" || eventType === "refund_failed") && payload?.order_id) body += ` · #${String(payload.order_id).slice(0, 8)}`;
  const action = lang === "th" ? "แตะเพื่อเปิดและตรวจสอบ"
    : lang === "zh" || lang === "cn" ? "點按開啟並檢查"
      : lang === "vi" ? "Nhấn để mở và kiểm tra"
        : lang === "ja" ? "タップして開き、確認してください"
          : lang === "ru" ? "Нажмите, чтобы открыть и проверить"
            : lang === "ko" ? "탭하여 열고 확인하세요"
              : lang === "es" ? "Toca para abrir y revisar"
                : "Tap to open and review";
  if (!body.includes(action)) body = `${body} · ${action}`;
  return { title: pair[0], body };
}

function categoryForEvent(tag) {
  return /(?:login|password|security|admin_role)/i.test(String(tag || "")) ? "security" : "service";
}

function mobileDestination(tag) {
  const value = String(tag || "");
  if (/(?:login|password|security|admin_role)/iu.test(value)) return "/account";
  if (/^support_/u.test(value)) return "/support";
  if (/(?:order|payment|purchase|refund)/iu.test(value)) return "/store";
  return "/account";
}

function buildAdminMobileNotice({ userId, eventId, eventType, msg, tokens, eventPayload = {} }) {
  const category = categoryForEvent(eventType);
  const url = mobileDestination(eventType);
  const facts = category === "security"
    ? { event: String(eventType).slice(0, 80), url }
    : { event: String(eventType).slice(0, 80), referenceId: String(eventId), url };
  const typed = notificationPayload.buildNotificationPayload(category, String(userId), facts);
  const historyCopies = mobileDelivery.localizedHistoryCopies(
    (locale) => messageFor(eventType, locale, eventPayload, url),
  );
  return {
    userId,
    key: `outbox|${eventId}`,
    kind: category,
    transactional: true,
    title: String(msg.title || "Hourkey").slice(0, 120),
    body: String(msg.body || "").slice(0, 400),
    historyCopies,
    payload: typed,
    sourceFacts: { eventType: String(eventType), referenceId: String(eventId), destination: url },
    messages: tokens.map((token) => {
      const copy = messageFor(eventType, token.locale, eventPayload, url);
      return {
      tokenId: token.id,
      expoToken: token.expo_push_token,
      deviceToken: token.device_push_token,
      deviceTokenType: token.device_token_type,
      platform: token.platform,
      category,
      locale: notificationPayload.normalizedLocale(token.locale),
      title: String(copy.title || "Hourkey").slice(0, 120),
      body: String(copy.body || "").slice(0, 400),
      url,
      data: typed,
      };
    }),
  };
}

async function sendNativePush(userId, msg, targetUrl, tag, referenceId, dependencies = {}) {
  const database = dependencies.db || db;
  const durable = dependencies.delivery || mobileDelivery;
  const tokens = await database.query(
    `SELECT id,expo_push_token,device_push_token,device_token_type,platform,fail_count
            ,locale
       FROM mobile_push_tokens
      WHERE user_id=$1 AND enabled=true ORDER BY created_at LIMIT 100`,
    [userId]
  );
  if (!tokens.rows.length) return { sent: 0, temporaryFailures: 0, permanentFailures: 0, attempted: 0 };
  const notice = buildAdminMobileNotice({
    userId, eventId: referenceId, eventType: tag, msg, tokens: tokens.rows,
    eventPayload: dependencies.eventPayload || {},
  });
  const result = await durable.deliver(database, notice);
  if (result.status === "duplicate") {
    const existing = await database.query(
      `SELECT delivery_status FROM mobile_push_log WHERE user_id=$1 AND yam_key=$2`,
      [userId, notice.key],
    );
    const status = existing.rows[0]?.delivery_status;
    return {
      sent: status === "accepted" || status === "delivered" ? 1 : 0,
      temporaryFailures: status === "pending" ? 1 : 0,
      permanentFailures: status === "failed" ? 1 : 0,
      attempted: tokens.rows.length,
    };
  }
  return {
    sent: result.sent,
    temporaryFailures: Number(result.result?.retryDue || 0),
    permanentFailures: Number(result.result?.dead || (result.status === "failed" ? result.failed : 0)),
    attempted: tokens.rows.length,
  };
}

async function checkNativePushReceipts() {
  const pending = await db.query(
    `SELECT ticket_id,token_id FROM mobile_push_receipts
      WHERE status='pending' AND available_at<=now()
      ORDER BY available_at LIMIT 1000`
  );
  if (!pending.rows.length) return;
  const accessToken = String(process.env.EXPO_PUSH_ACCESS_TOKEN || "").trim();
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ids: pending.rows.map((row) => row.ticket_id) }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`expo_receipt_http_${response.status}`);
  const payload = await response.json();
  for (const row of pending.rows) {
    const receipt = payload.data?.[row.ticket_id];
    if (!receipt) continue;
    const code = receipt.details?.error || null;
    const status = receipt.status === "ok" ? "ok" : "error";
    await db.query(
      `UPDATE mobile_push_receipts SET status=$2,error_code=$3,error_message=$4,checked_at=now()
        WHERE ticket_id=$1`,
      [row.ticket_id, status, code, receipt.message || null]
    );
    if (code === "DeviceNotRegistered") {
      await db.query(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now() WHERE id=$1`, [row.token_id]);
    } else if (status === "ok") {
      await db.query(`UPDATE mobile_push_tokens SET fail_count=0,last_success_at=now(),updated_at=now() WHERE id=$1`, [row.token_id]);
    }
  }
}

async function enqueueObservedEvents() {
  await db.query(
    `INSERT INTO notification_events(event_type,severity,audience_kind,audience_roles,required_permission,dedupe_key,target_url,payload)
     SELECT 'user_signup','info','admin',ARRAY['ops','superadmin'],'admin.users.read',
            'user-signup:'||u.id::text,'/admin/members',jsonb_build_object('user_id',u.id::text)
      FROM users u
      WHERE u.created_at>now()-interval '6 hours' AND u.deleted_at IS NULL AND u.email NOT LIKE '%@example.%'
        AND NOT EXISTS (SELECT 1 FROM admin_notify_log old WHERE old.event_type='user_signup' AND old.ref_id=u.id::text)
     ON CONFLICT(dedupe_key) DO NOTHING`
  );
  await db.query(
    `INSERT INTO notification_events(event_type,severity,audience_kind,audience_roles,required_permission,dedupe_key,target_url,payload)
     SELECT 'order_paid','info','admin',ARRAY['finance','ops','superadmin'],'admin.orders.read',
            'order-paid:'||o.id::text,'/admin/orders?id='||o.id::text,
            jsonb_build_object('order_id',o.id::text,'amount_thb',o.amount_thb,'package_code',o.package_code)
       FROM orders o WHERE o.status='paid' AND COALESCE(o.paid_at,o.created_at)>now()-interval '6 hours'
        AND NOT EXISTS (SELECT 1 FROM admin_notify_log old WHERE old.event_type='order_paid' AND old.ref_id=o.id::text)
     ON CONFLICT(dedupe_key) DO NOTHING`
  );
  const failed = await db.query(`SELECT count(*)::int n FROM hourkey_jobs WHERE status='failed' AND updated_at>now()-interval '10 minutes'`);
  const n = Number(failed.rows[0]?.n || 0);
  if (n >= SPIKE_THRESHOLD) {
    const bucket = Math.floor(Date.now() / 600_000);
    const legacy = await db.query(`SELECT 1 FROM admin_notify_log WHERE event_type='job_fail_spike' AND ref_id=$1`, [`spike-${bucket}`]);
    if (legacy.rows[0]) return;
    await db.query(
      `INSERT INTO notification_events(event_type,severity,audience_kind,audience_roles,required_permission,dedupe_key,target_url,payload)
       VALUES ('job_fail_spike','critical','admin',ARRAY['ops','superadmin'],'admin.dashboard.read',$1,'/admin',$2::jsonb)
       ON CONFLICT(dedupe_key) DO NOTHING`,
      [`job-fail-spike:${bucket}`, JSON.stringify({ failed: n })]
    );
  }
}

async function adminRecipients(event) {
  const envEmails = (process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const defaultOn = DEFAULT_ON.has(event.event_type);
  const result = await db.query(
    `SELECT DISTINCT u.id::text AS user_id,u.locale
       FROM users u
       LEFT JOIN admin_user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL
         AND (ur.expires_at IS NULL OR ur.expires_at>now())
       LEFT JOIN admin_roles ar ON ar.id=ur.role_id
       LEFT JOIN admin_notify_prefs pref ON pref.user_id=u.id AND pref.event_type=$1
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (lower(u.email)=ANY($2::text[]) OR ar.id IS NOT NULL)
        AND COALESCE(pref.enabled,$3::boolean)
        AND (cardinality($4::text[])=0 OR lower(u.email)=ANY($2::text[]) OR ar.is_super OR ar.key=ANY($4::text[]))
        AND ($5::text IS NULL OR lower(u.email)=ANY($2::text[]) OR ar.is_super OR EXISTS (
          SELECT 1 FROM admin_role_permissions rp WHERE rp.role_id=ar.id
            AND (rp.perm_key=$5 OR rp.perm_key='admin.*' OR rp.perm_key=(split_part($5,'.',1)||'.*'))
        ))`,
    [event.event_type, envEmails, defaultOn, event.audience_roles || [], event.required_permission]
  );
  return result.rows;
}

async function expandEvents() {
  const events = await db.query(
    `SELECT * FROM notification_events
      WHERE status='pending' AND available_at<=now() AND expires_at>now()
      ORDER BY created_at LIMIT $1`, [BATCH_SIZE]
  );
  for (const event of events.rows) {
    let recipients = [];
    if (event.audience_kind === "user" && event.recipient_user_id) {
      recipients = (await db.query(
        `SELECT id::text AS user_id,locale FROM users WHERE id=$1 AND is_active AND deleted_at IS NULL`,
        [event.recipient_user_id]
      )).rows;
    } else if (event.audience_kind === "admin") {
      recipients = await adminRecipients(event);
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const recipient of recipients) {
        await client.query(
          `INSERT INTO notification_deliveries(event_id,recipient_user_id)
           VALUES ($1,$2) ON CONFLICT(event_id,recipient_user_id) DO NOTHING`,
          [event.id, recipient.user_id]
        );
      }
      await client.query(`UPDATE notification_events SET status='expanded' WHERE id=$1 AND status='pending'`, [event.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }
}

async function recoverStale() {
  await db.query(
    `UPDATE notification_deliveries SET status='retry',next_attempt_at=now(),locked_at=NULL,locked_by=NULL,
            last_error=COALESCE(last_error,'worker_interrupted'),updated_at=now()
      WHERE status='processing' AND locked_at<now()-interval '5 minutes'`
  );
}

async function claimDelivery() {
  const result = await db.query(
    `WITH picked AS (
       SELECT id FROM notification_deliveries
        WHERE status IN ('pending','retry') AND next_attempt_at<=now()
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE notification_deliveries d SET status='processing',attempts=attempts+1,locked_at=now(),locked_by=$1,updated_at=now()
       FROM picked WHERE d.id=picked.id
     RETURNING d.*`, [WORKER_ID]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  const event = (await db.query(`SELECT * FROM notification_events WHERE id=$1`, [row.event_id])).rows[0];
  const user = (await db.query(`SELECT locale FROM users WHERE id=$1`, [row.recipient_user_id])).rows[0];
  return { ...row, event, locale: user?.locale || "th" };
}

async function sendDelivery(delivery, dependencies = {}) {
  const database = dependencies.db || db;
  const browserPush = dependencies.webPush || webPush;
  const nativeSender = dependencies.sendNativePush || sendNativePush;
  const event = delivery.event;
  const payload = event.payload || {};
  const msg = messageFor(event.event_type, delivery.locale, payload, event.target_url);
  await database.query(
    `INSERT INTO notification_inbox(event_id,recipient_user_id,event_type,severity,title,body,target_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id,recipient_user_id) DO NOTHING`,
    [event.id, delivery.recipient_user_id, event.event_type, event.severity, msg.title, msg.body, event.target_url]
  );

  if (DRY_RUN) {
    return;
  }
  const native = await nativeSender(
    delivery.recipient_user_id,
    msg,
    event.target_url,
    event.event_type,
    event.id,
    { db: database, delivery: dependencies.delivery || mobileDelivery, eventPayload: payload },
  );
  const subs = await database.query(`SELECT id,endpoint,p256dh,auth,fail_count FROM push_subscriptions WHERE user_id=$1`, [delivery.recipient_user_id]);
  if ((!subs.rows.length || !vapidReady) && !native.sent && !native.temporaryFailures && !native.permanentFailures) {
    await database.query(
      `UPDATE notification_deliveries SET status='sent',push_status=$2,sent_at=now(),updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [delivery.id, subs.rows.length ? "no_vapid" : "no_subscription"]
    );
    return;
  }
  let sent = native.sent, temporaryFailures = native.temporaryFailures;
  for (const sub of vapidReady ? subs.rows : []) {
    try {
      await browserPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: msg.title, body: msg.body, url: event.target_url, tag: `event_${event.id}` }),
        { TTL: 60 * 60 * 6 }
      );
      sent++;
      await database.query(`UPDATE push_subscriptions SET last_success=now(),fail_count=0 WHERE id=$1`, [sub.id]).catch(() => {});
    } catch (error) {
      const code = error?.statusCode || 0;
      if (code === 404 || code === 410 || Number(sub.fail_count || 0) + 1 > MAX_SUB_FAIL) {
        await database.query(`DELETE FROM push_subscriptions WHERE id=$1`, [sub.id]).catch(() => {});
      } else {
        temporaryFailures++;
        await database.query(`UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=$1`, [sub.id]).catch(() => {});
      }
    }
  }
  if (sent) {
    await database.query(
      `UPDATE notification_deliveries SET status='sent',push_status=$2,sent_at=now(),updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [delivery.id, `sent:${sent}`]
    );
  } else if (native.permanentFailures || Number(delivery.attempts) >= Number(delivery.max_attempts)) {
    await database.query(
      `UPDATE notification_deliveries SET status='dead',push_status='failed',last_error='push_failed',updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [delivery.id]
    );
  } else if (!temporaryFailures) {
    await database.query(
      `UPDATE notification_deliveries SET status='sent',push_status='subscriptions_removed',sent_at=now(),updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [delivery.id]
    );
  } else {
    const delaySeconds = Math.min(3600, 30 * Math.pow(2, Math.max(0, Number(delivery.attempts) - 1)));
    await database.query(
      `UPDATE notification_deliveries SET status='retry',push_status='retry',last_error='push_failed',
              next_attempt_at=now()+($2||' seconds')::interval,updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [delivery.id, String(delaySeconds)]
    );
  }
}

async function finishEvents() {
  await db.query(
    `UPDATE notification_events e SET status='sent',completed_at=now()
      WHERE e.status='expanded' AND NOT EXISTS (
        SELECT 1 FROM notification_deliveries d WHERE d.event_id=e.id AND d.status NOT IN ('sent','dead')
      )`
  );
  await db.query(`UPDATE notification_events SET status='dead',completed_at=now() WHERE status='pending' AND expires_at<=now()`);
}

async function tick() {
  try {
    if (DRY_RUN) {
      const pending = await db.query(`SELECT count(*)::int n FROM notification_events WHERE status IN ('pending','expanded')`);
      const deliveries = await db.query(`SELECT count(*)::int n FROM notification_deliveries WHERE status IN ('pending','retry','processing')`);
      log({ event: "dry_run", pendingEvents: pending.rows[0]?.n || 0, readyDeliveries: deliveries.rows[0]?.n || 0 });
      return;
    }
    if (!OUTBOX_ONLY) await enqueueObservedEvents();
    await recoverStale();
    await expandEvents();
    for (let i = 0; i < BATCH_SIZE; i++) {
      const delivery = await claimDelivery();
      if (!delivery) break;
      try { await sendDelivery(delivery); }
      catch (error) {
        await db.query(
          `UPDATE notification_deliveries SET status=CASE WHEN attempts>=max_attempts THEN 'dead' ELSE 'retry' END,
             next_attempt_at=now()+interval '30 seconds',last_error=$2,updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
          [delivery.id, String(error?.message || error).slice(0, 500)]
        ).catch(() => {});
      }
    }
    await finishEvents();
    await checkNativePushReceipts();
  } catch {
    console.error(JSON.stringify({ event: "tick_failed", error_code: "worker_tick_failed" }));
  }
}

async function runWorker() {
  log({ event: "ready", dryRun: DRY_RUN, once: ONCE, outboxOnly: OUTBOX_ONLY, pollMs: POLL_MS, batchSize: BATCH_SIZE, vapid: vapidReady });
  await tick();
  if (ONCE) { await db.end(); return; }
  const timer = setInterval(() => { void tick(); }, POLL_MS);
  async function shutdown(signal) {
    clearInterval(timer);
    await db.end().catch(() => {});
    log({ event: "shutdown", signal });
  }
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
}

export {
  buildAdminMobileNotice,categoryForEvent,localeKey,messageFor,mobileDestination,
  runWorker,sendDelivery,sendNativePush,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWorker().catch(async () => {
    console.error(JSON.stringify({ event: "worker_failed", error_code: "worker_start_failed" }));
    await db.end().catch(() => {});
    process.exitCode = 1;
  });
}
