# Referrals — Runbook (Ops)

## Flags
- `USE_REFERRAL_HELPERS` (default: true): Use centralized helpers for referral reads.
- `ALLOW_ENSURE_ON_READ` (default: false): When true, `ensureUserHasReferralCode` can mint on read.
- `REFERRALS_DISABLE_AWARDS` (default: false): Kill switch. When true, parent edge can be set, but no `points_ledger` writes or totals refresh occur.

## Rollback
- Flip `USE_REFERRAL_HELPERS=false` to fall back to legacy reads.
- Flip `REFERRALS_DISABLE_AWARDS=true` to halt awards while keeping attribution.
- Redeploy; no schema rollback required.

## Data sanity checks (post-deploy)
- New user created via `/?ref=<code>`:
  - `auth.users.raw_user_meta_data.referred_by` set once; never overwritten.
  - `public.points_ledger` has exactly one row per ancestor depth: d=1:10, d=2:5, d>=3:2.
  - Totals reflect the sum of ledger for beneficiaries.
- Cookie cleared (`river_ref_h`) after successful attribution.
- No unexpected spikes in `duplicate_suppressed` or `invalid_code` metrics.
