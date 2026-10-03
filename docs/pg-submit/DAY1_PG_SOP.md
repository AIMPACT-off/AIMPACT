# AIMPACT Day-1 PG Opening SOP

## Gate 0 — business registration received
Record the registered business name, representative, business number, address, business start date and applicable online-sales registration status. Replace only verified placeholders.

## Gate 1 — website identity
Update the PG submission template footer and legal pages. Confirm KRW prices: START ₩200,000/month; GROWTH ₩390,000/month. Confirm tax display treatment before publication.

## Gate 2 — domestic PG application
Submit the verified website/business information to the selected domestic PG provider (for example Toss Payments or NHN KCP). Record application timestamp, review status and requested documents. Do not claim approval until the provider confirms it.

## Gate 3 — real Supabase RLS
Inject only the required CI secrets/variables: SUPABASE_URL, SUPABASE_ANON_KEY, TENANT_A_JWT, TENANT_B_JWT, RLS_TEST_CASES, and repository variable RLS_TESTS_ENABLED=true. Execute the GitHub tenant-isolation workflow and retain explicit READ/UPDATE/DELETE PASS logs. Do not use service_role JWTs.

## Gate 4 — KRW checkout
After PG approval, configure live checkout, test success/failure/cancellation/refund handling, map payment/subscription IDs to the customer/tenant record, and only then expose the live payment route.

## 1-hour operating order
1. Business identity replacement
2. PG application submission
3. Real Supabase RLS execution
4. KRW checkout activation after PG approval

## Hard stop conditions
Missing business identity, unverified legal pages, unverified PG approval, failed RLS test, or untested refund/cancellation flow blocks live launch.
