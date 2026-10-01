# AIMPACT INCIDENT RESPONSE

Operational loop:

ERROR → DETECTION → INCIDENT → SEVERITY → ROOT CAUSE → ACTION → TEST → DEPLOY → VERIFY → RESOLVE

Current production incident:
INC-20261001-PROD-001

Status: INVESTIGATING
Root cause status: HYPOTHESIS
Evidence: production endpoint returned Failed to fetch / Cache miss.

Important:
A hypothesis is never treated as a verified root cause.

Current incident action:
Investigate Netlify deployment/build/runtime evidence.

Self-healing boundary:
Allowed: retry, timeout recovery, cache refresh, idempotent sync retry, temporary network retry.
Human approval required: schema change, data deletion, production architecture change, billing, security policy, major deployment, customer-impacting changes.
