-- =============================================================
-- DECODE — Chinese Metaphysics Decision Platform
-- Complete PostgreSQL Schema (Supabase-compatible)
-- =============================================================
-- Version: 1.0
-- Date: 2026-05-05
-- Built from: 35 extracted JSON sources + 7 Sesheta tables analyzed
-- Owner: Aeaw / WeWealth Trading Co., Ltd
-- =============================================================

-- ─── EXTENSIONS ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";  -- for AI embeddings

-- ─── ENUMS ───────────────────────────────────────────────────
CREATE TYPE day_master_strength AS ENUM (
    'extremely_weak',  -- Follower
    'very_weak',
    'weak',
    'slightly_weak',
    'balanced',
    'slightly_strong',
    'strong',
    'very_strong',
    'extremely_strong',  -- Vibrant
    'transformed'  -- 化氣 special
);

CREATE TYPE chart_category AS ENUM (
    'normal',
    'follower',
    'vibrant',
    'transformation',
    'special'
);

CREATE TYPE useful_god_priority AS ENUM (
    'regulating',   -- balance crisis (Frozen/Damp/Scorched/Dry)
    'arbitrating',  -- bridge conflict
    'medicating',   -- heal imbalance
    'special',      -- follower/vibrant
    'normal'
);

CREATE TYPE element_type AS ENUM ('Wood','Fire','Earth','Metal','Water');
CREATE TYPE polarity_type AS ENUM ('Yang','Yin');

CREATE TYPE action_mode AS ENUM (
    'L1_strong_execute',     -- ≥80
    'L2_conditional',        -- ≥65
    'L3_observe',           -- ≥50
    'L4_reduce',            -- ≥35
    'L5_avoid',             -- ≥20
    'L6_stand_aside'        -- <20
);

CREATE TYPE personal_resonance AS ENUM (
    'critical',     -- major clash → STAND ASIDE
    'caution',      -- friction → REDUCE
    'neutral',      -- routine → OBSERVE
    'harmony',      -- cooperation → CONDITIONAL
    'harmony_plus'  -- perfect → EXECUTE
);

CREATE TYPE elemental_alignment AS ENUM (
    'unfavorable',
    'semi_unfavorable',
    'neutral',
    'semi_favorable',
    'favorable'
);

CREATE TYPE day_officer_level AS ENUM (
    'auspicious',
    'specific',
    'warning'
);

CREATE TYPE crisis_tier AS ENUM ('SSS','SS','S','A_plus','A','B','F');

-- ─── REFERENCE TABLES ────────────────────────────────────────

-- 10 Heavenly Stems (天干)
CREATE TABLE ref_heavenly_stems (
    id SMALLINT PRIMARY KEY,
    chinese CHAR(1) NOT NULL UNIQUE,
    pinyin VARCHAR(10) NOT NULL,
    thai VARCHAR(20),
    element element_type NOT NULL,
    polarity polarity_type NOT NULL,
    phase_anchor_index SMALLINT NOT NULL,  -- Ze[stem] for 12 phases
    phase_direction SMALLINT NOT NULL CHECK (phase_direction IN (-1, 1)),  -- n3[stem]
    combine_partner CHAR(1),
    combine_produces element_type
);

-- 12 Earthly Branches (地支)
CREATE TABLE ref_earthly_branches (
    id SMALLINT PRIMARY KEY,
    chinese CHAR(1) NOT NULL UNIQUE,
    pinyin VARCHAR(10) NOT NULL,
    thai VARCHAR(20),
    animal_en VARCHAR(20) NOT NULL,
    animal_zh CHAR(1) NOT NULL,
    animal_th VARCHAR(20),
    element element_type NOT NULL,
    polarity polarity_type NOT NULL,
    sub_element VARCHAR(50),
    season VARCHAR(30),
    month_number SMALLINT,
    hour_range VARCHAR(15),
    direction_degrees SMALLINT,
    organ_tcm VARCHAR(30),
    color_classical VARCHAR(20),
    is_peach_blossom BOOLEAN DEFAULT FALSE,
    self_punishment BOOLEAN DEFAULT FALSE
);

