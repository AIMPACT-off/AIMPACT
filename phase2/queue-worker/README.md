# Queue Worker / DLQ Engine V1 — Build Artifact

This is an executable contract and SQL worker skeleton for the PR #22 integration boundary.

Rules:
- Queue claims use PostgreSQL row locking with FOR UPDATE SKIP LOCKED.
- Every job is tenant-scoped.
- Attempts are bounded.
- Terminal failures move to DLQ.
- Stale leases are recoverable.
- This artifact does not claim TEST execution or production readiness.
