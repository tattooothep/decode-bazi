BEGIN;

DO $test$
DECLARE
  owner_a uuid := '00000000-0000-4000-8000-00000000a194';
  owner_b uuid := '00000000-0000-4000-8000-00000000b194';
  draw_a text := 'ritual_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  draw_b text := 'ritual_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  a_count int;
  b_count int;
  cross_owner_rejected boolean := false;
BEGIN
  INSERT INTO shrine_hourkey_ritual_results
    (user_id, ritual_id, locale, request_hash, result_code, result_json,
     idempotency_key)
  VALUES
    (owner_a, 'fortune-sticks', 'th', repeat('a', 64), 'fortune-stick-7',
     '{"values":{"fortuneStickNumber":7}}'::jsonb, draw_a),
    (owner_a, 'fortune-sticks', 'th', repeat('b', 64), 'fortune-stick-7',
     '{"values":{"fortuneStickNumber":7}}'::jsonb, draw_b);

  INSERT INTO shrine_jiaobei_casts
    (user_id, question_hash, deity_id, topic_key, purpose, qian_slip_no,
     qian_draw_id, attempt_no, sequence_no, set_no, server_seed,
     client_nonce, face_left, face_right, outcome, tz_offset_minutes,
     hour_key, hour_branch, engine_version, idempotency_key)
  SELECT owner_a, repeat('1', 64), 'guanyin', 'general', 'qian_confirm', 7,
         draw_a, 1, sequence_no, 1, repeat('2', 64),
         'draw-identity-test', 'flat', 'round', 'sheng', 420,
         '20260809-子', '子', 'jiaobei-v1',
         'jiaobei_' || lpad(sequence_no::text, 32, '0')
    FROM generate_series(1, 3) AS sequence_no;

  SELECT count(*)::int INTO a_count
    FROM shrine_jiaobei_casts
   WHERE user_id = owner_a
     AND purpose = 'qian_confirm'
     AND qian_draw_id = draw_a;
  SELECT count(*)::int INTO b_count
    FROM shrine_jiaobei_casts
   WHERE user_id = owner_a
     AND purpose = 'qian_confirm'
     AND qian_draw_id = draw_b;
  IF a_count <> 3 OR b_count <> 0 THEN
    RAISE EXCEPTION 'draw scopes contaminated: A=%, B=%', a_count, b_count;
  END IF;

  BEGIN
    INSERT INTO shrine_jiaobei_casts
      (user_id, question_hash, deity_id, topic_key, purpose, qian_slip_no,
       qian_draw_id, attempt_no, sequence_no, set_no, server_seed,
       client_nonce, face_left, face_right, outcome, tz_offset_minutes,
       hour_key, hour_branch, engine_version, idempotency_key)
    VALUES
      (owner_b, repeat('3', 64), 'guanyin', 'general', 'qian_confirm', 7,
       draw_a, 1, 1, 1, repeat('4', 64), 'cross-owner-test',
       'flat', 'round', 'sheng', 420, '20260809-子', '子', 'jiaobei-v1',
       'jiaobei_ffffffffffffffffffffffffffffffff');
  EXCEPTION WHEN foreign_key_violation THEN
    cross_owner_rejected := true;
  END;
  IF NOT cross_owner_rejected THEN
    RAISE EXCEPTION 'cross-owner draw citation was accepted';
  END IF;

  RAISE NOTICE 'SHRINE_JIAOBEI_DRAW_IDENTITY_DB_OK A=% B=% cross_owner=blocked',
    a_count, b_count;
END
$test$;

ROLLBACK;