-- Hidden stems within branches (藏干)
CREATE TABLE ref_branch_hidden_stems (
    branch_chinese CHAR(1) REFERENCES ref_earthly_branches(chinese),
    stem_chinese CHAR(1) REFERENCES ref_heavenly_stems(chinese),
    qi_type VARCHAR(20) NOT NULL CHECK (qi_type IN ('main_qi','middle_qi','residual_qi')),
    weight SMALLINT NOT NULL,
    days_active SMALLINT,
    PRIMARY KEY (branch_chinese, stem_chinese)
);

-- 60 Jia Zi cycle (六十甲子)
CREATE TABLE ref_jia_zi_60 (
    id SMALLINT PRIMARY KEY CHECK (id BETWEEN 1 AND 60),
    stem CHAR(1) NOT NULL,
    branch CHAR(1) NOT NULL,
    pillar CHAR(2) GENERATED ALWAYS AS (stem || branch) STORED,
    na_yin_chinese VARCHAR(10),
    na_yin_english VARCHAR(50),
    na_yin_thai VARCHAR(50),
    na_yin_element element_type,
    kong_wang_xun SMALLINT REFERENCES ref_kong_wang_xun(id)
);

-- 6 Kong Wang Xun (六甲旬空)
CREATE TABLE ref_kong_wang_xun (
    id SMALLINT PRIMARY KEY CHECK (id BETWEEN 1 AND 6),
    starts_with VARCHAR(2) NOT NULL,
    void_branch_1 CHAR(1) NOT NULL,
    void_branch_2 CHAR(1) NOT NULL
);

-- 24 Solar Terms with 200-year timestamps
CREATE TABLE ref_solar_terms (
    id BIGSERIAL PRIMARY KEY,
    year SMALLINT NOT NULL,
    order_num SMALLINT NOT NULL CHECK (order_num BETWEEN 1 AND 24),
    chinese VARCHAR(10) NOT NULL,
    pinyin VARCHAR(20),
    english VARCHAR(40),
    thai VARCHAR(40),
    beijing_datetime TIMESTAMPTZ NOT NULL,
    utc_datetime TIMESTAMPTZ NOT NULL,
    type CHAR(3) CHECK (type IN ('jie','qi')),
    UNIQUE(year, order_num)
);
CREATE INDEX idx_solar_terms_utc ON ref_solar_terms(utc_datetime);
CREATE INDEX idx_solar_terms_year ON ref_solar_terms(year);

-- 25 Archetypes (5 archetypes × 5 elemental variants)
CREATE TABLE ref_archetypes_25 (
    id SMALLINT PRIMARY KEY,
    archetype_base VARCHAR(20) NOT NULL CHECK (archetype_base IN ('Connector','Leader','Thinker','Creator','Achiever')),
    element element_type NOT NULL,
    title_en VARCHAR(100),
    title_th VARCHAR(100),
    style_label_en VARCHAR(50),
    style_label_th VARCHAR(50),
    deep_dive_en TEXT,
    deep_dive_th TEXT,
    key_talents_en JSONB,
    key_talents_th JSONB,
    mindset_shift_quote_en TEXT,
    mindset_shift_quote_th TEXT,
    awakening_question_en TEXT,
    awakening_question_th TEXT,
    UNIQUE(archetype_base, element)
);

-- 16 Chart Structures (10 normal + 5 transformation + 3 follow types)
CREATE TABLE ref_structures_18 (
    id SMALLINT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    title_en VARCHAR(80),
    title_th VARCHAR(80),
    title_chinese VARCHAR(20),
    category chart_category NOT NULL,
    subtitle_en TEXT,
    subtitle_th TEXT,
    meaning_en TEXT,
    meaning_th TEXT,
    core_strategy_en VARCHAR(100),
    core_strategy_th VARCHAR(100),
    dos_en JSONB,
    dos_th JSONB,
    donts_en JSONB,
    donts_th JSONB
);

