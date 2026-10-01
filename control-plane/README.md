# AIMPACT Central Control Plane

This directory is the executable policy boundary for AIMPACT.

## Authority

Kim Hyung Nam is the sole human business authority and final decision-maker.

AI and automation operate only within the policy classes defined in `policy.json`.

## Operating rule

No important operation should move directly from intent to production.

The required control sequence is:

INTENT → POLICY CHECK → PRECONDITION CHECK → EXECUTE → OBSERVE → VALIDATE → LOG → UPDATE STATE → ALERT → CONTAIN/ROLLBACK → APPROVAL IF REQUIRED

## Commercial truth

The system must never manufacture:
- customers
- revenue
- outcomes
- case studies
- verified tools

Each requires evidence in the corresponding system of record.

## Certification

The company remains NOT_CERTIFIED until the certification gates in `policy.json` are actually evidenced.

## Strategic engine

The control plane governs the AIMPACT commercial engine:

BUSINESS PROBLEM
→ INTELLIGENCE
→ DECISION
→ WORKFLOW
→ EXECUTION
→ OUTCOME
→ LEARNING

The goal is not to operate an AI directory. The goal is to become an AI Decision & Execution Layer for Business.
