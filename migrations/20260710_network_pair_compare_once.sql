CREATE UNIQUE INDEX IF NOT EXISTS hour_transactions_network_pair_compare_trial_once
  ON hour_transactions (user_id, reason)
  WHERE reason = 'use_network_pair_compare_trial';

CREATE UNIQUE INDEX IF NOT EXISTS hour_transactions_sifu_compare_cached_trial_once
  ON hour_transactions (user_id, reason)
  WHERE reason = 'use_sifu_compare_cached_trial';