-- 9 Day Master Strengths (Sesheta uses 7 + Decode adds 2)
CREATE TABLE ref_strengths (
    id SMALLINT PRIMARY KEY,
    code day_master_strength NOT NULL UNIQUE,
    label_en VARCHAR(80),
    label_th VARCHAR(80),
    metaphor_en TEXT,
    metaphor_th TEXT,
    meaning_en TEXT,
    meaning_th TEXT,
    core_strategy_en VARCHAR(100),
    core_strategy_th VARCHAR(100),
    dos_en JSONB,
    dos_th JSONB,
    donts_en JSONB,
    donts_th JSONB,
    strength_percentage_min SMALLINT,
    strength_percentage_max SMALLINT
);

-- 23 Personal Stars (Sesheta full set)
CREATE TABLE ref_personal_stars (
    id SMALLINT PRIMARY KEY,
    name_en VARCHAR(40) NOT NULL UNIQUE,
    name_chinese VARCHAR(20),
    name_th VARCHAR(40),
    star_type VARCHAR(30),
    favorable_reading_en TEXT,
    favorable_reading_th TEXT,
    unfavorable_reading_en TEXT,
    unfavorable_reading_th TEXT,
    mixed_reading_en TEXT,
    mixed_reading_th TEXT
);

-- Star × Pillar Position readings (14 stars × 4 pillars)
CREATE TABLE ref_star_pillar_readings (
    star_id SMALLINT REFERENCES ref_personal_stars(id),
    pillar_position VARCHAR(10) CHECK (pillar_position IN ('Year','Month','Day','Hour')),
    label_en VARCHAR(60),
    label_th VARCHAR(60),
    description_en TEXT,
    description_th TEXT,
    PRIMARY KEY (star_id, pillar_position)
);

-- 6 Branch Destructions (Decode-exclusive — Sesheta missing)
CREATE TABLE ref_six_destructions (
    id SMALLINT PRIMARY KEY CHECK (id BETWEEN 1 AND 6),
    branch_a CHAR(1) NOT NULL,
    branch_b CHAR(1) NOT NULL,
    type_label VARCHAR(50),
    domain_primary VARCHAR(50),
    intensity VARCHAR(20),
    interpretation_en TEXT,
    interpretation_th TEXT,
    remediation TEXT,
    strength_modifier NUMERIC(3,2),
    UNIQUE(branch_a, branch_b)
);

-- ─── USER & AUTH TABLES ──────────────────────────────────────

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    full_name TEXT,
    avatar_url TEXT,
    referral_code TEXT UNIQUE,
    referred_by TEXT,
    sign_in_count INTEGER DEFAULT 0,
    last_sign_in_at TIMESTAMPTZ,
    locale TEXT DEFAULT 'th',
    timezone TEXT DEFAULT 'Asia/Bangkok',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_profiles_referral ON profiles(referral_code);

CREATE TABLE user_roles (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL CHECK (role IN ('user','admin','dev','support','influencer')),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, role)
);

-- ─── BIRTH PROFILES & CHARTS ─────────────────────────────────

CREATE TABLE user_birth_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship VARCHAR(30) DEFAULT 'self',  -- self/spouse/child/contact
    birth_date DATE NOT NULL,
    birth_time TIME,
    birth_unknown_time BOOLEAN DEFAULT FALSE,
    birth_location_name TEXT,
    birth_lat NUMERIC(9,6),
    birth_lon NUMERIC(9,6),
    birth_timezone TEXT DEFAULT 'Asia/Bangkok',
    gender VARCHAR(10) CHECK (gender IN ('male','female','unknown')),
    
    -- Solar Time correction (Decode advantage over Sesheta)
    use_true_solar_time BOOLEAN DEFAULT TRUE,
    longitude_correction_minutes NUMERIC(5,2),
    equation_of_time_minutes NUMERIC(5,2),
    
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name, birth_date)
);
CREATE INDEX idx_birth_profiles_user ON user_birth_profiles(user_id);

