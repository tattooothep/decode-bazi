# Product entitlement (SoT)

**Code:** `src/lib/product-entitlement.ts`  
**UI reads:** `GET /api/account/me` → `plan`, `in_trial`, `trial_ends_at`, `hour_balance`, `caps`

## Signup defaults
| | |
|--|--|
| `hour_balance` | **1000** (`FREE_SIGNUP_YAM`) |
| `trial_ends_at` | **now + 30 days** (`TRIAL_DAYS`) |
| `tier` | `free` (ไม่ปน premium จ่ายเงิน) |

Channels: email JSON/form, phone, mobile, Google/LINE (is_new).

## Plan derivation
| plan | when |
|------|------|
| master | tier=master + sub active |
| premium | tier=premium + sub active |
| trial | trial_ends_at > now (and not paid) |
| free | else |

## Caps
| | free (post-trial) | trial | premium | master |
|--|-------------------|-------|---------|--------|
| house_limit | 0* | 3 | 50 | 999 |
| fusion_max_sciences | 2 | **3** | 4 | 6 |
| fusion_max_profiles | 1 | 1 | 1 | 8 |
| book_max_sciences | 0 | 2 | 3 | 6 |
| book_synthesis | no | no | no | yes |
| fusion_suite | no | yes | yes | yes |
| network_multi | no | no | no | yes |
| luopan_vision_max | **0** | **1** | 50 | 999 |
| datepick_max_people | **1** | **1** | 3 | 10 |
| datepick_modules | 3 ชั้นพื้นฐาน | **6 ชั้น (~30%)** | ครบ | ครบ |
| datepick_max_range_days | 30 | **45** | 90 | 365 |
| datepick_max_results | 10 | **20** | 50 | 100 |
| luopan_mode | core | **core** | pro | full |
| luopan_pins | basic | **basic** | full | full |
| qimen_detail_mode | beginner | **beginner** | pro | pro |
| qimen_search | no | **no** | yes | yes |
| qimen_sifu | no | **no** | yes | yes |

\* **Legacy free policy (no backfill trial):**
  - `trial_ends_at IS NULL` + not paid → `plan=free`, `legacy_free=true`, **house_limit=1**
  - post-trial free (`trial_ends_at` in the past) → `legacy_free=false`, **house_limit=0**
  - **Do not** mass-set `trial_ends_at` for legacy users (would re-open 30-day trial)
  - New signups always get `trial_ends_at = now+30d` via `applySignupProductDefaults`
  - Admin may `extend_trial` case-by-case only

### Trial ~30% tool slices (datepick / luopan / qimen)
- **datepick modules (trial):** `ze_ri`, `twelve_officers`, `dong_gong`, `tai_sui`, `ba_zi`, `twenty_eight`
- **datepick modules (free):** `ze_ri`, `twelve_officers`, `ba_zi`
- **luopan core:** วงหลัก + pin พื้นฐาน (ประตู/เตียง/เตา) · น้ำขั้นสูง = pro+
- **qimen trial:** ผังยาม + beginner · ปิด search + AI sifu
- UI: `public/js/hk-product-caps.js` + `data-hk-product-page` · server re-checks
- **9 languages** (th/en/zh/cn/vi/ja/ko/ru/es): banners, lock titles, plan labels in `hk-product-caps.js`; trial line in `hk-user-menu.js`; trial notes in `account.html`; tier/CMP copy in `pricing.html` + `pricing-i18n9.js`
- **Luopan markup:** `data-lp-tier=core|pro|full` on layers/cats · `data-lp-pin-tier=basic|full` on pins · UI locks via `hk-product-caps.js`

## Runtime cluster (hourkey only)
- **3349** owned by `hourkey-decode.service` (AI primary) — do **not** also enable `hourkey-decode@3349` (EADDRINUSE fight)
- **3350–3352** = `hourkey-decode@%i` web cluster

## Book yam
- `BOOK_SCIENCE_YAM` = **18**
- `BOOK_SYNTHESIS_YAM` = **10**
- Full 6 + synthesis ≈ **118** (not 350)

## Vision usage counting
- Count only `hour_transactions.reason = 'spend_luopan_vision_pre'` (one per attempt)

## Gates (API)
| Route | Cap |
|-------|-----|
| POST houses | house_limit |
| POST fusion5 | sciences/profiles |
| GET/POST fusion access | fusion_suite |
| POST book | book sciences/synthesis |
| POST luopan/vision | luopan_vision_max |
| POST auspicious (peopleIds) | datepick_max_people |
| POST auspicious (modules/range) | datepick_modules · max_range_days · max_results |
| POST qimen/search | qimen_search |
| POST qimen/sifu | qimen_sifu |

## UX surfaces
- `pricing.html` — 1000 yam, trial, purchase-pack yam (no false monthly refill)
- `book.html` — 18+10 yam + cap from me.caps
- `master-fusion.html` — sci/profile caps from me.caps
- `datepick.html` — people select capped by `caps.datepick_max_people` (server re-checks)
- `luopan.html` — Vision 403 shows limit/locked message (count = pre only)
- `compass.html` — house count/limit from GET houses
- `account.html` + `hk-user-menu.js` — trial days left / ended

## Admin / backoffice
| Surface | Behavior |
|---------|----------|
| `GET /api/admin/members?id=` | `trial_ends_at` + `product_access` (deriveProductAccess) + constants |
| `GET /api/admin/members` list | `product_plan`, `in_trial`, filter `plan=trial\|free\|premium\|master` |
| `POST extend_trial` | extend `trial_ends_at` · permission `admin.users.sub.extend` · audit `admin.users.trial.extend` |
| User 360 | plan/trial cards + caps panel + ต่อ trial |
| Members table | plan badge + trial end date |
| Finance dashboard | `users.in_trial`, `users.paying` (sub active), `post_trial_free` |

**Note:** `set_tier` alone does **not** grant paid caps — need active `sub_expires_at`. Paid plan wins over trial in `deriveProductAccess`.

## Affiliate isolation (no impact path)
See `docs/AFFILIATE_ISOLATION_CONTRACT.md`.

| Check | Status |
|-------|--------|
| `src/lib/affiliate.ts` | **untouched** by product entitlement |
| `affiliate_*` tables | members admin does **not** write |
| Commission | only on **paid** `fulfillOrder` · free 1000 yam / trial is **not** a commission event |
| Refund | still platform clawback + `reverseAffiliateRewardsForOrder` |
| Checkout packages SoT | `src/lib/payment/packages.ts` (THB prices unchanged) |
| User 360 affiliate tab | read-only + deep-link `/admin/affiliate` |

Product freemium **does not** change attribution, codes, bps, or reward ledger.
