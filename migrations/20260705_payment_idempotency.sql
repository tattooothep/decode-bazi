-- Payment idempotency guard (r408 · 5 ก.ค. 2026)
-- ref_payment_id ต้องไม่ซ้ำ = webhook ยิงซ้ำเติมยามครั้งเดียว (belt-and-suspenders ควบคู่ orders.status transition)
-- partial index: อนุญาต NULL ซ้ำได้ (แถวเก่า spend/refund ไม่มี ref_payment_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_hour_tx_ref_payment
  ON hour_transactions (ref_payment_id)
  WHERE ref_payment_id IS NOT NULL;

-- index ช่วย lookup order จาก gateway charge id (webhook/status poll)
CREATE INDEX IF NOT EXISTS ix_orders_pay_ref ON orders (pay_ref) WHERE pay_ref IS NOT NULL;