-- Computed BaZi chart (cached calculation)
CREATE TABLE bazi_charts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    birth_profile_id UUID REFERENCES user_birth_profiles(id) ON DELETE CASCADE,
    
    -- 4 Pillars
    year_stem CHAR(1) NOT NULL,
    year_branch CHAR(1) NOT NULL,
    month_stem CHAR(1) NOT NULL,
    month_branch CHAR(1) NOT NULL,
    day_stem CHAR(1) NOT NULL,
    day_branch CHAR(1) NOT NULL,
    hour_stem CHAR(1),
    hour_branch CHAR(1),
    
    day_master_element element_type NOT NULL,
    day_master_polarity polarity_type NOT NULL,
    
    -- Strength analysis
    strength_level day_master_strength NOT NULL,
    strength_percentage NUMERIC(5,2),
    structure_code VARCHAR(20) REFERENCES ref_structures_18(code),
    structure_category chart_category,
    
    -- Useful God
    useful_god_priority useful_god_priority,
    useful_god_best_element element_type,
    useful_god_crisis_type VARCHAR(50),  -- Frozen/Damp/Scorched/Dryness
    useful_god_elements JSONB,  -- [{element, tier, category, reason}]
    
    -- Element distribution (5 elements %)
    element_wood NUMERIC(4,1),
    element_fire NUMERIC(4,1),
    element_earth NUMERIC(4,1),
    element_metal NUMERIC(4,1),
    element_water NUMERIC(4,1),
    
    -- Ten Gods scores
    ten_gods_scores JSONB,  -- {F: 100, RW: 0, EG: 75, ...}
    
    -- Archetype distribution (5 archetypes ranked)
    archetypes JSONB,
    primary_archetype VARCHAR(20),
    primary_archetype_element element_type,  -- → links to ref_archetypes_25
    
    -- Personal Stars (14 stars detected)
    personal_stars JSONB,  -- {nobleman: ['Year'], peach_blossom: ['Day','Hour'], ...}
    
    -- Kong Wang
    kong_wang_branches CHAR(1)[2],
    kong_wang_xun_id SMALLINT REFERENCES ref_kong_wang_xun(id),
    
    -- Six Destructions (Decode-exclusive)
    six_destructions_detected JSONB,  -- [{pair_id, branches, severity}]
    
    -- Branch reactions (9 layer Sesheta scoring)
    branch_reactions JSONB,
    
    -- Luck pillars (10 forward pillars)
    luck_pillars JSONB,  -- [{stem, branch, start_age, end_age}]
    luck_direction VARCHAR(10) CHECK (luck_direction IN ('forward','reverse')),
    
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    engine_version VARCHAR(20) DEFAULT '1.0',
    UNIQUE(birth_profile_id, engine_version)
);
CREATE INDEX idx_bazi_charts_profile ON bazi_charts(birth_profile_id);

-- ─── DAILY TRADER ENGINE ─────────────────────────────────────

-- Pre-computed daily readings for each user (refreshed nightly)
CREATE TABLE daily_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    birth_profile_id UUID REFERENCES user_birth_profiles(id) ON DELETE CASCADE,
    reading_date DATE NOT NULL,
    
    -- Day's pillars
    day_stem CHAR(1) NOT NULL,
    day_branch CHAR(1) NOT NULL,
    
    -- 4-Layer engine
    personal_resonance personal_resonance,
    personal_resonance_score NUMERIC(5,2),
    elemental_alignment elemental_alignment,
    elemental_alignment_score NUMERIC(5,2),
    day_officer day_officer_level,
    tier_rank SMALLINT CHECK (tier_rank BETWEEN 1 AND 7),
    
    -- Action Mode (Decode L1-L6)
    action_mode action_mode,
    action_mode_score NUMERIC(5,2),
    hard_veto_active BOOLEAN DEFAULT FALSE,
    hard_veto_reasons TEXT[],
    
    -- Pillar echoes (which natal pillar resonates today)
    pillar_echoes JSONB,
    
    -- Six Destructions activation
    destructions_active JSONB,
    
    -- Personalized advice (3 languages)
    headline_th TEXT,
    headline_en TEXT,
    headline_zh TEXT,
    summary_th TEXT,
    summary_en TEXT,
    summary_zh TEXT,
    
    -- Specific recommendations
    do_activities JSONB,  -- ["sign contracts", "negotiate"]
    avoid_activities JSONB,
    lucky_directions VARCHAR(50),
    lucky_colors VARCHAR(50),
    lucky_hours JSONB,  -- [{hour_branch, score, reason}]
    
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(birth_profile_id, reading_date)
);
CREATE INDEX idx_daily_readings_date ON daily_readings(user_id, reading_date DESC);

