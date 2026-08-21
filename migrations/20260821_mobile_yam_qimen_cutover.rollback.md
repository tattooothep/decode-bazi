# Yam/Qimen cutover rollback note

There is no data-restoring rollback for this cutover. Re-enabling code does not
restore removed `source_facts.qimen`, multiline legacy history text, dead
attempts, leases, retry schedules, or pending provider receipts. A rollback
must never resurrect privacy or safety-sensitive delivery data; only a newly
created dedicated C4 Qimen occurrence may produce a future Qimen notification.
