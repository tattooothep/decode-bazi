# Hourkey Nginx P0 invariants

The active server configuration must preserve these routing rules:

- `/api/internal/` returns 404 publicly. Workers call loopback Next.js ports.
- `/api/sifu/fusion/history` uses the normal four-instance web upstream.
- General `/api/` and `/api/auth/` reads are not limited by source IP.
- Sensitive auth routes use the Redis-backed application limiter keyed by
  identity plus IP. This prevents carrier-NAT users from sharing one quota.
- Long AI requests keep buffering disabled and retain their route timeouts.

Always run `nginx -t` before reload. The pre-P0 copy is stored with the P0
release and database snapshot under `/root/backups/hourkey-p0-*`.