-- ─── SUBSCRIPTIONS & CREDITS ─────────────────────────────────

CREATE TABLE subscription_plans (
    id VARCHAR(30) PRIMARY KEY,  -- 'free', 'plus', 'pro', 'enterprise'
    name TEXT NOT NULL,
    daily_credits INTEGER NOT NULL,
    monthly_price_thb NUMERIC(10,2),
    monthly_price_usd NUMERIC(10,2),
    features JSONB,
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO subscription_plans VALUES
('free',  'Free',       5,   0,    0,    '{"ai_chat":true, "daily_readings":true}', TRUE),
('plus',  'Plus',       25,  390,  9.99, '{"qimen":true, "compatibility":true}', TRUE),
('pro',   'Pro',        25,  990,  24.99,'{"hour_advisor":true, "luck_pillars":true}', TRUE),
('enterprise','Enterprise',-1,9990, 249,  '{"unlimited":true, "team":true}', TRUE);

CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    plan_id VARCHAR(30) REFERENCES subscription_plans(id),
    is_active BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    payment_past_due BOOLEAN DEFAULT FALSE,
    stripe_subscription_id TEXT,
    campaign_id UUID,
    cancelled_at TIMESTAMPTZ
);
CREATE INDEX idx_user_subs_active ON user_subscriptions(user_id, is_active, expires_at);

-- AI Credits ("Cosmic Ink" in Sesheta, "Decode Tokens" in Decode)
CREATE TABLE ai_credits (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    credits_remaining NUMERIC(10,2) DEFAULT 0,
    free_credits NUMERIC(10,2) DEFAULT 5,
    daily_drip_credits NUMERIC(10,2) DEFAULT 0,
    subscription_credits NUMERIC(10,2) DEFAULT 0,
    topup_credits NUMERIC(10,2) DEFAULT 0,
    total_used NUMERIC(12,2) DEFAULT 0,
    last_daily_drip_at TIMESTAMPTZ
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_birth_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bazi_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users see own birth profiles" ON user_birth_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own charts" ON bazi_charts FOR SELECT USING (
    auth.uid() = (SELECT user_id FROM user_birth_profiles WHERE id = birth_profile_id)
);
CREATE POLICY "Users see own readings" ON daily_readings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users see own subs" ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users see own credits" ON ai_credits FOR SELECT USING (auth.uid() = user_id);

-- ─── INDEXES & PERFORMANCE ───────────────────────────────────
CREATE INDEX idx_charts_day_master ON bazi_charts(day_master_element, strength_level);
CREATE INDEX idx_charts_useful_god ON bazi_charts(useful_god_best_element);
CREATE INDEX idx_readings_action ON daily_readings(action_mode, reading_date);

-- =============================================================
-- DECODE-EXCLUSIVE FEATURES vs Sesheta:
-- 1. Six Destructions table + tracking
-- 2. True Solar Time correction (longitude + EoT)
-- 3. 25 Archetypes (vs Sesheta's 5 base)
-- 4. Action Mode L1-L6 (vs Sesheta's resonance levels)
-- 5. Multi-language (TH+EN+ZH) from launch
-- 6. Na Yin 60 lookup (Sesheta has zero)
-- 7. Crisis tier with structured detection
-- 8. Hour-by-hour luck refinement (separate hour_advisor table)
-- =============================================================
