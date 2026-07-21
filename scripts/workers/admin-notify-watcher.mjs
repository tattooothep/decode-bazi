#!/usr/bin/env node
import nextEnv from "@next/env";
import pg from "pg";
import webPush from "web-push";
import { randomUUID } from "node:crypto";

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
} catch (error) {
  console.error(JSON.stringify({ event: "vapid_error", error: error.message }));
}

const COPY = {
  th: {
    user_signup: ["สมาชิกใหม่", "มีสมาชิกสมัครใหม่"], order_paid: ["มีการชำระเงิน", "มีออเดอร์ชำระเงินสำเร็จ"],
    job_fail_spike: ["งานล้มเหลวผิดปกติ", "มีงานเบื้องหลังล้มเหลวหลายรายการ"],
    support_report_new: ["มีรายงานปัญหาใหม่", "ผู้ใช้ส่งปัญหาใหม่ แตะเพื่อเปิด ticket"],
    support_user_reply: ["ผู้ใช้ตอบกลับแล้ว", "มีข้อความใหม่ใน ticket"],
    support_admin_reply: ["ทีมงานตอบกลับแล้ว", "แตะเพื่ออ่านคำตอบในศูนย์ช่วยเหลือ"],
    support_status_changed: ["สถานะปัญหาอัปเดต", "ทีมงานอัปเดตสถานะ ticket ของคุณ"],
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
    payment_exception: ["Payment exception", "A paid order could not be fulfilled"], refund_failed: ["Refund failed", "Review the order and credit clawback"],
    service_unhealthy: ["Service unhealthy", "Health checks failed repeatedly"], service_recovered: ["Service recovered", "Affected services are healthy again"],
    admin_role_changed: ["Admin access changed", "An admin role was granted or revoked"],
  },
  zh: {
    user_signup: ["新會員", "有新會員註冊"], order_paid: ["收到付款", "訂單付款成功"], job_fail_spike: ["任務異常", "多個背景任務失敗"],
    support_report_new: ["新的問題回報", "用戶送出新的問題"], support_user_reply: ["用戶已回覆", "支援 ticket 有新訊息"],
    support_admin_reply: ["團隊已回覆", "開啟支援中心查看回覆"], support_status_changed: ["問題狀態已更新", "你的 ticket 狀態已變更"],
    payment_exception: ["付款異常", "已付款訂單未能完成"], refund_failed: ["退款失敗", "請檢查訂單與點數回收"],
    service_unhealthy: ["系統異常", "健康檢查連續失敗"], service_recovered: ["系統已恢復", "受影響服務已恢復正常"],
    admin_role_changed: ["管理員權限變更", "管理員角色已新增或撤銷"],
  },
  cn: {
    user_signup: ["新会员", "有新会员注册"], order_paid: ["收到付款", "订单付款成功"], job_fail_spike: ["任务异常", "多个后台任务失败"],
    support_report_new: ["新的问题报告", "用户提交了新的问题"], support_user_reply: ["用户已回复", "支持工单有新消息"],
    support_admin_reply: ["客服团队已回复", "打开帮助中心查看回复"], support_status_changed: ["问题状态已更新", "你的支持工单状态已变更"],
    payment_exception: ["付款异常", "已付款订单未能完成"], refund_failed: ["退款失败", "请检查订单与时数回收"],
    service_unhealthy: ["系统异常", "健康检查连续失败"], service_recovered: ["系统已恢复", "受影响的服务已恢复正常"],
    admin_role_changed: ["管理员权限变更", "管理员角色已授予或撤销"],
  },
  vi: {
    user_signup: ["Thành viên mới", "Có thành viên mới đăng ký"], order_paid: ["Đã nhận thanh toán", "Đơn hàng đã được thanh toán"], job_fail_spike: ["Nhiều tác vụ lỗi", "Nhiều tác vụ nền đã thất bại"],
    support_report_new: ["Báo cáo sự cố mới", "Người dùng vừa gửi một sự cố"], support_user_reply: ["Người dùng đã trả lời", "Phiếu hỗ trợ có tin nhắn mới"],
    support_admin_reply: ["Bộ phận hỗ trợ đã trả lời", "Mở Trung tâm trợ giúp để xem phản hồi"], support_status_changed: ["Trạng thái sự cố đã cập nhật", "Trạng thái phiếu hỗ trợ của bạn đã thay đổi"],
    payment_exception: ["Thanh toán bất thường", "Đơn đã thanh toán nhưng chưa thể hoàn tất"], refund_failed: ["Hoàn tiền thất bại", "Hãy kiểm tra đơn hàng và việc thu hồi giờ"],
    service_unhealthy: ["Dịch vụ gặp sự cố", "Kiểm tra tình trạng thất bại liên tiếp"], service_recovered: ["Dịch vụ đã phục hồi", "Các dịch vụ bị ảnh hưởng đã hoạt động bình thường"],
    admin_role_changed: ["Quyền quản trị đã thay đổi", "Một vai trò quản trị đã được cấp hoặc thu hồi"],
  },
  ja: {
    user_signup: ["新規会員", "新しい会員が登録しました"], order_paid: ["支払いを受領", "注文の支払いが完了しました"], job_fail_spike: ["ジョブ障害の増加", "複数のバックグラウンドジョブが失敗しました"],
    support_report_new: ["新しい問題報告", "ユーザーから問題が報告されました"], support_user_reply: ["ユーザーから返信", "サポートチケットに新しい返信があります"],
    support_admin_reply: ["サポートから返信", "ヘルプセンターで回答を確認してください"], support_status_changed: ["問題の状態を更新", "サポートチケットの状態が変わりました"],
    payment_exception: ["支払い処理の異常", "支払い済み注文を完了できませんでした"], refund_failed: ["返金に失敗", "注文と時間の回収を確認してください"],
    service_unhealthy: ["サービスに異常", "ヘルスチェックが連続して失敗しました"], service_recovered: ["サービスが復旧", "影響を受けたサービスは正常に戻りました"],
    admin_role_changed: ["管理者権限を変更", "管理者ロールが付与または取り消されました"],
  },
  ru: {
    user_signup: ["Новый участник", "Зарегистрирован новый участник"], order_paid: ["Платеж получен", "Заказ успешно оплачен"], job_fail_spike: ["Сбой фоновых задач", "Несколько фоновых задач завершились с ошибкой"],
    support_report_new: ["Новое обращение", "Пользователь сообщил о проблеме"], support_user_reply: ["Ответ пользователя", "В обращении появилось новое сообщение"],
    support_admin_reply: ["Ответ поддержки", "Откройте центр помощи, чтобы прочитать ответ"], support_status_changed: ["Статус обращения обновлен", "Статус вашего обращения изменился"],
    payment_exception: ["Ошибка платежа", "Оплаченный заказ не удалось выполнить"], refund_failed: ["Возврат не выполнен", "Проверьте заказ и списание часов"],
    service_unhealthy: ["Сервис недоступен", "Проверка состояния несколько раз завершилась ошибкой"], service_recovered: ["Сервис восстановлен", "Затронутые сервисы снова работают нормально"],
    admin_role_changed: ["Права администратора изменены", "Роль администратора назначена или отозвана"],
  },
  ko: {
    user_signup: ["신규 회원", "새 회원이 가입했습니다"], order_paid: ["결제 완료", "주문 결제가 완료되었습니다"], job_fail_spike: ["작업 실패 증가", "여러 백그라운드 작업이 실패했습니다"],
    support_report_new: ["새 문제 신고", "사용자가 문제를 신고했습니다"], support_user_reply: ["사용자 답변", "지원 티켓에 새 답변이 있습니다"],
    support_admin_reply: ["지원팀 답변", "도움말 센터에서 답변을 확인하세요"], support_status_changed: ["문제 상태 업데이트", "지원 티켓 상태가 변경되었습니다"],
    payment_exception: ["결제 처리 이상", "결제된 주문을 완료하지 못했습니다"], refund_failed: ["환불 실패", "주문과 시간 회수를 확인하세요"],
    service_unhealthy: ["서비스 이상", "상태 확인이 연속으로 실패했습니다"], service_recovered: ["서비스 복구", "영향받은 서비스가 정상으로 돌아왔습니다"],
    admin_role_changed: ["관리자 권한 변경", "관리자 역할이 부여되거나 취소되었습니다"],
  },
  es: {
    user_signup: ["Nuevo miembro", "Se registró un nuevo miembro"], order_paid: ["Pago recibido", "El pedido se pagó correctamente"], job_fail_spike: ["Aumento de tareas fallidas", "Fallaron varias tareas en segundo plano"],
    support_report_new: ["Nuevo reporte de problema", "Un usuario reportó un problema"], support_user_reply: ["Respuesta del usuario", "Hay una nueva respuesta en el ticket"],
    support_admin_reply: ["Respuesta de soporte", "Abre el Centro de ayuda para leer la respuesta"], support_status_changed: ["Estado del problema actualizado", "Cambió el estado de tu ticket de soporte"],
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
function messageFor(eventType, locale, payload) {
  const lang = localeKey(locale);
  const pair = COPY[lang]?.[eventType] || COPY.en[eventType] || ["hourkey", "There is a new update"];
  let body = pair[1];
  if (eventType === "job_fail_spike" && payload?.failed) body += ` (${payload.failed})`;
  if (eventType === "support_status_changed" && payload?.status) body += ` · ${payload.status}`;
  if ((eventType === "payment_exception" || eventType === "refund_failed") && payload?.order_id) body += ` · #${String(payload.order_id).slice(0, 8)}`;
  return { title: pair[0], body };
}

async function sendNativePush(userId, msg, targetUrl, tag) {
  const tokens = await db.query(
    `SELECT id,expo_push_token,fail_count FROM mobile_push_tokens
      WHERE user_id=$1 AND enabled=true ORDER BY created_at LIMIT 100`,
    [userId]
  );
  if (!tokens.rows.length) return { sent: 0, temporaryFailures: 0 };
  const accessToken = String(process.env.EXPO_PUSH_ACCESS_TOKEN || "").trim();
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(tokens.rows.map((token) => ({
        to: token.expo_push_token,
        title: String(msg.title || "Hourkey").slice(0, 120),
        body: String(msg.body || "").slice(0, 400),
        data: { url: String(targetUrl || "/today").slice(0, 300) },
        sound: "default",
        priority: "high",
        ttl: 60 * 60 * 6,
        tag: String(tag || "hourkey").slice(0, 80),
      }))),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`expo_push_http_${response.status}`);
    const payload = await response.json();
    const tickets = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    let sent = 0, temporaryFailures = 0;
    for (let index = 0; index < tokens.rows.length; index++) {
      const token = tokens.rows[index];
      const ticket = tickets[index];
      if (ticket?.status === "ok" && ticket.id) {
        sent++;
        await db.query(
          `INSERT INTO mobile_push_receipts(ticket_id,token_id) VALUES($1,$2)
           ON CONFLICT(ticket_id) DO NOTHING`,
          [ticket.id, token.id]
        ).catch(() => {});
      } else if (ticket?.details?.error === "DeviceNotRegistered") {
        await db.query(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now() WHERE id=$1`, [token.id]).catch(() => {});
      } else {
        temporaryFailures++;
        await db.query(`UPDATE mobile_push_tokens SET fail_count=fail_count+1,updated_at=now() WHERE id=$1`, [token.id]).catch(() => {});
      }
    }
    return { sent, temporaryFailures };
  } catch {
    return { sent: 0, temporaryFailures: tokens.rows.length };
  }
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

async function sendDelivery(delivery) {
  const event = delivery.event;
  const payload = event.payload || {};
  const msg = messageFor(event.event_type, delivery.locale, payload);
  await db.query(
    `INSERT INTO notification_inbox(event_id,recipient_user_id,event_type,severity,title,body,target_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id,recipient_user_id) DO NOTHING`,
    [event.id, delivery.recipient_user_id, event.event_type, event.severity, msg.title, msg.body, event.target_url]
  );

  if (DRY_RUN) {
    await db.query(`UPDATE notification_deliveries SET status='sent',push_status='dry_run',sent_at=now(),updated_at=now() WHERE id=$1`, [delivery.id]);
    return;
  }
  const native = await sendNativePush(
    delivery.recipient_user_id,
    msg,
    event.target_url,
    `event_${event.id}`
  );
  const subs = await db.query(`SELECT id,endpoint,p256dh,auth,fail_count FROM push_subscriptions WHERE user_id=$1`, [delivery.recipient_user_id]);
  if ((!subs.rows.length || !vapidReady) && !native.sent && !native.temporaryFailures) {
    await db.query(
      `UPDATE notification_deliveries SET status='sent',push_status=$2,sent_at=now(),updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [delivery.id, subs.rows.length ? "no_vapid" : "no_subscription"]
    );
    return;
  }
  let sent = native.sent, temporaryFailures = native.temporaryFailures;
  for (const sub of vapidReady ? subs.rows : []) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: msg.title, body: msg.body, url: event.target_url, tag: `event_${event.id}` }),
        { TTL: 60 * 60 * 6 }
      );
      sent++;
      await db.query(`UPDATE push_subscriptions SET last_success=now(),fail_count=0 WHERE id=$1`, [sub.id]).catch(() => {});
    } catch (error) {
      const code = error?.statusCode || 0;
      if (code === 404 || code === 410 || Number(sub.fail_count || 0) + 1 > MAX_SUB_FAIL) {
        await db.query(`DELETE FROM push_subscriptions WHERE id=$1`, [sub.id]).catch(() => {});
      } else {
        temporaryFailures++;
        await db.query(`UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=$1`, [sub.id]).catch(() => {});
      }
    }
  }
  if (sent || !temporaryFailures) {
    await db.query(
      `UPDATE notification_deliveries SET status='sent',push_status=$2,sent_at=now(),updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [delivery.id, sent ? `sent:${sent}` : "subscriptions_removed"]
    );
  } else if (Number(delivery.attempts) >= Number(delivery.max_attempts)) {
    await db.query(
      `UPDATE notification_deliveries SET status='dead',push_status='failed',last_error='push_failed',updated_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [delivery.id]
    );
  } else {
    const delaySeconds = Math.min(3600, 30 * Math.pow(2, Math.max(0, Number(delivery.attempts) - 1)));
    await db.query(
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
  } catch (error) {
    console.error(JSON.stringify({ event: "tick_failed", error: String(error?.message || error) }));
  }
}

log({ event: "ready", dryRun: DRY_RUN, once: ONCE, outboxOnly: OUTBOX_ONLY, pollMs: POLL_MS, batchSize: BATCH_SIZE, vapid: vapidReady });
await tick();
if (ONCE) { await db.end(); process.exit(0); }
const timer = setInterval(() => { void tick(); }, POLL_MS);
async function shutdown(signal) { clearInterval(timer); await db.end().catch(() => {}); log({ event: "shutdown", signal }); process.exit(0); }
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });
