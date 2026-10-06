# Review-First Atomic Gate V1

Customer-visible diagnosis reports must satisfy ALL of:
1. authenticated caller
2. trusted tenant membership
3. report belongs to the same tenant
4. report status = APPROVED
5. review decision = APPROVED

The browser must never submit tenant_id or reviewer_id as an authority signal.

This artifact is implementation scaffolding only. Tenant membership and auth mapping are intentionally not invented.
