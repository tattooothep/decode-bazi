/**
 * fusion5 · สร้าง prompt ต่อศาสตร์ (engine packet + คัมภีร์ + คำถาม + guard กันมั่ว)
 * แต่ละศาสตร์ render ผังของตัวเอง → ป้อน AI · ห้ามปนผัง/ศัพท์ข้ามศาสตร์
 */
import { createHash } from "crypto";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { buildQizhengPacket } from "../astro/qizheng/packet";
import { renderQizhengPrompt } from "../astro/qizheng/render";
import { westernChart } from "../astro/western/engine";
import { buildWesternPacket } from "../astro/western/packet";
import { buildWesternTimeline, type WesternTimeline } from "../astro/western/timeline";
import { renderMultiYearBlock, renderPairTimingBlock, resolveFusionYearRange, type FusionBirthLike } from "./multi-year";
import { renderWesternPrompt } from "../astro/western/render";
import { vedicChart } from "../astro/vedic/engine";
import { buildVedicPacket } from "../astro/vedic/packet";
import { renderVedicPrompt } from "../astro/vedic/render";
import { buildVedicTimeline, type VedicTimeline } from "../astro/vedic/timeline";
import { buildZiweiPacket } from "../astro/ziwei/packet";
import { renderZiweiPrompt } from "../astro/ziwei/render";
import { DISCIPLINES, type ScienceId } from "./disciplines";
import { renderPairInteractionPacket } from "./pair-interactions";

export type BirthData = {
  name: string;
  dtUTC: Date;
  lat: number;
  lng: number;
  hasTime: boolean;
  gender: "M" | "F";
  birthDate?: string;
  birthTime?: string;
  timezone?: string;
};
export type FusionTimingReference = {
  refDate: Date;
  targetYear: number;
  source: "question_date" | "question_year" | "relative_year" | "current_date";
  label: string;
};

const CANON_DIR = join(process.cwd(), "data/library/astro-canon");
export const CANON_TEXT_MAX_CHARS = 56_000;
export const CANON_TEXT_MIN_CHARS = 4_000;
export const FUSION_PANEL_PROMPT_MAX_CHARS = 78_000;
export const JUDGE_PANEL_REPLY_MAX_CHARS = 8_000;

type CanonMode = "verbatim" | "summary";
type CanonLicenseClass = "public_domain" | "project_summary" | "summary_only" | "licensed_internal" | "unknown";
export type CanonSourceMapRow = {
  science: ScienceId;
  sourceId: string;
  file: string;
  title: string;
  sourceUrl: string;
  licenseClass: CanonLicenseClass;
  sourceHashSha256: string;
  promptSegmentHashSha256: string;
  includedChars: number;
  totalChars: number;
  truncated: boolean;
  mode: CanonMode;
};
export type CanonBundle = {
  science: ScienceId;
  text: string;
  textHashSha256: string;
  promptChars: number;
  truncated: boolean;
  sourceMap: CanonSourceMapRow[];
};
const canonCache = new Map<string, CanonBundle>();

const CANON_SOURCE_META: Partial<Record<ScienceId, Record<string, Partial<Pick<CanonSourceMapRow, "title" | "sourceUrl" | "licenseClass" | "mode">>>>> = {
  western: {
    "00-method.md": { title: "Western method guard · Ptolemy/Lilly summary", sourceUrl: "local:western-method", licenseClass: "project_summary", mode: "summary" },
    "00a-public-domain-interactions.md": { title: "Western public-domain planetary interaction rule pack", sourceUrl: "https://archive.org/details/b30338724 ; https://archive.org/details/b30335735 ; https://archive.org/details/b30323149 ; https://archive.org/details/b30330270 ; https://www.gutenberg.org/ebooks/70850", licenseClass: "project_summary", mode: "summary" },
    "01-compact-addenda.md": { title: "Western compact addenda · Ptolemy/Lilly/Robson/Raphael summary", sourceUrl: "https://archive.org/details/ptolemystetrabi00procgoog ; https://archive.org/details/ca-william-lilly ; https://archive.org/details/in.ernet.dli.2015.128091", licenseClass: "project_summary", mode: "summary" },
    "02-lilly-houses.md": { title: "William Lilly · Christian Astrology house/dignity notes", sourceUrl: "https://archive.org/details/ca-william-lilly", licenseClass: "public_domain", mode: "verbatim" },
    "00b-licensed-modern-source-policy.md": { title: "Western licensed modern sources · internal-use policy", sourceUrl: "local:restricted-western-license", licenseClass: "licensed_internal", mode: "summary" },
    "00c-licensed-modern-extraction-framework.md": { title: "Western licensed modern extraction framework", sourceUrl: "local:restricted-western-extraction-framework", licenseClass: "licensed_internal", mode: "summary" },
    "00d-public-domain-expanded-judgment-rules.md": { title: "Western expanded judgment rules from downloaded public-domain sources · classical/medieval/Morin/Placidus/Alan-Leo-Progressed-Horoscope/Abu-Mashar/Haly/LOC-OCR/early-modern/georgian/glossary/medical-Culpeper/horary-Penseyre/mundane-comet-Lilly-Partridge/aphorism-collation/modern-bridge/planet-monograph/nativity/degree-table/periodical provenance", sourceUrl: "local:private/restricted-sources/western/public-domain", licenseClass: "project_summary", mode: "summary" },
    "00e-public-domain-modern-bridge-rules.md": { title: "Western public-domain modern bridge rules · aspects/progressions/fixed stars/planet monographs/notable nativities/Morin determination/Placidus timing/degree faces/periodicals", sourceUrl: "local:private/restricted-sources/western/public-domain", licenseClass: "project_summary", mode: "summary" },
    "00f-public-domain-no-time-predictive-medical-rules.md": { title: "Western public-domain no-time/predictive/progressed-horoscope/medical guards", sourceUrl: "local:private/restricted-sources/western/public-domain", licenseClass: "project_summary", mode: "summary" },
    "00g-public-domain-horary-electional-mundane-classical-rules.md": { title: "Western public-domain horary/electional/mundane/classical guards · Culpeper/Penseyre/Abu-Mashar/Haly/Lilly-Partridge-conjunction/comet/Planetenbuch scoped", sourceUrl: "local:private/restricted-sources/western/public-domain", licenseClass: "project_summary", mode: "summary" },
    "tetrabiblos-core.md": { title: "Ptolemy · Tetrabiblos core notes", sourceUrl: "https://archive.org/details/ptolemystetrabi00procgoog", licenseClass: "public_domain", mode: "verbatim" },
    "03-synastry-timing-notime-weighting.md": { title: "Western synastry/timing/progressed-horoscope/no-time/fixed-star weighting pack", sourceUrl: "local:private/restricted-sources/western/public-domain", licenseClass: "project_summary", mode: "summary" },
    "04-specialty-router-evidence-gates.md": { title: "Western specialty router and evidence gates · timing/horary/electional/medical/mundane/rectification/locality", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "05-dignity-lots-specificity.md": { title: "Western dignity/lots/sect specificity pack · bounds/triplicity/face/lots evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "06-relationship-nativity-specificity.md": { title: "Western relationship and nativity specificity pack · 5th/7th/Venus/Mars/Moon/Sun/lots/pair evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-relationship-summary", licenseClass: "project_summary", mode: "summary" },
    "07-career-money-health-specificity.md": { title: "Western career/money/health specificity pack · MC/2nd/6th/8th/10th/11th/12th/lots/timing evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-topic-summary", licenseClass: "project_summary", mode: "summary" },
    "08-natal-life-direction-specificity.md": { title: "Western natal life-direction specificity pack · Asc/chart-ruler/Sun/Moon/sect/dominant/aspects/lots evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-natal-summary", licenseClass: "project_summary", mode: "summary" },
    "09-home-family-travel-study-specificity.md": { title: "Western home/family/children/travel/study specificity pack · 3rd/4th/5th/9th/12th/lots/timing evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-life-field-summary", licenseClass: "project_summary", mode: "summary" },
    "10-people-network-collaboration-specificity.md": { title: "Western people/network/collaboration specificity pack · 3rd/6th/7th/10th/11th houses and people-role evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-people-summary", licenseClass: "project_summary", mode: "summary" },
    "11-risk-dispute-hidden-pressure-specificity.md": { title: "Western risk/dispute/debt/hidden-pressure specificity pack · 6th/7th/8th/10th/12th houses and risk evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-risk-summary", licenseClass: "project_summary", mode: "summary" },
    "12-fortune-fame-inner-life-specificity.md": { title: "Western fortune/fame/inner-life specificity pack · Fortune/Spirit/MC/10th/9th/12th/Moon evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-fortune-summary", licenseClass: "project_summary", mode: "summary" },
    "13-temperament-talent-appearance-specificity.md": { title: "Western temperament/talent/appearance specificity pack · Asc/chart-ruler/1st/Sun/Moon/Mercury/Venus/Mars evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-talent-summary", licenseClass: "project_summary", mode: "summary" },
    "14-timing-forecast-specificity.md": { title: "Western timing/forecast specificity pack · natal promise/transit/refDate/return-cycle evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-timing-summary", licenseClass: "project_summary", mode: "summary" },
    "15-decision-action-guidance-specificity.md": { title: "Western decision/action guidance specificity pack · go-wait-choice evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-decision-summary", licenseClass: "project_summary", mode: "summary" },
    "16-remedy-mitigation-specificity.md": { title: "Western remedy/mitigation specificity pack · house-ruler/support/blocker risk-reduction evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-remedy-summary", licenseClass: "project_summary", mode: "summary" },
    "17-validation-past-event-specificity.md": { title: "Western validation/past-event specificity pack · falsifiable house-ruler/aspect/timing markers", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-validation-summary", licenseClass: "project_summary", mode: "summary" },
    "18-planetary-interaction-specificity.md": { title: "Western planetary interaction specificity pack · aspect/contact role-capacity-topic judgment", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-interaction-summary", licenseClass: "project_summary", mode: "summary" },
    "19-specialty-scope-availability.md": { title: "Western specialty scope availability pack · horary/electional/medical/mundane/locality/progression branch guard", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-specialty-summary", licenseClass: "project_summary", mode: "summary" },
    "20-business-investment-contract-specificity.md": { title: "Western business/investment/contract specificity pack · 10th/2nd/11th/7th/8th/timing evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-business-summary", licenseClass: "project_summary", mode: "summary" },
    "21-authority-document-legal-specificity.md": { title: "Western authority/document/legal/approval specificity pack · 3rd/9th/10th/7th/8th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-authority-summary", licenseClass: "project_summary", mode: "summary" },
    "22-employment-job-offer-specificity.md": { title: "Western employment/job-offer/interview/promotion/salary specificity pack · 10th/6th/2nd/3rd/7th/11th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-employment-summary", licenseClass: "project_summary", mode: "summary" },
    "23-property-vehicle-relocation-specificity.md": { title: "Western property/vehicle/residence/relocation specificity pack · 4th/2nd/8th/7th/3rd/9th/12th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-property-summary", licenseClass: "project_summary", mode: "summary" },
    "24-health-surgery-recovery-specificity.md": { title: "Western health/surgery/accident/stress/recovery specificity pack · 1st/6th/8th/12th/Moon/Mars/Saturn evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-health-summary", licenseClass: "project_summary", mode: "summary" },
    "25-education-exam-writing-specificity.md": { title: "Western education/exam/certification/writing specificity pack · 3rd/Mercury/9th/Jupiter/10th/MC/2nd/8th/11th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-education-summary", licenseClass: "project_summary", mode: "summary" },
    "26-children-pregnancy-creativity-specificity.md": { title: "Western children/pregnancy/fertility/creative-output specificity pack · 5th/Moon/Venus/Jupiter/7th/6th/8th/12th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-children-summary", licenseClass: "project_summary", mode: "summary" },
    "27-travel-foreign-relocation-specificity.md": { title: "Western travel/foreign/relocation/outside-opportunity specificity pack · 3rd/9th/12th/4th/10th/11th/2nd/8th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-travel-summary", licenseClass: "project_summary", mode: "summary" },
    "28-relationship-status-marriage-breakup-specificity.md": { title: "Western relationship status/marriage/breakup/reconciliation specificity pack · 5th/7th/Venus/Mars/Moon/Sun/Saturn/timing evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-relationship-status-summary", licenseClass: "project_summary", mode: "summary" },
    "29-windfall-speculation-cash-leak-specificity.md": { title: "Western windfall/speculation/cash-leak specificity pack · 2nd/5th/8th/11th/Fortune/12th risk evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-windfall-summary", licenseClass: "project_summary", mode: "summary" },
    "30-creator-audience-sales-conversion-specificity.md": { title: "Western creator/audience/customer-conversion specificity pack · 3rd/5th/10th/11th/7th/2nd/Fortune evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-creator-summary", licenseClass: "project_summary", mode: "summary" },
    "31-reputation-public-trust-crisis-specificity.md": { title: "Western reputation/public-trust/review/crisis specificity pack · MC/10th/3rd/11th/7th/2nd/8th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-reputation-summary", licenseClass: "project_summary", mode: "summary" },
    "32-retention-refund-subscription-churn-specificity.md": { title: "Western retention/refund/subscription/churn specificity pack · 7th/2nd/8th/3rd/6th/11th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-retention-summary", licenseClass: "project_summary", mode: "summary" },
    "33-pricing-offer-promotion-upsell-specificity.md": { title: "Western pricing/offer/promotion/upsell specificity pack · MC/10th/2nd/Fortune/7th/3rd/11th/6th/8th/12th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-pricing-summary", licenseClass: "project_summary", mode: "summary" },
    "34-marketing-acquisition-campaign-funnel-specificity.md": { title: "Western marketing/acquisition/campaign/funnel specificity pack · 3rd/MC/11th/7th/2nd/6th/8th/12th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-marketing-summary", licenseClass: "project_summary", mode: "summary" },
    "35-service-support-operations-fulfillment-specificity.md": { title: "Western service/support/operations/fulfillment specificity pack · 3rd/7th/MC/6th/2nd/8th/12th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-service-summary", licenseClass: "project_summary", mode: "summary" },
    "36-technology-product-platform-ai-specificity.md": { title: "Western technology/product/platform/AI/software specificity pack · 3rd/MC/6th/7th/11th/4th/12th/2nd/8th evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-tech-product-summary", licenseClass: "project_summary", mode: "summary" },
    "37-career-industry-market-fit-specificity.md": { title: "Western career/industry/market/role-fit specificity pack · Asc/MC/2nd/3rd/6th/7th/11th/4th/12th fit evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-industry-fit-summary", licenseClass: "project_summary", mode: "summary" },
	    "38-customer-audience-persona-fit-specificity.md": { title: "Western customer/audience/persona-fit specificity pack · 7th/11th/3rd/10th/2nd/6th/12th buyer evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-customer-persona-summary", licenseClass: "project_summary", mode: "summary" },
	    "39-product-service-offer-fit-specificity.md": { title: "Western product/service/offer-fit specificity pack · Asc/MC/2nd/3rd/5th/7th/11th/6th/8th/12th offer evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-product-offer-summary", licenseClass: "project_summary", mode: "summary" },
	    "40-delivery-model-capacity-specificity.md": { title: "Western delivery-model/capacity specificity pack · Asc/MC/3rd/7th/11th/2nd/4th/6th/8th/12th delivery evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-delivery-model-summary", licenseClass: "project_summary", mode: "summary" },
	    "41-premium-low-ticket-value-ladder-specificity.md": { title: "Western premium/low-ticket/value-ladder specificity pack · Asc/MC/2nd/3rd/5th/7th/11th/6th/8th/12th tier evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-value-ladder-summary", licenseClass: "project_summary", mode: "summary" },
	    "42-guarantee-scope-boundary-specificity.md": { title: "Western guarantee/scope-boundary/refund-proof specificity pack · Asc/MC/3rd/7th/11th/2nd/8th/6th/12th promise evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-scope-boundary-summary", licenseClass: "project_summary", mode: "summary" },
	    "43-sales-page-webinar-consult-script-specificity.md": { title: "Western sales-page/webinar/consult-script specificity pack · Asc/3rd/MC/7th/11th/2nd/5th/6th/8th/12th sales-message evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-sales-script-summary", licenseClass: "project_summary", mode: "summary" },
	    "44-onboarding-qualification-form-specificity.md": { title: "Western onboarding/qualification/intake gate specificity pack · Asc/3rd/MC/7th/11th/2nd/4th/8th/Moon/6th/12th screening evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-qualification-gate-summary", licenseClass: "project_summary", mode: "summary" },
	    "45-case-study-testimonial-proof-library-specificity.md": { title: "Western case-study/testimonial/proof-library specificity pack · Asc/MC/3rd/7th/11th/2nd/Fortune/4th/8th/Moon/6th/12th proof evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-proof-library-summary", licenseClass: "project_summary", mode: "summary" },
	    "46-customer-success-renewal-playbook-specificity.md": { title: "Western customer-success/renewal-playbook specificity pack · Asc/MC/3rd/7th/11th/2nd/Fortune/4th/8th/Moon/6th/12th success-renewal evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-customer-success-summary", licenseClass: "project_summary", mode: "summary" },
	    "47-partnership-affiliate-referral-program-specificity.md": { title: "Western partnership/affiliate/referral-program specificity pack · Asc/MC/3rd/7th/11th/2nd/Fortune/4th/8th/9th/Jupiter/6th/12th partner-channel evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-partnership-affiliate-summary", licenseClass: "project_summary", mode: "summary" },
	    "48-hiring-delegation-org-design-specificity.md": { title: "Western hiring/delegation/org-design specificity pack · Asc/MC/3rd/6th/7th/11th/2nd/Fortune/4th/8th/12th role-team evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-hiring-delegation-summary", licenseClass: "project_summary", mode: "summary" },
	    "49-team-compensation-incentive-performance-specificity.md": { title: "Western team compensation/incentive/performance specificity pack · Asc/MC/2nd/Fortune/3rd/6th/7th/11th/8th/12th pay-KPI evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-team-compensation-summary", licenseClass: "project_summary", mode: "summary" },
		    "50-partner-due-diligence-conflict-termination-specificity.md": { title: "Western partner due-diligence/conflict/termination specificity pack · Asc/7th/MC/2nd/Fortune/8th/4th/3rd/9th/6th/11th/12th partner-risk evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-partner-risk-summary", licenseClass: "project_summary", mode: "summary" },
		    "51-sales-team-pipeline-qa-followup-specificity.md": { title: "Western sales-team/pipeline/QA/follow-up specificity pack · Asc/MC/3rd/7th/6th/2nd/Fortune/8th/11th/12th sales-ops evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-sales-team-qa-summary", licenseClass: "project_summary", mode: "summary" },
		    "52-cashflow-runway-budget-cost-control-specificity.md": { title: "Western cashflow/runway/budget/cost-control specificity pack · Asc/2nd/Fortune/4th/MC/3rd/9th/7th/6th/8th/12th/11th cash discipline evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-cashflow-budget-summary", licenseClass: "project_summary", mode: "summary" },
			    "53-unit-economics-profit-breakeven-payback-specificity.md": { title: "Western unit-economics/profit-margin/break-even/payback specificity pack · Asc/2nd/Fortune/MC/10th/4th/IC/3rd/Mercury/7th/6th/8th/12th margin evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-unit-economics-summary", licenseClass: "project_summary", mode: "summary" },
			    "54-inventory-procurement-supplier-stock-specificity.md": { title: "Western inventory/procurement/supplier/stock specificity pack · Asc/4th/IC/2nd/Fortune/MC/10th/3rd/Mercury/7th/6th/9th/12th stock-flow evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-inventory-procurement-summary", licenseClass: "project_summary", mode: "summary" },
				    "55-tax-accounting-bookkeeping-compliance-specificity.md": { title: "Western tax/accounting/bookkeeping/compliance specificity pack · Asc/3rd-Mercury/MC-10th/2nd-Fortune/4th-IC/7th/6th/8th/9th/12th tax-record evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-tax-accounting-summary", licenseClass: "project_summary", mode: "summary" },
				    "56-loan-credit-debt-refinance-specificity.md": { title: "Western loan/credit/debt/refinance specificity pack · Asc/2nd-Fortune/8th/4th-IC/7th/3rd-Mercury/6th/10th/12th debt-service evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-loan-credit-debt-summary", licenseClass: "project_summary", mode: "summary" },
				    "57-insurance-claim-policy-coverage-specificity.md": { title: "Western insurance/claim/policy/coverage specificity pack · Asc/2nd-Fortune/8th/4th-IC/7th/3rd-Mercury/6th/10th/12th insurance evidence weighting", sourceUrl: "local:private/restricted-sources/western/public-domain+licensed-derived-insurance-claim-summary", licenseClass: "project_summary", mode: "summary" },
			  },
  vedic: {
    "00-method.md": { title: "Jyotish method guard · Parashari summary", sourceUrl: "local:vedic-method", licenseClass: "project_summary", mode: "summary" },
    "01-classical-rules.md": { title: "Jyotish compact classical rules · Brihat Jataka / Phaladeepika / BPHS summary", sourceUrl: "https://archive.org/details/brihatjatakavar00iyergoog ; https://archive.org/details/in.ernet.dli.2015.92117", licenseClass: "project_summary", mode: "summary" },
    "02-bphs-dasha-yoga.md": { title: "BPHS dasha/yoga working summary", sourceUrl: "local:bphs-summary", licenseClass: "summary_only", mode: "summary" },
    "03-public-domain-source-coverage.md": { title: "Jyotish source coverage · BPHS / Brihat Jataka-Vijnananda-Bhattotpala-commentaries / Hora Ratnam / Daivajna Vallabha / Daivagya Kamadhenu / Hora Shastra / Yavana Jataka / Row Stri Jataka-Sarvartha-Chappanna / Samaya Shuddhi / Dasha-Gochara Phala / expanded Siddhanta-Aryabhatiya-JyotishaSiddhanta-Vedanga / Brihat Samhita / Saravali / Phaladeepika-PhalaDeepika / Jataka Parijata-Tattva-Alankara-Chandrika-Abharana-Bharanam-Paddhati / Lagna Chandrika / Manasagari / Hora Sara / Sambhu Hora / Bhava Kutuhala-Prakasha / Jyotisha-Jyotir-Nav Ratnamala / Uttara Kalamrita / Jaimini / Laghu Parashari / Sarvartha / Garga / Bhrigu / Muhurta-Darpana-Sindhu-Ganapati-Martanda-Kalaprakashika-Vivaha / Prasna-Chappanna-Manorama-Ratna-Skandhasthi-Shatpanchasika / Tajika-Varsha / Ashtakavarga-Nakshatra-Dasha / Graha Laghava", sourceUrl: "local:private/restricted-sources/vedic/public-domain+incoming", licenseClass: "project_summary", mode: "summary" },
    "04-topic-packs.md": { title: "Jyotish topic packs · marriage/stri-jataka/career/wealth/health/dasha-ashtottari-gochara/no-time-nakshatra/yavana-kamadhenu-hora/row-collation/prashna-chappanna-manorama-ratna-skandhasthi/tajika/ashtakavarga/muhurta-martanda-samaya-shuddhi/siddhanta-provenance/vivaha", sourceUrl: "local:private/restricted-sources/vedic/public-domain+incoming", licenseClass: "project_summary", mode: "summary" },
    "05-dasha-deepening-rules.md": { title: "Jyotish dasha deepening pack · Vimshottari/antardasha/pratyantar/ashtakavarga/gochara guards", sourceUrl: "local:private/restricted-sources/vedic/public-domain+incoming-dasha-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "06-evidence-gates-specialty-router.md": { title: "Jyotish evidence gates and specialty router · natal/topic/prashna/muhurta/tajika/jaimini/no-time", sourceUrl: "local:private/restricted-sources/vedic/public-domain+incoming-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "07-functional-topic-specificity.md": { title: "Jyotish functional topic specificity pack · bhava/karaka/varga/bala/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+incoming-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "08-compatibility-specificity.md": { title: "Jyotish compatibility and marriage specificity pack · Tara/Moon/D9/dasha/pair evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-relationship-summary", licenseClass: "project_summary", mode: "summary" },
    "09-career-wealth-health-specificity.md": { title: "Jyotish career/wealth/health specificity pack · 10th/D10/2nd/11th/5th/9th/6th/8th/12th evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-topic-summary", licenseClass: "project_summary", mode: "summary" },
    "10-natal-life-direction-specificity.md": { title: "Jyotish natal life-direction specificity pack · Lagna/Moon/Sun/bhava/varga/bala/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-natal-summary", licenseClass: "project_summary", mode: "summary" },
    "11-home-family-travel-study-specificity.md": { title: "Jyotish home/family/children/travel/study specificity pack · 3rd/4th/5th/9th/12th/varga/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-life-field-summary", licenseClass: "project_summary", mode: "summary" },
    "12-people-network-collaboration-specificity.md": { title: "Jyotish people/network/collaboration specificity pack · 3rd/6th/7th/10th/11th bhava and role evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-people-summary", licenseClass: "project_summary", mode: "summary" },
    "13-risk-dispute-hidden-pressure-specificity.md": { title: "Jyotish risk/dispute/debt/hidden-pressure specificity pack · 6th/7th/8th/10th/12th bhava and risk evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-risk-summary", licenseClass: "project_summary", mode: "summary" },
    "14-fortune-fame-inner-life-specificity.md": { title: "Jyotish fortune/fame/inner-life specificity pack · 5th/9th/10th/11th/12th/D9/D10 evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-fortune-summary", licenseClass: "project_summary", mode: "summary" },
    "15-temperament-talent-appearance-specificity.md": { title: "Jyotish temperament/talent/appearance specificity pack · Lagna/Moon/nakshatra/skill bhava/graha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-talent-summary", licenseClass: "project_summary", mode: "summary" },
    "16-timing-forecast-specificity.md": { title: "Jyotish timing/forecast specificity pack · dasha/gochara/ashtakavarga/refDate evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-timing-summary", licenseClass: "project_summary", mode: "summary" },
    "17-decision-action-guidance-specificity.md": { title: "Jyotish decision/action guidance specificity pack · go-wait-choice dasha/bhava evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-decision-summary", licenseClass: "project_summary", mode: "summary" },
    "18-remedy-mitigation-specificity.md": { title: "Jyotish remedy/mitigation specificity pack · bhava/karaka/dasha/graha risk-reduction evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-remedy-summary", licenseClass: "project_summary", mode: "summary" },
    "19-validation-past-event-specificity.md": { title: "Jyotish validation/past-event specificity pack · falsifiable bhava/graha/varga/dasha markers", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-validation-summary", licenseClass: "project_summary", mode: "summary" },
    "20-graha-interaction-specificity.md": { title: "Jyotish graha interaction specificity pack · drishti/yoga/contact role-capacity-topic judgment", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-interaction-summary", licenseClass: "project_summary", mode: "summary" },
    "21-specialty-scope-prashna-muhurta-guard.md": { title: "Jyotish specialty scope guard · prashna/muhurta/tajika/jaimini/alternate-dasha availability", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-specialty-summary", licenseClass: "project_summary", mode: "summary" },
    "22-business-investment-contract-specificity.md": { title: "Jyotish business/investment/contract specificity pack · 10th/D10/2nd/11th/7th/8th/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-business-summary", licenseClass: "project_summary", mode: "summary" },
    "23-authority-document-legal-specificity.md": { title: "Jyotish authority/document/legal/approval specificity pack · 3rd/9th/10th/7th/6th/8th/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-authority-summary", licenseClass: "project_summary", mode: "summary" },
    "24-employment-job-offer-specificity.md": { title: "Jyotish employment/job-offer/interview/promotion/salary specificity pack · 10th/D10/6th/2nd/11th/3rd/7th/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-employment-summary", licenseClass: "project_summary", mode: "summary" },
    "25-property-vehicle-relocation-specificity.md": { title: "Jyotish property/vehicle/residence/relocation specificity pack · 4th/2nd/11th/8th/12th/7th/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-property-summary", licenseClass: "project_summary", mode: "summary" },
    "26-health-surgery-recovery-specificity.md": { title: "Jyotish health/surgery/accident/stress/recovery specificity pack · Lagna/Moon/6th/8th/12th/Mars/Saturn/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-health-summary", licenseClass: "project_summary", mode: "summary" },
    "27-education-exam-writing-specificity.md": { title: "Jyotish education/exam/certification/writing specificity pack · 3rd/4th/5th/9th/Mercury/Jupiter/10th/D10/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-education-summary", licenseClass: "project_summary", mode: "summary" },
    "28-children-pregnancy-creativity-specificity.md": { title: "Jyotish children/pregnancy/fertility/creative-output specificity pack · 5th/Jupiter/Sun/Moon/Venus/7th/6th/8th/12th/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-children-summary", licenseClass: "project_summary", mode: "summary" },
    "29-travel-foreign-relocation-specificity.md": { title: "Jyotish travel/foreign/relocation/outside-opportunity specificity pack · 3rd/9th/12th/4th/10th/D10/11th/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-travel-summary", licenseClass: "project_summary", mode: "summary" },
    "30-relationship-status-marriage-breakup-specificity.md": { title: "Jyotish relationship status/marriage/breakup/reconciliation specificity pack · 7th/Venus/Jupiter/Moon/D9/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-relationship-status-summary", licenseClass: "project_summary", mode: "summary" },
    "31-windfall-speculation-cash-leak-specificity.md": { title: "Jyotish windfall/speculation/cash-leak specificity pack · 2nd/11th/5th/8th/12th/Rahu/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-windfall-summary", licenseClass: "project_summary", mode: "summary" },
    "32-creator-audience-sales-conversion-specificity.md": { title: "Jyotish creator/audience/customer-conversion specificity pack · 3rd/5th/10th/D10/11th/7th/2nd/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-creator-summary", licenseClass: "project_summary", mode: "summary" },
    "33-reputation-public-trust-crisis-specificity.md": { title: "Jyotish reputation/public-trust/review/crisis specificity pack · Lagna/Moon/10th/D10/3rd/11th/7th/2nd/8th evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-reputation-summary", licenseClass: "project_summary", mode: "summary" },
    "34-retention-refund-subscription-churn-specificity.md": { title: "Jyotish retention/refund/subscription/churn specificity pack · 7th/2nd/11th/8th/12th/3rd/6th/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-retention-summary", licenseClass: "project_summary", mode: "summary" },
    "35-pricing-offer-promotion-upsell-specificity.md": { title: "Jyotish pricing/offer/promotion/upsell specificity pack · 10th/D10/2nd/11th/7th/3rd/6th/8th/12th/dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-pricing-summary", licenseClass: "project_summary", mode: "summary" },
    "36-marketing-acquisition-campaign-funnel-specificity.md": { title: "Jyotish marketing/acquisition/campaign/funnel specificity pack · 3rd/10th/D10/11th/7th/2nd/6th/8th/12th-dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-marketing-summary", licenseClass: "project_summary", mode: "summary" },
    "37-service-support-operations-fulfillment-specificity.md": { title: "Jyotish service/support/operations/fulfillment specificity pack · 3rd/7th/10th/D10/6th/2nd/8th/12th-dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-service-summary", licenseClass: "project_summary", mode: "summary" },
    "38-technology-product-platform-ai-specificity.md": { title: "Jyotish technology/product/platform/AI/software specificity pack · 3rd/10th/D10/6th/7th/11th/4th/12th/2nd/8th-Rahu dasha evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-tech-product-summary", licenseClass: "project_summary", mode: "summary" },
    "39-career-industry-market-fit-specificity.md": { title: "Jyotish career/industry/market/role-fit specificity pack · Lagna/Moon/10th-D10/2nd/3rd/6th/7th/11th/4th/12th fit evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-industry-fit-summary", licenseClass: "project_summary", mode: "summary" },
	    "40-customer-audience-persona-fit-specificity.md": { title: "Jyotish customer/audience/persona-fit specificity pack · 7th/11th/3rd/10th-D10/2nd/6th/12th buyer evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-customer-persona-summary", licenseClass: "project_summary", mode: "summary" },
	    "41-product-service-offer-fit-specificity.md": { title: "Jyotish product/service/offer-fit specificity pack · Lagna/Moon/10th-D10/2nd/11th/3rd/5th/7th/6th/8th/12th offer evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-product-offer-summary", licenseClass: "project_summary", mode: "summary" },
	    "42-delivery-model-capacity-specificity.md": { title: "Jyotish delivery-model/capacity specificity pack · Lagna/Moon/10th-D10/3rd/7th/11th/2nd/4th/6th/8th/12th delivery evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-delivery-model-summary", licenseClass: "project_summary", mode: "summary" },
	    "43-premium-low-ticket-value-ladder-specificity.md": { title: "Jyotish premium/low-ticket/value-ladder specificity pack · Lagna/Moon/10th-D10/2nd/3rd/5th/7th/11th/6th/8th/12th tier evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-value-ladder-summary", licenseClass: "project_summary", mode: "summary" },
	    "44-guarantee-scope-boundary-specificity.md": { title: "Jyotish guarantee/scope-boundary/refund-proof specificity pack · Lagna/Moon/10th-D10/3rd/7th/11th/2nd/8th/6th/12th promise evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-scope-boundary-summary", licenseClass: "project_summary", mode: "summary" },
	    "45-sales-page-webinar-consult-script-specificity.md": { title: "Jyotish sales-page/webinar/consult-script specificity pack · Lagna/Moon/3rd/2nd/10th-D10/7th/11th/5th/9th/6th/8th/12th sales-message evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-sales-script-summary", licenseClass: "project_summary", mode: "summary" },
	    "46-onboarding-qualification-form-specificity.md": { title: "Jyotish onboarding/qualification/intake gate specificity pack · Lagna/Moon/3rd/2nd/9th/10th-D10/7th/11th/6th/8th/12th screening evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-qualification-gate-summary", licenseClass: "project_summary", mode: "summary" },
	    "47-case-study-testimonial-proof-library-specificity.md": { title: "Jyotish case-study/testimonial/proof-library specificity pack · Lagna/Moon/10th-D10/3rd/2nd/9th/7th/11th/6th/8th/12th proof evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-proof-library-summary", licenseClass: "project_summary", mode: "summary" },
		    "48-customer-success-renewal-playbook-specificity.md": { title: "Jyotish customer-success/renewal-playbook specificity pack · Lagna/Moon/10th-D10/3rd/2nd/9th/7th/11th/6th/8th/12th success-renewal evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-customer-success-summary", licenseClass: "project_summary", mode: "summary" },
		    "49-partnership-affiliate-referral-program-specificity.md": { title: "Jyotish partnership/affiliate/referral-program specificity pack · Lagna/Moon/10th-D10/3rd/2nd/9th/7th/11th/6th/8th/12th partner-channel evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-partnership-affiliate-summary", licenseClass: "project_summary", mode: "summary" },
		    "50-hiring-delegation-org-design-specificity.md": { title: "Jyotish hiring/delegation/org-design specificity pack · Lagna/Moon/10th-D10/3rd/2nd/9th/6th/7th/11th/8th/12th role-team evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-hiring-delegation-summary", licenseClass: "project_summary", mode: "summary" },
		    "51-team-compensation-incentive-performance-specificity.md": { title: "Jyotish team compensation/incentive/performance specificity pack · Lagna/Moon/10th-D10/2nd/11th/3rd/6th/7th/8th/12th pay-KPI evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-team-compensation-summary", licenseClass: "project_summary", mode: "summary" },
			    "52-partner-due-diligence-conflict-termination-specificity.md": { title: "Jyotish partner due-diligence/conflict/termination specificity pack · Lagna/Moon/7th/10th-D10/2nd/11th/8th/4th/3rd/9th/6th/12th partner-risk evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-partner-risk-summary", licenseClass: "project_summary", mode: "summary" },
			    "53-sales-team-pipeline-qa-followup-specificity.md": { title: "Jyotish sales-team/pipeline/QA/follow-up specificity pack · Lagna/Moon/10th-D10/3rd/2nd/7th/6th/11th/8th/12th sales-ops evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-sales-team-qa-summary", licenseClass: "project_summary", mode: "summary" },
			    "54-cashflow-runway-budget-cost-control-specificity.md": { title: "Jyotish cashflow/runway/budget/cost-control specificity pack · Lagna/Moon/2nd/11th/4th/10th-D10/3rd/Mercury/7th/6th/8th/12th cash discipline evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-cashflow-budget-summary", licenseClass: "project_summary", mode: "summary" },
				    "55-unit-economics-profit-breakeven-payback-specificity.md": { title: "Jyotish unit-economics/profit-margin/break-even/payback specificity pack · Lagna/Moon/2nd/11th/10th-D10/4th/3rd/Mercury/7th/6th/8th/12th margin evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-unit-economics-summary", licenseClass: "project_summary", mode: "summary" },
				    "56-inventory-procurement-supplier-stock-specificity.md": { title: "Jyotish inventory/procurement/supplier/stock specificity pack · Lagna/Moon/4th/2nd/11th/10th-D10/3rd/Mercury/7th/6th/9th/12th stock-flow evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-inventory-procurement-summary", licenseClass: "project_summary", mode: "summary" },
					    "57-tax-accounting-bookkeeping-compliance-specificity.md": { title: "Jyotish tax/accounting/bookkeeping/compliance specificity pack · Lagna/Moon/3rd-Mercury/10th-D10/2nd-11th/4th/7th/6th/8th/9th/12th tax-record evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-tax-accounting-summary", licenseClass: "project_summary", mode: "summary" },
					    "58-loan-credit-debt-refinance-specificity.md": { title: "Jyotish loan/credit/debt/refinance specificity pack · Lagna-Moon/2nd-11th/6th/8th/4th/7th/3rd-Mercury/10th-D10/12th debt-service evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-loan-credit-debt-summary", licenseClass: "project_summary", mode: "summary" },
					    "59-insurance-claim-policy-coverage-specificity.md": { title: "Jyotish insurance/claim/policy/coverage specificity pack · Lagna-Moon/2nd-11th/8th/4th/7th/3rd-Mercury/6th/10th-D10/12th insurance evidence weighting", sourceUrl: "local:private/restricted-sources/vedic/public-domain+licensed-derived-insurance-claim-summary", licenseClass: "project_summary", mode: "summary" },
			    "vedic-core.md": { title: "Vedic core working summary", sourceUrl: "local:vedic-core-summary", licenseClass: "summary_only", mode: "summary" },
  },
  ziwei: {
    "00-method.md": { title: "Zi Wei method guard · 紫微斗數全書 summary", sourceUrl: "local:ziwei-method", licenseClass: "project_summary", mode: "summary" },
    "01-source-policy.md": { title: "Zi Wei source authority · 紫微斗數全書 + 續道藏 + 飛星紫微斗數原旨 + 紫微斗數方書 scan witness policy", sourceUrl: "https://zh.wikisource.org/zh-hant/紫微斗數全書 ; https://zh.wikisource.org/zh-hant/紫微斗數 ; https://ctext.org/wiki.pl?if=gb&res=979714 ; https://github.com/kanripo/KR5h0055 ; https://archive.org/details/20260506_20260506_1217 ; https://commons.wikimedia.org/wiki/File:NLC416-12jh004539-48693_%E8%8F%AF%E5%B1%B1%E9%99%B3%E5%B8%8C%E5%A4%B7%E5%85%88%E7%94%9F%E9%A3%9B%E6%98%9F%E7%B4%AB%E5%BE%AE%E6%96%97%E6%95%B8%E5%8E%9F%E6%97%A8.pdf ; https://commons.wikimedia.org/wiki/File:CNTS-00047996572_%E7%B4%AB%E5%BE%AE%E6%96%97%E6%95%B8%E6%96%B9%E6%9B%B8.pdf", licenseClass: "project_summary", mode: "summary" },
    "02-daozang-ziwei-notes.md": { title: "續道藏《紫微斗數》三卷 · ctext working notes", sourceUrl: "https://ctext.org/wiki.pl?if=gb&res=979714 ; https://ctext.org/library.pl?if=gb&res=85160", licenseClass: "project_summary", mode: "summary" },
    "03-feixing-cetian-private-rules.md": { title: "Private 飛星策天紫微斗數全集 extracted rule pack", sourceUrl: "local:restricted-kyujanggak-GI40495_00", licenseClass: "summary_only", mode: "summary" },
    "04-feixing-cetian-topic-rules.md": { title: "Licensed 飛星策天 topical reading pack", sourceUrl: "local:restricted-kyujanggak-GI40495_00", licenseClass: "summary_only", mode: "summary" },
    "05-main-star-topic-matrix.md": { title: "Zi Wei 14 main stars topic matrix", sourceUrl: "local:licensed-derived-topic-matrix", licenseClass: "summary_only", mode: "summary" },
    "06-liuyue-liuri-sihua-rules.md": { title: "Zi Wei 流月/流日/四化飛星 operational pack", sourceUrl: "local:restricted-ziwei-derived-timing-pack", licenseClass: "summary_only", mode: "summary" },
    "07-modern-licensed-collation-rules.md": { title: "Zi Wei modern licensed collation pack · 南北山人/大德山人/顧祥弘/潘子漁/梁湘潤 OCR-derived rules", sourceUrl: "local:private/restricted-sources/ziwei/incoming", licenseClass: "summary_only", mode: "summary" },
    "08-quanshu-limit-special-rules.md": { title: "Zi Wei Quanshu 大限/二限/太歲 special judgment pack", sourceUrl: "https://zh.wikisource.org/zh-hant/紫微斗數全書 ; local:public-domain-quanshu-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "09-evidence-gates-topic-router.md": { title: "Zi Wei evidence gates and topic router · natal/topic/timing/pair/no-time", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "10-palace-sihua-specificity.md": { title: "Zi Wei palace/sihua/timing specificity pack · palace-topic/三方四正/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "11-pair-relationship-specificity.md": { title: "Zi Wei pair and relationship specificity pack · 夫妻/命宮/crossSiHua/timing evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-relationship-summary", licenseClass: "project_summary", mode: "summary" },
    "12-career-wealth-health-specificity.md": { title: "Zi Wei career/wealth/health specificity pack · 官祿/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-topic-summary", licenseClass: "project_summary", mode: "summary" },
    "13-natal-life-direction-specificity.md": { title: "Zi Wei natal life-direction specificity pack · 命宮/身宮/三方四正/四化/大限 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-natal-summary", licenseClass: "project_summary", mode: "summary" },
    "14-home-family-travel-study-specificity.md": { title: "Zi Wei home/family/children/travel/study specificity pack · 田宅/子女/父母/兄弟/遷移 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-life-field-summary", licenseClass: "project_summary", mode: "summary" },
    "15-people-network-collaboration-specificity.md": { title: "Zi Wei people/network/collaboration specificity pack · 兄弟/僕役/夫妻/父母/官祿 role evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-people-summary", licenseClass: "project_summary", mode: "summary" },
    "16-risk-dispute-hidden-pressure-specificity.md": { title: "Zi Wei risk/dispute/debt/hidden-pressure specificity pack · 疾厄/官祿/財帛/田宅/夫妻/僕役/父母 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-risk-summary", licenseClass: "project_summary", mode: "summary" },
    "17-fortune-fame-inner-life-specificity.md": { title: "Zi Wei fortune/fame/inner-life specificity pack · 福德/官祿/遷移/父母/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-fortune-summary", licenseClass: "project_summary", mode: "summary" },
    "18-temperament-talent-appearance-specificity.md": { title: "Zi Wei temperament/talent/appearance specificity pack · 命宮/身宮/三方四正/四化/星曜 style evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-talent-summary", licenseClass: "project_summary", mode: "summary" },
    "19-timing-forecast-specificity.md": { title: "Zi Wei timing/forecast specificity pack · 大限/流年/流月/流日/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-timing-summary", licenseClass: "project_summary", mode: "summary" },
    "20-decision-action-guidance-specificity.md": { title: "Zi Wei decision/action guidance specificity pack · go-wait-choice palace/sihua evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-decision-summary", licenseClass: "project_summary", mode: "summary" },
    "21-remedy-mitigation-specificity.md": { title: "Zi Wei remedy/mitigation specificity pack · palace/sihua/support/blocker risk-reduction evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-remedy-summary", licenseClass: "project_summary", mode: "summary" },
    "22-validation-past-event-specificity.md": { title: "Zi Wei validation/past-event specificity pack · falsifiable palace/sihua/timing markers", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-validation-summary", licenseClass: "project_summary", mode: "summary" },
    "23-star-sihua-interaction-specificity.md": { title: "Zi Wei star/sihua interaction specificity pack · palace-sanfang-sihua contact judgment", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-interaction-summary", licenseClass: "project_summary", mode: "summary" },
    "24-specialty-scope-electional-guard.md": { title: "Zi Wei specialty scope and electional guard · date-choice/horary/medical/mundane availability", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-specialty-summary", licenseClass: "project_summary", mode: "summary" },
    "25-business-investment-contract-specificity.md": { title: "Zi Wei business/investment/contract specificity pack · 官祿/財帛/田宅/夫妻/僕役/父母/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-business-summary", licenseClass: "project_summary", mode: "summary" },
    "26-authority-document-legal-specificity.md": { title: "Zi Wei authority/document/legal/approval specificity pack · 父母/官祿/夫妻/財帛/田宅/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-authority-summary", licenseClass: "project_summary", mode: "summary" },
    "27-employment-job-offer-specificity.md": { title: "Zi Wei employment/job-offer/interview/promotion/salary specificity pack · 官祿/財帛/父母/兄弟/夫妻/僕役/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-employment-summary", licenseClass: "project_summary", mode: "summary" },
    "28-property-vehicle-relocation-specificity.md": { title: "Zi Wei property/vehicle/residence/relocation specificity pack · 田宅/財帛/父母/夫妻/僕役/遷移/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-property-summary", licenseClass: "project_summary", mode: "summary" },
    "29-health-surgery-recovery-specificity.md": { title: "Zi Wei health/surgery/accident/stress/recovery specificity pack · 疾厄/福德/命身/父母/遷移/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-health-summary", licenseClass: "project_summary", mode: "summary" },
    "30-education-exam-writing-specificity.md": { title: "Zi Wei education/exam/certification/writing specificity pack · 父母/兄弟/官祿/福德/財帛/遷移/文昌文曲化科 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-education-summary", licenseClass: "project_summary", mode: "summary" },
    "31-children-pregnancy-creativity-specificity.md": { title: "Zi Wei children/pregnancy/fertility/creative-output specificity pack · 子女/夫妻/福德/疾厄/田宅/財帛/官祿/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-children-summary", licenseClass: "project_summary", mode: "summary" },
    "32-travel-foreign-relocation-specificity.md": { title: "Zi Wei travel/foreign/relocation/outside-opportunity specificity pack · 遷移/田宅/官祿/財帛/父母/僕役/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-travel-summary", licenseClass: "project_summary", mode: "summary" },
    "33-relationship-status-marriage-breakup-specificity.md": { title: "Zi Wei relationship status/marriage/breakup/reconciliation specificity pack · 夫妻/福德/田宅/父母/四化/timing evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-relationship-status-summary", licenseClass: "project_summary", mode: "summary" },
    "34-windfall-speculation-cash-leak-specificity.md": { title: "Zi Wei windfall/speculation/cash-leak specificity pack · 財帛/福德/田宅/官祿/疾厄/四化 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-windfall-summary", licenseClass: "project_summary", mode: "summary" },
    "35-creator-audience-sales-conversion-specificity.md": { title: "Zi Wei creator/audience/customer-conversion specificity pack · 兄弟/子女/官祿/僕役/福德/夫妻/財帛 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-creator-summary", licenseClass: "project_summary", mode: "summary" },
    "36-reputation-public-trust-crisis-specificity.md": { title: "Zi Wei reputation/public-trust/review/crisis specificity pack · 命身/官祿/父母/兄弟/僕役/福德/夫妻/財帛 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-reputation-summary", licenseClass: "project_summary", mode: "summary" },
    "37-retention-refund-subscription-churn-specificity.md": { title: "Zi Wei retention/refund/subscription/churn specificity pack · 夫妻/財帛/田宅/兄弟/僕役/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-retention-summary", licenseClass: "project_summary", mode: "summary" },
    "38-pricing-offer-promotion-upsell-specificity.md": { title: "Zi Wei pricing/offer/promotion/upsell specificity pack · 官祿/財帛/田宅/夫妻/兄弟/僕役/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-pricing-summary", licenseClass: "project_summary", mode: "summary" },
    "39-marketing-acquisition-campaign-funnel-specificity.md": { title: "Zi Wei marketing/acquisition/campaign/funnel specificity pack · 兄弟/遷移/僕役/夫妻/官祿/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-marketing-summary", licenseClass: "project_summary", mode: "summary" },
    "40-service-support-operations-fulfillment-specificity.md": { title: "Zi Wei service/support/operations/fulfillment specificity pack · 兄弟/夫妻/官祿/僕役/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-service-summary", licenseClass: "project_summary", mode: "summary" },
    "41-technology-product-platform-ai-specificity.md": { title: "Zi Wei technology/product/platform/AI/software specificity pack · 命身/兄弟/官祿/僕役/夫妻/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-tech-product-summary", licenseClass: "project_summary", mode: "summary" },
    "42-career-industry-market-fit-specificity.md": { title: "Zi Wei career/industry/market/role-fit specificity pack · 命身/官祿/財帛/田宅/兄弟/僕役/夫妻/遷移/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-industry-fit-summary", licenseClass: "project_summary", mode: "summary" },
	    "43-customer-audience-persona-fit-specificity.md": { title: "Zi Wei customer/audience/persona-fit specificity pack · 命身/夫妻/僕役/兄弟/遷移/父母/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-customer-persona-summary", licenseClass: "project_summary", mode: "summary" },
	    "44-product-service-offer-fit-specificity.md": { title: "Zi Wei product/service/offer-fit specificity pack · 命身/官祿/財帛/田宅/兄弟/子女/夫妻/僕役/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-product-offer-summary", licenseClass: "project_summary", mode: "summary" },
	    "45-delivery-model-capacity-specificity.md": { title: "Zi Wei delivery-model/capacity specificity pack · 命身/官祿/兄弟/子女/夫妻/僕役/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-delivery-model-summary", licenseClass: "project_summary", mode: "summary" },
	    "46-premium-low-ticket-value-ladder-specificity.md": { title: "Zi Wei premium/low-ticket/value-ladder specificity pack · 命身/官祿/財帛/田宅/兄弟/子女/夫妻/僕役/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-value-ladder-summary", licenseClass: "project_summary", mode: "summary" },
	    "47-guarantee-scope-boundary-specificity.md": { title: "Zi Wei guarantee/scope-boundary/refund-proof specificity pack · 命身/官祿/父母/兄弟/夫妻/僕役/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-scope-boundary-summary", licenseClass: "project_summary", mode: "summary" },
	    "48-sales-page-webinar-consult-script-specificity.md": { title: "Zi Wei sales-page/webinar/consult-script specificity pack · 命身/兄弟/父母/官祿/遷移/夫妻/僕役/財帛/田宅/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-sales-script-summary", licenseClass: "project_summary", mode: "summary" },
	    "49-onboarding-qualification-form-specificity.md": { title: "Zi Wei onboarding/qualification/intake gate specificity pack · 命身/兄弟/父母/官祿/夫妻/僕役/財帛/田宅/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-qualification-gate-summary", licenseClass: "project_summary", mode: "summary" },
	    "50-case-study-testimonial-proof-library-specificity.md": { title: "Zi Wei case-study/testimonial/proof-library specificity pack · 命身/官祿/父母/兄弟/夫妻/僕役/財帛/田宅/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-proof-library-summary", licenseClass: "project_summary", mode: "summary" },
		    "51-customer-success-renewal-playbook-specificity.md": { title: "Zi Wei customer-success/renewal-playbook specificity pack · 命身/官祿/兄弟/父母/夫妻/僕役/財帛/田宅/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-customer-success-summary", licenseClass: "project_summary", mode: "summary" },
		    "52-partnership-affiliate-referral-program-specificity.md": { title: "Zi Wei partnership/affiliate/referral-program specificity pack · 命身/官祿/兄弟/父母/夫妻/僕役/財帛/田宅/福德/疾厄 partner-channel evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-partnership-affiliate-summary", licenseClass: "project_summary", mode: "summary" },
		    "53-hiring-delegation-org-design-specificity.md": { title: "Zi Wei hiring/delegation/org-design specificity pack · 命身/官祿/兄弟/父母/僕役/夫妻/財帛/田宅/福德/疾厄 team-role evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-hiring-delegation-summary", licenseClass: "project_summary", mode: "summary" },
			    "54-team-compensation-incentive-performance-specificity.md": { title: "Zi Wei team compensation/incentive/performance specificity pack · 命身/官祿/財帛/田宅/兄弟/父母/僕役/夫妻/福德/疾厄 pay-KPI evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-team-compensation-summary", licenseClass: "project_summary", mode: "summary" },
				    "55-partner-due-diligence-conflict-termination-specificity.md": { title: "Zi Wei partner due-diligence/conflict/termination specificity pack · 命身/夫妻/官祿/財帛/田宅/父母/兄弟/僕役/福德/疾厄 partner-risk evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-partner-risk-summary", licenseClass: "project_summary", mode: "summary" },
				    "56-sales-team-pipeline-qa-followup-specificity.md": { title: "Zi Wei sales-team/pipeline/QA/follow-up specificity pack · 命身/官祿/兄弟/父母/夫妻/僕役/財帛/田宅/福德/疾厄 sales-ops evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-sales-team-qa-summary", licenseClass: "project_summary", mode: "summary" },
				    "57-cashflow-runway-budget-cost-control-specificity.md": { title: "Zi Wei cashflow/runway/budget/cost-control specificity pack · 命身/財帛/田宅/官祿/兄弟/父母/夫妻/僕役/福德/疾厄 cash discipline evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-cashflow-budget-summary", licenseClass: "project_summary", mode: "summary" },
					    "58-unit-economics-profit-breakeven-payback-specificity.md": { title: "Zi Wei unit-economics/profit-margin/break-even/payback specificity pack · 命身/財帛/官祿/田宅/兄弟/父母/夫妻/僕役/疾厄/四化 margin evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-unit-economics-summary", licenseClass: "project_summary", mode: "summary" },
					    "59-inventory-procurement-supplier-stock-specificity.md": { title: "Zi Wei inventory/procurement/supplier/stock specificity pack · 命身/田宅/財帛/官祿/兄弟/父母/夫妻/僕役/遷移/疾厄 stock-flow evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-inventory-procurement-summary", licenseClass: "project_summary", mode: "summary" },
						    "60-tax-accounting-bookkeeping-compliance-specificity.md": { title: "Zi Wei tax/accounting/bookkeeping/compliance specificity pack · 命身/兄弟/父母/官祿/財帛/田宅/夫妻/僕役/疾厄/四化 tax-record evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-tax-accounting-summary", licenseClass: "project_summary", mode: "summary" },
						    "61-loan-credit-debt-refinance-specificity.md": { title: "Zi Wei loan/credit/debt/refinance specificity pack · 命身/財帛/田宅/官祿/夫妻/兄弟父母/僕役/疾厄/四化 debt-service evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-loan-credit-debt-summary", licenseClass: "project_summary", mode: "summary" },
						    "62-insurance-claim-policy-coverage-specificity.md": { title: "Zi Wei insurance/claim/policy/coverage specificity pack · 命身/財帛/田宅/官祿/夫妻/兄弟父母/僕役/疾厄/四化 insurance evidence weighting", sourceUrl: "local:private/restricted-sources/ziwei/public-domain+licensed-derived-insurance-claim-summary", licenseClass: "project_summary", mode: "summary" },
				    "ziwei-quanshu-core.md": { title: "紫微斗數全書 core working summary", sourceUrl: "https://zh.wikisource.org/zh-hant/紫微斗數全書", licenseClass: "public_domain", mode: "verbatim" },
    "07-quanshu-xingyuan-wenda.md": { title: "紫微斗數全書卷一 · 星垣論+諸星問答論+十二宮諸星得地合格訣/失陷破格訣 verbatim", sourceUrl: "https://zh.wikisource.org/wiki/紫微斗數全書/卷一", licenseClass: "public_domain", mode: "verbatim" },
  },
  qizheng: {
    "00-method.md": { title: "Qizheng method guard · 果老星宗 summary", sourceUrl: "local:qizheng-method", licenseClass: "project_summary", mode: "summary" },
    "01-enyong-12gong.md": { title: "Qizheng 恩用仇難 and 12 houses", sourceUrl: "https://archive.org/details/guolaoxingzong", licenseClass: "project_summary", mode: "summary" },
    "02-miaowang.md": { title: "Qizheng 廟旺落陷", sourceUrl: "https://zh.wikisource.org/wiki/欽定古今圖書集成/博物彙編/藝術典/第581卷", licenseClass: "project_summary", mode: "summary" },
    "03-geju.md": { title: "Qizheng 格局", sourceUrl: "https://zh.wikisource.org/wiki/欽定古今圖書集成/博物彙編/藝術典/第572卷", licenseClass: "project_summary", mode: "summary" },
    "04-xingqing.md": { title: "Qizheng 星情喜忌", sourceUrl: "https://zh.wikisource.org/wiki/欽定古今圖書集成/博物彙編/藝術典/第577卷", licenseClass: "project_summary", mode: "summary" },
    "05-xingxian.md": { title: "Qizheng 行限/限度主 guard", sourceUrl: "https://zh.wikisource.org/wiki/欽定古今圖書集成/博物彙編/藝術典/第582卷", licenseClass: "project_summary", mode: "summary" },
    "25-shigan-huayao.md": { title: "Qizheng 十干化曜 (變曜·天祿…天權·科名/科甲/文星) · 張果星宗二 verbatim", sourceUrl: "https://zh.wikisource.org/wiki/欽定古今圖書集成/博物彙編/藝術典/第568卷", licenseClass: "public_domain", mode: "verbatim" },
    "26-xingqing-verbatim-clean.md": { title: "Qizheng 星情 總論+歌斷〈源髓歌〉 ครบ 11 曜 · 張果星宗十二/十四/十五 verbatim", sourceUrl: "https://zh.wikisource.org/wiki/欽定古今圖書集成/博物彙編/藝術典/第578卷 ; /第580卷 ; /第581卷", licenseClass: "public_domain", mode: "verbatim" },
    "06-public-domain-source-coverage.md": { title: "Qizheng public-domain OCR source coverage · 果老星宗 / 星學大成 primary+15 alternate / 星平會海 / 星命溯源 / 五星三命 / 星位宿度 / 唐開元占經 / 乙巳占 / 觀象玩占 / 乾象通鑑 / 靈臺秘苑 / 七政推步 / 天文大成 / 歷象考成 / 儀象考成 / 協紀辨方", sourceUrl: "local:private/restricted-sources/qizheng/public-domain", licenseClass: "project_summary", mode: "summary" },
    "07-sanfang-pair-weighting.md": { title: "Qizheng 三方對照 / 格局 / pair weighting pack", sourceUrl: "local:private/restricted-sources/qizheng/public-domain", licenseClass: "project_summary", mode: "summary" },
    "08-topic-evidence-gates.md": { title: "Qizheng topic evidence gates · 官祿/財帛/妻妾/疾厄/遷移/田宅 with timing and star-nature guards", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "09-star-nature-operational-summary.md": { title: "Qizheng star nature operational summary · 七政四餘五行/行度/順逆 meaning guard", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "10-degree-limit-specificity.md": { title: "Qizheng degree lord/body lord/limit specificity pack · 命度/度主/身主/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-summary", licenseClass: "project_summary", mode: "summary" },
    "11-pair-relationship-specificity.md": { title: "Qizheng pair and relationship specificity pack · 妻妾/命主/度主/身主/恩用仇難/timing evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-relationship-summary", licenseClass: "project_summary", mode: "summary" },
    "12-career-wealth-health-specificity.md": { title: "Qizheng career/wealth/health specificity pack · 官祿/財帛/田宅/疾厄/命度/身主/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-topic-summary", licenseClass: "project_summary", mode: "summary" },
    "13-natal-life-direction-specificity.md": { title: "Qizheng natal life-direction specificity pack · 命主/命度/身主/恩用仇難/格局/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-natal-summary", licenseClass: "project_summary", mode: "summary" },
    "14-home-family-travel-study-specificity.md": { title: "Qizheng home/family/children/travel/study specificity pack · 田宅/男女/兄弟/遷移/福德 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-life-field-summary", licenseClass: "project_summary", mode: "summary" },
    "15-people-network-collaboration-specificity.md": { title: "Qizheng people/network/collaboration specificity pack · 兄弟/奴僕/官祿/妻妾/福德 role evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-people-summary", licenseClass: "project_summary", mode: "summary" },
    "16-risk-dispute-hidden-pressure-specificity.md": { title: "Qizheng risk/dispute/debt/hidden-pressure specificity pack · 疾厄/官祿/財帛/田宅/妻妾/兄弟/奴僕 risk evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-risk-summary", licenseClass: "project_summary", mode: "summary" },
    "17-fortune-fame-inner-life-specificity.md": { title: "Qizheng fortune/fame/inner-life specificity pack · 福德/官祿/相貌/遷移/命度 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-fortune-summary", licenseClass: "project_summary", mode: "summary" },
    "18-temperament-talent-appearance-specificity.md": { title: "Qizheng temperament/talent/appearance specificity pack · 命宮/命主/命度/身主/相貌 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-talent-summary", licenseClass: "project_summary", mode: "summary" },
    "19-timing-forecast-specificity.md": { title: "Qizheng timing/forecast specificity pack · 行限/限度主/洞微百六限/target-year 木土 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-timing-summary", licenseClass: "project_summary", mode: "summary" },
    "20-decision-action-guidance-specificity.md": { title: "Qizheng decision/action guidance specificity pack · go-wait-choice palace/limit evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-decision-summary", licenseClass: "project_summary", mode: "summary" },
    "21-remedy-mitigation-specificity.md": { title: "Qizheng remedy/mitigation specificity pack · palace/恩用仇難/limit risk-reduction evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-remedy-summary", licenseClass: "project_summary", mode: "summary" },
    "22-validation-past-event-specificity.md": { title: "Qizheng validation/past-event specificity pack · falsifiable palace/三主/limit markers", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-validation-summary", licenseClass: "project_summary", mode: "summary" },
    "23-star-interaction-specificity.md": { title: "Qizheng star interaction specificity pack · star-role/palace/sanfang/en-yong contact judgment", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-interaction-summary", licenseClass: "project_summary", mode: "summary" },
    "24-specialty-scope-electional-guard.md": { title: "Qizheng specialty scope and electional guard · date-choice/horary/medical/mundane availability", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-specialty-summary", licenseClass: "project_summary", mode: "summary" },
    "25-business-investment-contract-specificity.md": { title: "Qizheng business/investment/contract specificity pack · 官祿/財帛/田宅/妻妾/兄弟/奴僕/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-business-summary", licenseClass: "project_summary", mode: "summary" },
    "26-authority-document-legal-specificity.md": { title: "Qizheng authority/document/legal/approval specificity pack · 官祿/兄弟/妻妾/財帛/田宅/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-authority-summary", licenseClass: "project_summary", mode: "summary" },
    "27-employment-job-offer-specificity.md": { title: "Qizheng employment/job-offer/interview/promotion/salary specificity pack · 官祿/財帛/兄弟/妻妾/奴僕/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-employment-summary", licenseClass: "project_summary", mode: "summary" },
    "28-property-vehicle-relocation-specificity.md": { title: "Qizheng property/vehicle/residence/relocation specificity pack · 田宅/財帛/官祿/兄弟/妻妾/遷移/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-property-summary", licenseClass: "project_summary", mode: "summary" },
    "29-health-surgery-recovery-specificity.md": { title: "Qizheng health/surgery/accident/stress/recovery specificity pack · 疾厄/福德/身主/官祿/遷移/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-health-summary", licenseClass: "project_summary", mode: "summary" },
    "30-education-exam-writing-specificity.md": { title: "Qizheng education/exam/certification/writing specificity pack · 兄弟/官祿/福德/財帛/田宅/遷移/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-education-summary", licenseClass: "project_summary", mode: "summary" },
    "31-children-pregnancy-creativity-specificity.md": { title: "Qizheng children/pregnancy/fertility/creative-output specificity pack · 男女/福德/妻妾/疾厄/財帛/田宅/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-children-summary", licenseClass: "project_summary", mode: "summary" },
    "32-travel-foreign-relocation-specificity.md": { title: "Qizheng travel/foreign/relocation/outside-opportunity specificity pack · 遷移/田宅/官祿/財帛/兄弟/妻妾/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-travel-summary", licenseClass: "project_summary", mode: "summary" },
    "33-relationship-status-marriage-breakup-specificity.md": { title: "Qizheng relationship status/marriage/breakup/reconciliation specificity pack · 妻妾/福德/兄弟/男女/恩用仇難/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-relationship-status-summary", licenseClass: "project_summary", mode: "summary" },
    "34-windfall-speculation-cash-leak-specificity.md": { title: "Qizheng windfall/speculation/cash-leak specificity pack · 財帛/田宅/福德/官祿/疾厄/恩用仇難/行限 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-windfall-summary", licenseClass: "project_summary", mode: "summary" },
    "35-creator-audience-sales-conversion-specificity.md": { title: "Qizheng creator/audience/customer-conversion specificity pack · 兄弟/相貌/官祿/奴僕/福德/妻妾/財帛 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-creator-summary", licenseClass: "project_summary", mode: "summary" },
    "36-reputation-public-trust-crisis-specificity.md": { title: "Qizheng reputation/public-trust/review/crisis specificity pack · 三主/相貌/官祿/兄弟/奴僕/福德/妻妾/財帛 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-reputation-summary", licenseClass: "project_summary", mode: "summary" },
    "37-retention-refund-subscription-churn-specificity.md": { title: "Qizheng retention/refund/subscription/churn specificity pack · 三主/妻妾/財帛/田宅/兄弟/奴僕/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-retention-summary", licenseClass: "project_summary", mode: "summary" },
    "38-pricing-offer-promotion-upsell-specificity.md": { title: "Qizheng pricing/offer/promotion/upsell specificity pack · 三主/官祿/財帛/田宅/妻妾/兄弟/奴僕/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-pricing-summary", licenseClass: "project_summary", mode: "summary" },
    "39-marketing-acquisition-campaign-funnel-specificity.md": { title: "Qizheng marketing/acquisition/campaign/funnel specificity pack · 三主/兄弟/相貌/奴僕/妻妾/官祿/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-marketing-summary", licenseClass: "project_summary", mode: "summary" },
    "40-service-support-operations-fulfillment-specificity.md": { title: "Qizheng service/support/operations/fulfillment specificity pack · 三主/兄弟/妻妾/官祿/奴僕/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-service-summary", licenseClass: "project_summary", mode: "summary" },
    "41-technology-product-platform-ai-specificity.md": { title: "Qizheng technology/product/platform/AI/software specificity pack · 三主/兄弟/官祿/奴僕/妻妾/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-tech-product-summary", licenseClass: "project_summary", mode: "summary" },
    "42-career-industry-market-fit-specificity.md": { title: "Qizheng career/industry/market/role-fit specificity pack · 三主/官祿/財帛/田宅/兄弟/奴僕/妻妾/遷移/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-industry-fit-summary", licenseClass: "project_summary", mode: "summary" },
	    "43-customer-audience-persona-fit-specificity.md": { title: "Qizheng customer/audience/persona-fit specificity pack · 三主/妻妾/奴僕/兄弟/相貌/遷移/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-customer-persona-summary", licenseClass: "project_summary", mode: "summary" },
	    "44-product-service-offer-fit-specificity.md": { title: "Qizheng product/service/offer-fit specificity pack · 三主/官祿/財帛/田宅/兄弟/妻妾/奴僕/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-product-offer-summary", licenseClass: "project_summary", mode: "summary" },
	    "45-delivery-model-capacity-specificity.md": { title: "Qizheng delivery-model/capacity specificity pack · 三主/官祿/兄弟/妻妾/奴僕/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-delivery-model-summary", licenseClass: "project_summary", mode: "summary" },
	    "46-premium-low-ticket-value-ladder-specificity.md": { title: "Qizheng premium/low-ticket/value-ladder specificity pack · 三主/官祿/財帛/田宅/兄弟/妻妾/奴僕/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-value-ladder-summary", licenseClass: "project_summary", mode: "summary" },
	    "47-guarantee-scope-boundary-specificity.md": { title: "Qizheng guarantee/scope-boundary/refund-proof specificity pack · 三主/官祿/父母/兄弟/妻妾/奴僕/財帛/田宅/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-scope-boundary-summary", licenseClass: "project_summary", mode: "summary" },
	    "48-sales-page-webinar-consult-script-specificity.md": { title: "Qizheng sales-page/webinar/consult-script specificity pack · 三主/兄弟/相貌/官祿/妻妾/奴僕/財帛/田宅/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-sales-script-summary", licenseClass: "project_summary", mode: "summary" },
	    "49-onboarding-qualification-form-specificity.md": { title: "Qizheng onboarding/qualification/intake gate specificity pack · 三主/兄弟/官祿/父母/妻妾/奴僕/財帛/田宅/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-qualification-gate-summary", licenseClass: "project_summary", mode: "summary" },
	    "50-case-study-testimonial-proof-library-specificity.md": { title: "Qizheng case-study/testimonial/proof-library specificity pack · 三主/相貌/官祿/兄弟/妻妾/奴僕/財帛/田宅/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-proof-library-summary", licenseClass: "project_summary", mode: "summary" },
		    "51-customer-success-renewal-playbook-specificity.md": { title: "Qizheng customer-success/renewal-playbook specificity pack · 三主/官祿/兄弟/妻妾/奴僕/財帛/田宅/福德/疾厄 evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-customer-success-summary", licenseClass: "project_summary", mode: "summary" },
		    "52-partnership-affiliate-referral-program-specificity.md": { title: "Qizheng partnership/affiliate/referral-program specificity pack · 三主/官祿/兄弟/妻妾/奴僕/財帛/田宅/福德/疾厄 partner-channel evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-partnership-affiliate-summary", licenseClass: "project_summary", mode: "summary" },
		    "53-hiring-delegation-org-design-specificity.md": { title: "Qizheng hiring/delegation/org-design specificity pack · 三主/官祿/兄弟/奴僕/妻妾/財帛/田宅/福德/疾厄 team-role evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-hiring-delegation-summary", licenseClass: "project_summary", mode: "summary" },
			    "54-team-compensation-incentive-performance-specificity.md": { title: "Qizheng team compensation/incentive/performance specificity pack · 三主/官祿/財帛/田宅/兄弟/奴僕/妻妾/福德/疾厄 pay-KPI evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-team-compensation-summary", licenseClass: "project_summary", mode: "summary" },
				    "55-partner-due-diligence-conflict-termination-specificity.md": { title: "Qizheng partner due-diligence/conflict/termination specificity pack · 三主/妻妾/官祿/財帛/田宅/兄弟/奴僕/福德/疾厄 partner-risk evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-partner-risk-summary", licenseClass: "project_summary", mode: "summary" },
				    "56-sales-team-pipeline-qa-followup-specificity.md": { title: "Qizheng sales-team/pipeline/QA/follow-up specificity pack · 三主/官祿/兄弟/妻妾/奴僕/財帛/田宅/福德/疾厄 sales-ops evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-sales-team-qa-summary", licenseClass: "project_summary", mode: "summary" },
				    "57-cashflow-runway-budget-cost-control-specificity.md": { title: "Qizheng cashflow/runway/budget/cost-control specificity pack · 三主/財帛/田宅/官祿/兄弟/妻妾/奴僕/福德/疾厄 cash discipline evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-cashflow-budget-summary", licenseClass: "project_summary", mode: "summary" },
					    "58-unit-economics-profit-breakeven-payback-specificity.md": { title: "Qizheng unit-economics/profit-margin/break-even/payback specificity pack · 三主/財帛/官祿/田宅/兄弟/妻妾/奴僕/疾厄/行限 margin evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-unit-economics-summary", licenseClass: "project_summary", mode: "summary" },
					    "59-inventory-procurement-supplier-stock-specificity.md": { title: "Qizheng inventory/procurement/supplier/stock specificity pack · 三主/田宅/財帛/官祿/兄弟/妻妾/奴僕/遷移/疾厄 stock-flow evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-inventory-procurement-summary", licenseClass: "project_summary", mode: "summary" },
						    "60-tax-accounting-bookkeeping-compliance-specificity.md": { title: "Qizheng tax/accounting/bookkeeping/compliance specificity pack · 三主/兄弟/官祿/財帛/田宅/妻妾/奴僕/疾厄/行限 tax-record evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-tax-accounting-summary", licenseClass: "project_summary", mode: "summary" },
						    "61-loan-credit-debt-refinance-specificity.md": { title: "Qizheng loan/credit/debt/refinance specificity pack · 三主/財帛/田宅/官祿/妻妾/兄弟/奴僕/疾厄/行限 debt-service evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-loan-credit-debt-summary", licenseClass: "project_summary", mode: "summary" },
						    "62-insurance-claim-policy-coverage-specificity.md": { title: "Qizheng insurance/claim/policy/coverage specificity pack · 三主/財帛/田宅/官祿/妻妾/兄弟/奴僕/疾厄/行限 insurance evidence weighting", sourceUrl: "local:private/restricted-sources/qizheng/public-domain-derived-insurance-claim-summary", licenseClass: "project_summary", mode: "summary" },
				  },
};

const CANON_DEFAULT_FILES: Partial<Record<ScienceId, string[]>> = {
  qizheng: [
    "00-method.md",
    "10-degree-limit-specificity.md",
    "11-pair-relationship-specificity.md",
    "08-topic-evidence-gates.md",
    "12-career-wealth-health-specificity.md",
    "13-natal-life-direction-specificity.md",
    "09-star-nature-operational-summary.md",
    "06-public-domain-source-coverage.md",
    "01-enyong-12gong.md",
    "02-miaowang.md",
    "05-xingxian.md",
    "03-geju.md",
    "07-sanfang-pair-weighting.md",
    "04-xingqing.md",
    "25-shigan-huayao.md",
    "26-xingqing-verbatim-clean.md",
  ],
  vedic: [
    "00-method.md",
    "06-evidence-gates-specialty-router.md",
    "07-functional-topic-specificity.md",
    "08-compatibility-specificity.md",
    "09-career-wealth-health-specificity.md",
    "10-natal-life-direction-specificity.md",
    "01-classical-rules.md",
    "04-topic-packs.md",
    "05-dasha-deepening-rules.md",
    "02-bphs-dasha-yoga.md",
    "03-public-domain-source-coverage.md",
  ],
  western: [
    "00-method.md",
    "00a-public-domain-interactions.md",
    "00b-licensed-modern-source-policy.md",
    "00c-licensed-modern-extraction-framework.md",
    "00d-public-domain-expanded-judgment-rules.md",
    "00e-public-domain-modern-bridge-rules.md",
    "00f-public-domain-no-time-predictive-medical-rules.md",
    "00g-public-domain-horary-electional-mundane-classical-rules.md",
    "06-relationship-nativity-specificity.md",
    "03-synastry-timing-notime-weighting.md",
    "04-specialty-router-evidence-gates.md",
    "05-dignity-lots-specificity.md",
    "07-career-money-health-specificity.md",
    "08-natal-life-direction-specificity.md",
  ],
  ziwei: [
    "00-method.md",
    "11-pair-relationship-specificity.md",
    "09-evidence-gates-topic-router.md",
    "10-palace-sihua-specificity.md",
    "12-career-wealth-health-specificity.md",
    "13-natal-life-direction-specificity.md",
    "01-source-policy.md",
    "02-daozang-ziwei-notes.md",
    "03-feixing-cetian-private-rules.md",
    "05-main-star-topic-matrix.md",
    "07-modern-licensed-collation-rules.md",
    "08-quanshu-limit-special-rules.md",
    "04-feixing-cetian-topic-rules.md",
    "06-liuyue-liuri-sihua-rules.md",
    "ziwei-quanshu-core.md",
    "07-quanshu-xingyuan-wenda.md",
  ],
};

type CanonIntent = {
  timing: boolean;
  relationship: boolean;
  money: boolean;
  career: boolean;
  health: boolean;
  travel: boolean;
  home: boolean;
  children: boolean;
  study: boolean;
  education: boolean;
  people: boolean;
  risk: boolean;
  fortune: boolean;
  windfall: boolean;
  creator: boolean;
  reputation: boolean;
  retention: boolean;
  pricing: boolean;
  marketing: boolean;
  supportOps: boolean;
  techProduct: boolean;
  industryFit: boolean;
	  customerFit: boolean;
	  offerFit: boolean;
	  deliveryModel: boolean;
		  valueLadder: boolean;
		  scopeBoundary: boolean;
		  salesScript: boolean;
		  salesTeamQa: boolean;
		  qualificationGate: boolean;
		  caseStudyProof: boolean;
		  customerSuccess: boolean;
		  partnershipProgram: boolean;
		  hiringDelegation: boolean;
			  teamCompensation: boolean;
			  partnerDueDiligence: boolean;
					  cashflowBudget: boolean;
					  unitEconomics: boolean;
					  supplyInventory: boolean;
					  taxAccounting: boolean;
					  loanCreditDebt: boolean;
					  insuranceClaim: boolean;
					  talent: boolean;
  decision: boolean;
  remedy: boolean;
  validation: boolean;
  interaction: boolean;
  business: boolean;
  authority: boolean;
  employment: boolean;
  property: boolean;
  pair: boolean;
  noTime: boolean;
  advancedTiming: boolean;
  horary: boolean;
  electional: boolean;
  mundane: boolean;
  rectification: boolean;
  locality: boolean;
  specialty: boolean;
  westernSpecialty: boolean;
  general: boolean;
};

const CANON_ROUTER_BASE_FILES: Partial<Record<ScienceId, string[]>> = {
  qizheng: ["00-method.md", "10-degree-limit-specificity.md", "08-topic-evidence-gates.md", "09-star-nature-operational-summary.md", "06-public-domain-source-coverage.md", "01-enyong-12gong.md", "02-miaowang.md"],
  ziwei: ["00-method.md", "09-evidence-gates-topic-router.md", "10-palace-sihua-specificity.md", "01-source-policy.md", "02-daozang-ziwei-notes.md", "03-feixing-cetian-private-rules.md", "05-main-star-topic-matrix.md", "07-modern-licensed-collation-rules.md", "08-quanshu-limit-special-rules.md"],
  western: ["00-method.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "01-compact-addenda.md", "00a-public-domain-interactions.md", "00d-public-domain-expanded-judgment-rules.md"],
  vedic: ["00-method.md", "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "01-classical-rules.md", "04-topic-packs.md", "05-dasha-deepening-rules.md"],
};

function canonIntentFromQuestion(question: string, births: BirthData[]): CanonIntent {
  const text = String(question || "").toLowerCase();
  const has = (patterns: RegExp[]) => patterns.some((re) => re.test(text));
  const timing = has([
    /ปี\s*\d{4}|20\d{2}|25\d{2}|26\d{2}|อนาคต|เมื่อไร|เมื่อไหร่|จังหวะ|วัยจร|ปีจร|เดือนจร|วันจร|รายปี|รายเดือน|transit|return|progress|dasha|gochara|vimshottari|timing|forecast|next\s+year|this\s+year|last\s+year/i,
    /流年|大限|流月|流日|行限|限度主|洞微| दशा/i,
  ]);
  const relationship = has([/ดูคู่|ดวงคู่|คู่ครอง|คู่รัก|คู่ชีวิต|เนื้อคู่|คู่แท้|คู่กัน|คู่เรา|ความรัก|รัก|คบ|แต่งงาน|งานแต่ง|ขอแต่ง|แฟน|แฟนเก่า|คนรัก|คนคุย|สถานะ|โสด|รีเทิร์น|คืนดี|เลิก(?!งาน)|หย่า|ชู้|กิ๊ก|สมพงษ์|เข้ากัน|partner|relationship|love|lover|dating|marriage|wedding|spouse|synastry|compatibility|break\s*up|breakup|divorce|reconcile|reconciliation|ex[-\s]?partner|夫妻|合盤|婚|離婚|离婚|復合|复合/i]);
  const money = has([/เงิน|การเงิน|รายได้|ทรัพย์|หนี้|ลงทุน|ธุรกิจ|โชคลาภ|wealth|money|finance|income|財|財帛|祿/i]);
  const career = has([/งาน|อาชีพ|ตำแหน่ง|ชื่อเสียง|เจ้านาย|career|work|job|profession|官祿|事業/i]);
  const health = has([/สุขภาพ|ป่วย|โรค|เจ็บ|เจ็บป่วย|ไม่สบาย|ผ่าตัด|รักษา|พักฟื้น|ฟื้นตัว|โรงพยาบาล|หมอ|ตรวจสุขภาพ|เช็คอัพ|นอนไม่หลับ|นอน|เหนื่อย|ล้า|อ่อนเพลีย|เครียด|พักผ่อน|อุบัติเหตุ|บาดเจ็บ|health|medical|surgery|treatment|hospital|doctor|check[-\s]?up|recovery|recover|fatigue|stress|sleep|accident|injury|chronic|acute|疾厄|病/i]);
  const travel = has([/เดินทาง|ย้าย|ต่างประเทศ|ต่างเมือง|ต่างถิ่น|ต่างแดน|ต่างชาติ|เมืองนอก|ย้ายประเทศ|ย้ายเมือง|ย้ายถิ่น|โยกย้าย|อพยพ|ไปอยู่|ไปทำงานต่าง|ลูกค้าต่างประเทศ|ลูกค้านอกถิ่น|ตลาดต่างประเทศ|travel|relocation|relocate|migration|migrate|foreign|overseas|abroad|distant|outside\s*market|遷移|出行/i]);
  const home = has([/บ้าน|ที่ดิน|ครอบครัว|อสังหา|property|home|family|田宅|宅/i]);
  const loanCreditDebt = has([
    /loan\s*(?:approval|application|repayment|payment|schedule|term|terms|principal|interest|installment|instalment|refinance|restructur|consolidat|default|delinquen|forbearance|modification)?|borrow(?:ing)?|lender|credit\s*(?:approval|application|score|bureau|history|report|rating|risk|card|limit|line|facility|term|terms)|line\s*of\s*credit|debt\s*(?:repayment|payment|service|servicing|restructur|consolidat|settlement|snowball|avalanche|relief|collector|collection|default|delinquen|paydown|pay\s*down)|refinanc(?:e|ing)|interest\s*rate|apr|principal\s*(?:payment|balance)|installment|instalment|monthly\s*payment|collateral|guarantor|co[-\s]?borrower|creditor|debtor|default\s*(?:risk|notice)|delinquen(?:cy|t)|debt[-\s]?to[-\s]?income|dti|dscr/i,
    /กู้เงิน|เงินกู้|ขอกู้|ยื่นกู้|อนุมัติสินเชื่อ|สินเชื่อ|วงเงินกู้|วงเงินเครดิต|เครดิตบูโร|คะแนนเครดิต|บัตรเครดิต|รีไฟแนนซ์|รีไฟแนนซ์หนี้|ปรับโครงสร้างหนี้|รวมหนี้|ปิดหนี้|ชำระหนี้|จ่ายหนี้|ผ่อนหนี้|ค่างวด|งวดผ่อน|ดอกเบี้ย|อัตราดอกเบี้ย|เงินต้น|ยอดหนี้|เจ้าหนี้|ลูกหนี้|ทวงหนี้|ติดตามหนี้|ผิดนัด|ค้างชำระ|ค้ำประกัน|ผู้ค้ำ|หลักประกัน|จำนำ|จำนอง|ภาระหนี้|หนี้บัตร|หนี้นอกระบบ|หนี้ธนาคาร|สัญญากู้/i,
    /貸款|贷款|借款|信貸|信贷|信用卡|信用額度|信用额度|信用評分|信用评分|債務|债务|還款|还款|分期|利息|利率|本金|再融資|再融资|債務重組|债务重组|整合債務|整合债务|抵押|擔保|担保|保證人|保证人|債權人|债权人|債務人|债务人|催收|逾期|違約|违约/i,
  ]);
  const insuranceClaim = has([
    /insurance\s*(?:policy|coverage|claim|premium|deductible|limit|payout|benefit|beneficiary|rider|renewal|lapse|exclusion|appeal|denial|underwriting)?|policy\s*(?:coverage|schedule|wording|exclusion|limit|lapse|renewal|rider)|claim\s*(?:approval|denial|appeal|payout|settlement|evidence|file|form|adjuster)|coverage\s*(?:limit|gap|exclusion)|deductible|indemnity|beneficiary|insured|insurer|underwrit(?:e|ing|er)|adjuster|loss\s*adjuster|insurance\s*broker|insurance\s*agent|pre[-\s]?existing\s*condition|rider|policyholder|co[-\s]?insured/i,
    /ประกันภัย|กรมธรรม์|เคลม|เคลมประกัน|สินไหม|ค่าสินไหม|เงินชดเชย|ค่าชดเชย|ความคุ้มครอง|วงเงินคุ้มครอง|เบี้ยประกัน|ค่าเบี้ยประกัน|เบี้ยรายปี|เบี้ยรายเดือน|ค่าร่วมจ่าย|deductible|ผู้เอาประกัน|ผู้รับผลประโยชน์|บริษัทประกัน|ตัวแทนประกัน|นายหน้าประกัน|เจ้าหน้าที่เคลม|ผู้ประเมินเคลม|ผู้ประเมินความเสียหาย|ใบเคลม|เอกสารเคลม|ปฏิเสธเคลม|อุทธรณ์เคลม|ข้อยกเว้น|เงื่อนไขกรมธรรม์|โรคที่เป็นมาก่อน|ต่ออายุกรมธรรม์|กรมธรรม์ขาด|ยกเลิกประกัน|ซื้อประกัน|เพิ่มความคุ้มครอง|ลด rider|ประกันสุขภาพ|ประกันรถ|ประกันบ้าน|ประกันธุรกิจ/i,
    /保險|保险|保單|保单|理賠|理赔|索賠|索赔|賠付|赔付|保障範圍|保障范围|保費|保费|免賠額|免赔额|受益人|被保險人|被保险人|保險公司|保险公司|核保|除外責任|除外责任|拒賠|拒赔|申訴|申诉|續保|续保|失效|附加險|附加险/i,
  ]);
  const propertyAssetContext = has([/ซื้อบ้าน|ขายบ้าน|เช่าบ้าน|ซื้อคอนโด|ขายคอนโด|เช่าคอนโด|ซื้อที่ดิน|ขายที่ดิน|ที่ดิน|อสังหา|อสังหาริมทรัพย์|บ้านใหม่|ย้ายบ้าน|ย้ายที่อยู่|ปล่อยเช่า|เช่า|รีโนเวท|ซ่อมบ้าน|สร้างบ้าน|คอนโด|อาคาร|ร้านหน้าบ้าน|หน้าร้าน|โกดัง|โรงงาน|รถ|ซื้อรถ|ขายรถ|เปลี่ยนรถ|ซ่อมรถ|ทะเบียนรถ|ผ่อนบ้าน|ผ่อนรถ|กู้บ้าน|สินเชื่อบ้าน|โฉนด|สัญญาเช่า|title\s*deed|deed|real\s*estate|property|\bland\b|house|condo|apartment|rent|lease|renovat|build\s*house|vehicle|car|commute|move\s*home|moving\s*house|relocation|田宅|遷移/i]);
  const property = has([/ซื้อบ้าน|ขายบ้าน|เช่าบ้าน|ซื้อคอนโด|ขายคอนโด|เช่าคอนโด|ซื้อที่ดิน|ขายที่ดิน|ที่ดิน|อสังหา|อสังหาริมทรัพย์|บ้านใหม่|ย้ายบ้าน|ย้ายที่อยู่|ปล่อยเช่า|เช่า|รีโนเวท|ซ่อมบ้าน|สร้างบ้าน|คอนโด|อาคาร|ร้านหน้าบ้าน|หน้าร้าน|โกดัง|โรงงาน|รถ|ซื้อรถ|ขายรถ|เปลี่ยนรถ|ซ่อมรถ|ทะเบียนรถ|ผ่อนบ้าน|ผ่อนรถ|กู้บ้าน|สินเชื่อบ้าน|จำนอง|โฉนด|สัญญาเช่า|mortgage|loan|title\s*deed|deed|real\s*estate|property|\bland\b|house|condo|apartment|rent|lease|renovat|build\s*house|vehicle|car|commute|move\s*home|moving\s*house|relocation|田宅|遷移/i]) && (!loanCreditDebt || propertyAssetContext) && !insuranceClaim;
  const children = has([/ลูก(?!ค้า|น้อง|ทีม|จ้าง)|บุตร|เด็ก|ตั้งครรภ์|มีลูก|มีบุตร|ตั้งท้อง|ท้อง|คลอด|ภาวะเจริญพันธุ์|โปรเจกต์สร้างสรรค์|งานสร้างสรรค์|ผลงานสร้างสรรค์|children|child|kids|pregnancy|pregnant|fertility|fertile|creative\s*project|creative\s*output|side\s*project|子女|男女|嗣/i]);
  const study = has([/เรียน|สอบ|การศึกษา|เอกสาร|มหาวิทยาลัย|ปริญญา|study|education|exam|school|document|paperwork|父母|兄弟|化科|文昌|文曲/i]);
  const education = has([/เรียน|สอบ|การศึกษา|มหาวิทยาลัย|ปริญญา|ใบประกาศ|ใบรับรอง|เกรด|คะแนน|สอบผ่าน|สอบตก|สอบเข้า|สมัครเรียน|สมัครทุน|ทุนเรียน|ทุนการศึกษา|คอร์ส|ติว|ครู|อาจารย์|นักเรียน|นักศึกษา|เขียน|พูด|พรีเซนต์|พรีเซนเทชั่น|คอนเทนต์|หนังสือ|วิทยานิพนธ์|งานวิจัย|พอร์ต|certificate|certification|course|class|tutor|teacher|mentor|student|university|college|degree|admission|scholarship|grade|exam|study|education|school|presentation|present|writing|speaking|content|publication|portfolio|thesis|research|文昌|文曲|化科/i]);
  const people = has([/เพื่อน|มิตร|เครือข่าย|คนรอบตัว|บริวาร|ลูกน้อง|พนักงาน|ทีม|เพื่อนร่วมงาน|หุ้นส่วน|คู่ค้า|ลูกค้า|เจ้านาย|ผู้ใหญ่|หัวหน้า|boss|manager|mentor|elder|friend|ally|network|team|staff|employee|coworker|colleague|client|customer|audience|patron|business\s*partner|supplier|siblings|sibling|兄弟|奴僕|仆役|僕役|朋友|同事|客戶|客户|貴人|贵人|父母/i]);
  const risk = has([/ปัญหา|คดี|ฟ้อง|ศาล|หนี้|ภาษี|มรดก|อุบัติเหตุ|เสียหาย|ศัตรู|คู่แข่ง|ความเสี่ยง|เรื่องลับ|โดนโกง|โดนหลอก|คุก|จับ|ฟ้องร้อง|legal|lawsuit|litigation|court|debt|tax|inheritance|risk|crisis|accident|enemy|enemies|competitor|fraud|loss|hidden|secret|scandal|dispute|prison|fine|penalty|6th|8th|12th|疾厄|官符|白虎|天刑|化忌|空劫|大耗|仇|難|讼|訟|災|灾|厄/i]);
  const fortune = has([/โชค|ดวงดี|เฮง|วาสนา|บุญ|กรรม|ชื่อเสียง|ดัง|ภาพลักษณ์|จิตใจ|ใจ|ทางใน|จิตวิญญาณ|ศรัทธา|บารมี|ผู้ใหญ่ช่วย|โอกาส|luck|fortune|fame|reputation|recognition|visibility|merit|karma|spiritual|inner|psychology|mind|faith|blessing|opportunity|福德|相貌|名聲|名声|化科|祿存|禄存|貴人|贵人|業|业|精神|靈|灵/i]);
  const windfall = has([/หวย|ล็อตเตอรี่|ลอตเตอรี่|ถูกหวย|รางวัลใหญ่|แจ็คพอต|ลาภลอย|เงินก้อน|เงินก้อนใหญ่|เสี่ยงโชค|พนัน|เดิมพัน|คาสิโน|เก็งกำไร|เก็ง|กำไรเร็ว|กำไรไว|หุ้นซิ่ง|หุ้นปั่น|คริปโต|เหรียญ|เงินรั่ว|รั่วไหล|เสียเงิน|ขาดทุนหนัก|lottery|jackpot|windfall|gambl|bet|casino|speculat|quick\s*profit|sudden\s*gain|cash\s*leak|capital\s*leak|take\s*profit|stop\s*loss|crypto|meme\s*coin|祿存|禄存|橫財|横财|偏財|博彩|賭|赌|投機|投机/i]);
  const creator = has([/ทำคอนเทนต์|ทำคอนเท้นต์|ครีเอเตอร์|อินฟลู|ยูทูบ|ยูทูป|ติ๊กต็อก|ขายของออนไลน์|ร้านออนไลน์|ออนไลน์|ไลฟ์|ไลฟ์สด|สตรีม|โซเชียล|ผู้ติดตาม|คนติดตาม|แฟนคลับ|คนดู|ยอดวิว|ไวรัล|เอนเกจ|รีช|แคมเปญ|ยิงแอด|โฆษณา|คอนเวอร์ชั่น|conversion|ปิดการขาย|ยอดขาย|creator|content\s*(creator|creation|marketing)|influencer|youtube|tiktok|reels|shorts|livestream|live\s*stream|stream|social|online|followers?|fans?|views?|viral|engagement|reach|impressions?|audience|campaign|ads?|e[-\s]?commerce|marketplace|sponsor(ship)?|brand\s*deal|直播|粉絲|粉丝|流量|曝光|轉化|转化|受眾|受众|社群/i]);
  const reputation = has([/ชื่อเสียง|ภาพลักษณ์|เครดิต|ความน่าเชื่อถือ|รีวิว|คอมเมนต์|คอมเม้นต์|ดราม่า|เสียชื่อ|เสียเครดิต|โดนด่า|ถูกด่า|โดนโจมตี|โจมตีออนไลน์|ใส่ร้าย|หมิ่นประมาท|ข่าวลือ|ซุบซิบ|แฉ|ขอโทษ|แก้ข่าว|ชี้แจง|โดนแบน|แบนบัญชี|แพลตฟอร์มแบน|reputation|public\s*image|credibility|public\s*trust|review|reviews|comment|comments|backlash|scandal|cancel(?:led|ed)?|cancel\s*culture|defamation|slander|libel|gossip|rumou?r|bad\s*press|public\s*apology|apologize|apology|clarify|clarification|banned|shadowban|shadow\s*ban|brand\s*trust|pr\s*crisis|crisis\s*comms?|投訴|投诉|口碑|名聲|名声|聲譽|声誉|醜聞|丑闻|誹謗|诽谤|謠言|谣言|封禁|公關|公关/i]);
	  const caseStudyProof = has([/case[-\s]?stud(?:y|ies)|เคส\s*สตัดดี้|เคสลูกค้า|กรณีศึกษา|testimonial|testimonials?|คำรับรอง|คํารับรอง|รีวิวลูกค้า|ขอรีวิว|review\s*request|customer\s*review|customer\s*story|client\s*story|success\s*story|proof[-\s]?library|proof\s*page|proof[-\s]?first|proof\s*claim|method\s*proof|social\s*proof|before[-\s]?after|before\s*\/\s*after|before\s+and\s+after|ผลลัพธ์ลูกค้า|หลักฐานลูกค้า|หลักฐานผลลัพธ์|result\s*screenshots?|screenshot\s*sequence|outcome\s*gallery|client\s*proof|credibility\s*assets?|founder\s*story|audit\s*result|customer\s*evidence|video\s*testimonial|anonymi[sz]ed\s*case|numbers[-\s]?only\s*proof|คลัง\s*proof|หน้า\s*proof|เรื่องเล่าลูกค้า|หลักฐานก่อนหลัง|案例|見證|见证|客戶故事|客户故事|社會證明|社会证明|前後對比|前后对比|成果圖|成果图|證據|证据|口碑/i]);
		  const salesTeamQa = has([
		    /sales\s*(team|rep|ops|operation|process|qa|quality|manager|dashboard|pipeline|playbook|cadence|coaching|training)|crm\s*(pipeline|stage|hygiene|dashboard)|pipeline\s*(hygiene|stage|review|dashboard)|lead\s*(follow[-\s]?up|handoff|routing|queue)|follow[-\s]?up\s*(sequence|cadence|sla)|call\s*(review|recording|qa|quality)|lost\s*deal|no[-\s]?show|show[-\s]?rate|close\s*rate|stage\s*conversion|demo\s*booking|consult\s*follow[-\s]?up|sales\s*coaching|sales\s*manager|sales\s*rep\s*quality|setter|closer|objection\s*library/i,
		    /ทีมขาย|เซลส์ทีม|พนักงานขาย|ระบบขาย|กระบวนการขาย|sales qa|QA\s*เซลส์|รีวิวสายขาย|ฟังสายขาย|อัดเสียงขาย|CRM|ซีอาร์เอ็ม|ไปป์ไลน์|pipeline|ติดตามลีด|follow\s*up|ฟอลโลว์อัพ|handoff\s*ลีด|ส่งต่อลีด|นัดเดโม|นัด\s*consult|no-show|ลูกค้าไม่มา|ดีลหาย|รีวิวดีลแพ้|โค้ชเซลส์|อบรมเซลส์|ผู้จัดการฝ่ายขาย|แดชบอร์ดขาย|conversion\s*stage|stage\s*conversion|close\s*rate|ปิดการขายของทีม|คุณภาพเซลส์|setter|closer/i,
		    /銷售團隊|销售团队|銷售流程|销售流程|銷售QA|销售QA|CRM|銷售管線|销售管线|跟進線索|跟进线索|通話復盤|通话复盘|銷售培訓|销售培训|成交率|漏斗階段/i,
		  ]);
		  const salesScript = has([/sales\s*page|sale\s*page|landing\s*page\s*copy|แลนดิ้ง\s*เพจ|หน้า\s*sales|หน้า\s*ขาย|เซลส์เพจ|เซลเพจ|เว็บขาย|copywriting|sales\s*copy|คำขาย|ข้อความขาย|สคริปต์ขาย|สคริปขาย|บทขาย|บทพูดขาย|sales\s*script|closing\s*script|close\s*script|ปิดการขาย|ปิดขาย|discovery\s*call|consult(?:ation)?\s*call|sales\s*call|consultation\s*script|consult\s*script|appointment\s*call|proposal\s*pitch|pitch\s*deck|pitch\s*script|dm\s*pitch|dm\s*script|ไดเรกต์\s*ปิดการขาย|webinar\s*script|webinar|เวบินาร์|เวบิナー|สัมมนาขาย|workshop\s*script|live\s*workshop|vsl|video\s*sales\s*letter|launch\s*presentation|presentation\s*script|objection\s*handling|ตอบข้อโต้แย้ง|handle\s*objections|cta|call[-\s]?to[-\s]?action|case[-\s]?study\s*page|faq[-\s]?first|proof[-\s]?first|story[-\s]?first|銷售頁|销售页|銷售文案|销售文案|成交腳本|成交脚本|銷售腳本|销售脚本|網路研討會|网络研讨会|講座銷售|讲座销售|提案簡報|提案简报|異議處理|异议处理/i]) && !caseStudyProof && !salesTeamQa;
  const pricing = has([/ราคา|ตั้งราคา|ปรับราคา|ขึ้นราคา|ลดราคา|แพ็กเกจ|แพ็คเกจ|แพคเกจ|แพ็ก|แพ็ค|แพค|โปรโมชัน|โปรโมชั่น|โปรฯ|โปร|คูปอง|ส่วนลด|ดีล|บันเดิล|bundle|tier|แพลน|แผนราคา|แพ็กเติม|แพ็คเติม|เติมยาม|เติมเครดิต|เครดิต|top\s*up|topup|credit\s*pack|package|pricing|price|raise\s*price|lower\s*price|discount|coupon|promo(?:tion)?|intro\s*offer|offer|bundle|upsell|cross[-\s]?sell|add[-\s]?on|paid\s*plan|plan|value\s*ladder|value\s*proposition|ราคา套餐|套餐|定價|定价|價格|价格|優惠|优惠|折扣|加購|加购|升級|升级/i]);
 const teamCompensation = has([/(?:employee|staff|team|contractor|freelancer|assistant|va|virtual\s*assistant|sales\s*(?:rep|team|role)|support\s*(?:rep|team|role)|manager|operator|ops\s*manager).{0,50}(?:salary|pay|rate|bonus|commission|incentive|kpi|okr|quota|performance|payroll|raise|profit\s*share)|(?:salary|pay|rate|bonus|commission|incentive|kpi|okr|quota|performance\s*review|probation\s*review|payroll|raise|profit\s*share|performance\s*improvement\s*plan|pip|underperformer|pay\s*cut).{0,50}(?:employee|staff|team|contractor|freelancer|assistant|va|sales\s*(?:rep|team|role)|support\s*(?:rep|team|role)|manager|operator)|team\s*(?:compensation|incentive|bonus|commission|salary|pay|payroll|performance)|staff\s*(?:compensation|incentive|bonus|commission|salary|pay|payroll|performance)|contractor\s*(?:rate|pay|bonus|incentive)|sales\s*commission|commission\s*(?:plan|rate|rates?|structure|model|payout)\s*(?:for\s*)?(?:staff|team|employee|sales|contractor)|bonus\s*(?:plan|pool|structure)|incentive\s*(?:plan|structure|model)|kpi\s*(?:bonus|plan|review|score)|okr\s*(?:bonus|plan|review)|quota\s*(?:plan|bonus|commission)|performance\s*(?:review|bonus|management|plan)|probation\s*review|payroll\s*(?:budget|cost|plan)|raise\s*(?:staff|employee|team|contractor)|reduce\s*(?:staff|employee|team|contractor)\s*pay|profit\s*share\s*(?:for\s*)?(?:staff|team|employee)|จ่ายเงินเดือน(?:พนักงาน|ทีม|ลูกน้อง)|เงินเดือน(?:พนักงาน|ทีม|ลูกน้อง|ผู้ช่วย|เซลส์|ซัพพอร์ต)|ค่าจ้าง(?:พนักงาน|ทีม|ลูกน้อง|ผู้ช่วย|ฟรีแลนซ์|คอนแทรกเตอร์)|ค่าแรง(?:พนักงาน|ทีม|ลูกน้อง)|ค่าคอม(?:พนักงาน|ทีม|ลูกน้อง|เซลส์)|คอมมิชชัน(?:พนักงาน|ทีม|ลูกน้อง|เซลส์)|โบนัส(?:พนักงาน|ทีม|ลูกน้อง)|อินเซนทีฟ|incentive|KPI|OKR|โควต้า|ประเมินผลงาน|ประเมินทีม|ประเมินพนักงาน|ทดลองงาน.*(?:ประเมิน|เงินเดือน|โบนัส)|ปรับเงินเดือน(?:พนักงาน|ทีม|ลูกน้อง)|ขึ้นเงินเดือน(?:พนักงาน|ทีม|ลูกน้อง)|ลดเงินเดือน(?:พนักงาน|ทีม|ลูกน้อง)|แผนปรับปรุงผลงาน|ผลงานไม่ถึง|ลูกน้องผลงานไม่ดี|薪酬|員工薪資|员工薪资|工資|工资|獎金|奖金|佣金.*(?:員工|员工|團隊|团队|銷售|销售)|績效|绩效|KPI|OKR|提成|業績|业绩|試用期考核|试用期考核/i]);
  const cashflowBudget = has([
    /cash\s*flow|cashflow|runway|burn\s*rate|burn\s*(?:cash|cost|monthly)|monthly\s*(?:expense|expenses|cost|costs)|fixed\s*(?:cost|costs|expense|expenses)|cost\s*(?:control|cutting|cut|cuts|reduction|discipline)|reduce\s*(?:cost|costs|expense|expenses)|budget\s*(?:control|discipline|cut|cuts|plan|planning)|cash\s*reserve|reserve\s*cash|tax\s*reserve|run\s*out\s*of\s*cash|enough\s*cash|accounts?\s*receivable|receivables?|delayed\s*payment|late\s*payment|collection\s*(?:process|cadence)|collect\s*(?:payment|receivables)|refund\s*reserve|debt\s*service|ai\s*cost|ad\s*cost|saas\s*cost|software\s*cost|tool\s*cost|vendor\s*cost|inventory\s*cost|office\s*cost|platform\s*cost/i,
    /กระแสเงินสด|เงินหมุน|เงินสดพอ|เงินสดไม่พอ|เงินขาดมือ|เงินสำรอง|ทุนสำรอง|รันเวย์|runway|burn\s*rate|ค่าใช้จ่ายรายเดือน|รายจ่ายประจำ|ต้นทุนคงที่|คุมต้นทุน|ลดต้นทุน|ตัดต้นทุน|คุมค่าใช้จ่าย|ลดค่าใช้จ่าย|งบประมาณ(?:เงินสด|รายจ่าย|ต้นทุน|ค่าใช้จ่าย)|สำรองภาษี|เงินกันสำรอง|ลูกหนี้การค้า|ลูกค้าจ่ายช้า|เก็บเงินลูกค้า|ตามเก็บเงิน|เจ้าหนี้|จ่ายหนี้|ค่า\s*AI|ค่าเอไอ|ค่าแอด|ค่าโฆษณา|ค่า\s*SaaS|ค่าซอฟต์แวร์|ค่าเครื่องมือ|ค่าระบบ|ค่าแพลตฟอร์ม|ค่าเช่า|ค่าสต็อก|ค่าสินค้าคงคลัง/i,
    /現金流|现金流|資金周轉|资金周转|跑道|燒錢|烧钱|固定成本|成本控制|削減成本|削减成本|預算控制|预算控制|現金儲備|现金储备|應收帳款|应收账款|延遲付款|延迟付款|催收|稅務準備金|税务准备金|債務償付|债务偿付/i,
  ]) && !loanCreditDebt && !insuranceClaim && !windfall;
  const unitEconomics = has([
    /unit\s*economics|profit\s*margin|gross\s*margin|net\s*margin|contribution\s*margin|margin\s*floor|break[-\s]?even|breakeven|payback\s*(?:period|window|time)?|cac\s*payback|ltv\s*\/?\s*cac|ltv\s*to\s*cac|lifetime\s*value\s*\/?\s*cac|cost\s*per\s*(?:order|customer|lead|sale|unit|user)|profit\s*per\s*(?:order|customer|sale|unit|user|cohort)|revenue\s*per\s*(?:order|customer|user|account)|arpu|aov|average\s*order\s*value|average\s*revenue\s*per\s*user|unit\s*profit|cohort\s*profit|sku\s*profit|plan\s*profit|package\s*profit|profitable\s*(?:unit|sku|plan|cohort)|loss\s*per\s*(?:order|customer|sale|unit|user)|refund[-\s]?adjusted\s*profit/i,
    /ยูนิต\s*อีโคโนมิก|unit\s*economics|มาร์จิ้น|margin|กำไรขั้นต้น|กำไรสุทธิ|กำไรต่อ(?:ออเดอร์|คำสั่งซื้อ|ลูกค้า|หัว|คน|แพ็ก|แพ็ค|แพค|คอร์ส|แผน|ยูนิต)|ขาดทุนต่อ(?:ออเดอร์|คำสั่งซื้อ|ลูกค้า|หัว|คน|ยูนิต)|ต้นทุนต่อ(?:ออเดอร์|คำสั่งซื้อ|ลูกค้า|หัว|คน|ลีด|ยอดขาย|ยูนิต)|รายได้ต่อ(?:ออเดอร์|ลูกค้า|หัว|คน|บัญชี|ยูนิต)|จุดคุ้มทุน|คุ้มทุน|คืนทุน|ระยะคืนทุน|payback|CAC\s*payback|LTV\s*\/?\s*CAC|AOV|ARPU|กำไรต่อรอบ|กำไรต่อรุ่น|กำไรต่อสินค้า|SKU\s*กำไร/i,
    /單位經濟|单位经济|毛利率|毛利|淨利率|净利率|淨利|净利|利潤率|利润率|邊際貢獻|边际贡献|損益平衡|损益平衡|盈虧平衡|盈亏平衡|回本|回本期|回收期|客單價|客单价|每單成本|每单成本|每客成本|每客利潤|每客利润|ARPU|AOV/i,
  ]) && !cashflowBudget && !loanCreditDebt && !insuranceClaim && !windfall;
	  const supplyInventory = has([
	    /inventory|stock(?:out|ed|ing)?|overstock|dead\s*stock|safety\s*stock|reorder\s*point|reorder\s*level|sku\s*(?:count|mix|planning)|procurement|purchase\s*order|\bpo\b|supplier\s*(?:lead\s*time|terms?|delay|risk|quality)|vendor\s*(?:lead\s*time|terms?|delay|quality)|supply\s*chain|warehouse|warehousing|raw\s*material|materials?|moq|minimum\s*order\s*quantity|backorder|back\s*order|preorder\s*stock|consignment\s*stock|import\s*stock|customs\s*delay|logistics\s*(?:lead\s*time|delay)|stock\s*(?:clearance|clear|holding|turnover|cycle)|inventory\s*(?:turnover|count|planning|control|system)|cogs\s*(?:stock|inventory|supplier|procurement)/i,
	    /สต็อก|สต๊อก|สินค้าคงคลัง|ของคงคลัง|ของค้าง|ของขาด|ของล้น|ของตาย|dead\s*stock|สต็อกตาย|สต็อกขาด|สต็อกล้น|stockout|overstock|safety\s*stock|จุดสั่งซื้อ|จุดเติมของ|reorder|SKU|จัดซื้อ|ใบสั่งซื้อ|\bPO\b|ซัพพลายเออร์|supplier|vendor|คู่ค้าส่งของ|ผู้ผลิต|โรงงานผลิต|ขั้นต่ำสั่งซื้อ|ขั้นต่ำผลิต|MOQ|วัตถุดิบ|คลังสินค้า|คลังของ|โกดัง|นำเข้าสินค้า|นำเข้า|ศุลกากร|ของติดด่าน|โลจิสติกส์|ขนส่งสินค้า|lead\s*time|รอบสั่งของ|เคลียร์สต็อก|ระบายของ|นับสต็อก|ระบบสต็อก/i,
	    /庫存|库存|存貨|存货|缺貨|缺货|斷貨|断货|滯銷|滞销|呆滯庫存|呆滞库存|安全庫存|安全库存|補貨點|补货点|採購|采购|採購單|采购单|供應商|供应商|供應鏈|供应链|倉庫|仓库|原料|最低訂購量|最低订购量|MOQ|預購庫存|预购库存|寄售庫存|寄售库存|進口庫存|进口库存|清關延誤|清关延误|物流延誤|物流延误/i,
		  ]) && !unitEconomics && !loanCreditDebt && !insuranceClaim && !windfall;
	  const taxAccounting = has([
	    /tax\s*(?:filing|file|return|deadline|audit|penalt(?:y|ies)|reserve|liabilit(?:y|ies)|compliance|planning)|vat|gst|sales\s*tax|withholding\s*tax|wht|bookkeep(?:ing|er)?|account(?:ing|ant|antcy)?|ledger|general\s*ledger|journal\s*entr(?:y|ies)|invoice\s*(?:number|sequence|trail|reconciliation|matching)?|receipt\s*(?:trail|matching)?|p\s*&\s*l|profit\s*and\s*loss|balance\s*sheet|financial\s*statement|statement\s*of\s*financial|trial\s*balance|reconciliation|reconcile\s*(?:bank|books?|accounts?)|bank\s*reconciliation|month[-\s]?end\s*close|monthly\s*close|audit\s*trail|chart\s*of\s*accounts|depreciation|fixed\s*asset\s*register|separate\s*(?:personal|business)\s*accounts?/i,
	    /ยื่นภาษี|แบบภาษี|ภาษีมูลค่าเพิ่ม|ภาษีหัก\s*ณ\s*ที่จ่าย|หัก\s*ณ\s*ที่จ่าย|ภงด|ภ\.ง\.ด|ภพ\.?30|ภ\.พ\.?30|VAT|แวต|บัญชี|ทำบัญชี|ปิดบัญชี|ผู้ทำบัญชี|นักบัญชี|สำนักงานบัญชี|สมุดบัญชี|บัญชีรายรับรายจ่าย|บัญชีแยกประเภท|งบกำไรขาดทุน|งบดุล|งบการเงิน|ใบกำกับภาษี|ใบเสร็จ|ใบรับเงิน|เลขที่ใบกำกับ|กระทบยอด|กระทบยอดธนาคาร|ปิดงบ|ปิดเดือน|รายงานภาษี|รายงานซื้อขาย|เอกสารบัญชี|แฟ้มเอกสารภาษี|ค่าปรับภาษี|ภาษีย้อนหลัง|ตรวจภาษี|ตรวจบัญชี|ภาษีค้าง|แยกบัญชีส่วนตัว|แยกบัญชีธุรกิจ/i,
	    /報稅|报税|納稅申報|纳税申报|稅務申報|税务申报|增值稅|增值税|營業稅|营业税|預扣稅|预扣税|會計|会计|記帳|记账|帳本|账本|分類帳|分类账|發票|发票|收據|收据|對帳|对账|銀行對帳|银行对账|損益表|损益表|資產負債表|资产负债表|財務報表|财务报表|試算表|试算表|月結|月结|審計軌跡|审计轨迹|稅務罰款|税务罚款|補稅|补税/i,
		  ]) && !cashflowBudget && !unitEconomics && !supplyInventory && !loanCreditDebt && !insuranceClaim && !windfall;
	  const partnerDueDiligence = has([/due\s*diligence|vet\s*(?:a\s*)?partner|partner\s*vetting|background\s*check|partner\s*risk|counterparty\s*risk|business\s*partner\s*(?:conflict|dispute|risk|breach|fraud|default)|co[-\s]?founder\s*(?:conflict|dispute|breakup|exit)|joint\s*venture\s*(?:dispute|risk|agreement|termination)|equity\s*split|revenue\s*split|profit\s*split|operating\s*agreement|shareholder\s*agreement|\bmou\b|\bnda\b|non[-\s]?compete|confidentiality|breach\s*(?:of\s*)?(?:contract|agreement)|default\s*(?:clause|notice)?|buyout|buy[-\s]?out|exit\s*clause|termination\s*clause|terminate\s*(?:partnership|partner|agreement|contract)|dissolve\s*(?:partnership|company|venture)|partner\s*(?:stole|steal|stealing)\s*(?:clients?|customers?|ip|data)|partner\s*not\s*delivering|สืบประวัติ(?:คู่ค้า|หุ้นส่วน|พาร์ทเนอร์)|ตรวจ(?:คู่ค้า|หุ้นส่วน|พาร์ทเนอร์)|ตรวจสอบ(?:คู่ค้า|หุ้นส่วน|พาร์ทเนอร์)|ความเสี่ยง(?:คู่ค้า|หุ้นส่วน|พาร์ทเนอร์)|หุ้นส่วน(?:โกง|ไม่ส่งงาน|ผิดสัญญา|ทะเลาะ|มีปัญหา|ขัดแย้ง|เบี้ยว|แยกทาง|ถอนตัว)|คู่ค้า(?:โกง|ไม่ส่งงาน|ผิดสัญญา|ทะเลาะ|มีปัญหา|ขัดแย้ง|เบี้ยว|แยกทาง|ถอนตัว)|พาร์ทเนอร์(?:โกง|ไม่ส่งงาน|ผิดสัญญา|ทะเลาะ|มีปัญหา|ขัดแย้ง|เบี้ยว|แยกทาง|ถอนตัว)|ข้อตกลงหุ้นส่วน|สัญญาหุ้นส่วน|สัญญาคู่ค้า|แบ่งหุ้น|แบ่งรายได้กับหุ้นส่วน|แบ่งกำไรกับหุ้นส่วน|ซื้อหุ้นคืน|buyout|เลิกหุ้นส่วน|ยุติหุ้นส่วน|ถอนหุ้น|แยกบริษัท|\bMOU\b|\bNDA\b|保密協議|保密协议|競業禁止|竞业禁止|盡職調查|尽职调查|合作方風險|合作方风险|合夥糾紛|合伙纠纷|合夥人糾紛|合伙人纠纷|股權分配|股权分配|分成糾紛|分成纠纷|違約|违约|退出條款|退出条款|終止合作|终止合作|解散合夥|解散合伙/i]);
  const partnershipProgram = has([/affiliate\s*(?:program|partner|partners?|link|links?|code|codes?|coupon|commissions?|payout|tracking)|partner\s*(?:program|channel|channels?|portal|manager|tiers?|onboarding|recruiting|recruitment)|partnership\s*(?:program|channel|strategy|deal|deals?|pipeline|model)|referral\s*(?:program|system|partner|partners?|bounty|reward|rewards?|commission|commissions?|link|links?|code|codes?)|channel\s*partners?|resellers?|reseller\s*program|ambassador\s*(?:program|partners?)|joint\s*venture|\\bjv\\b|co[-\\s]?marketing|revenue\\s*share|rev[-\\s]?share|commission\\s*(?:structure|rate|rates?|model|payout)|strategic\\s*alliance|creator\\s*affiliate|agency\\s*partner|partner\\s*fraud|tracking\\s*dispute|พันธมิตร|พาร์ทเนอร์|โปรแกรม\\s*พาร์ทเนอร์|โปรแกรม\\s*พันธมิตร|โปรแกรม\\s*แนะนำ|โปรแกรม\\s*referral|ระบบ\\s*แนะนำ|ระบบ\\s*affiliate|แอฟฟิลิเอต|แอฟฟิเลียต|ตัวแทนขาย|ตัวแทนจำหน่าย|นายหน้า|ค่านายหน้า|ส่วนแบ่งรายได้|แบ่งรายได้|แอมบาสเดอร์|จับมือธุรกิจ|ร่วมโปรโมต|ร่วมการตลาด|ดีลพาร์ทเนอร์|พาร์ทเนอร์โกง|合作夥伴|合作伙伴|夥伴計畫|伙伴计划|聯盟行銷|联盟营销|分銷|分销|經銷|经销|佣金|分潤|分润|推薦計畫|推荐计划|渠道夥伴|渠道伙伴|策略聯盟|战略联盟/i]) && !teamCompensation && !partnerDueDiligence;
  const hiringDelegation = has([/hire\s*(?:employee|staff|team|contractor|freelancer|assistant|va|virtual\s*assistant|ops\s*manager|operations\s*manager|sales\s*(?:rep|team|role)|support\s*(?:rep|team|role)|specialist|manager)|hiring\s*(?:plan|roadmap|strategy|process|funnel)|recruit(?:ing|ment)?|interview\s*candidates?|job\s*description|\bjd\b|role\s*(?:design|definition|clarity)|org\s*(?:chart|design|structure)|team\s*(?:structure|design|roles?|capacity|build(?:ing)?|management)|delegat(?:e|ion|ing)|outsource|outsourcing|fractional\s*(?:manager|cfo|coo|cmo)|chief\s*of\s*staff|operator|operations\s*lead|promote\s*internal|paid\s*trial|probation|fire\s*(?:employee|staff|contractor)|replace\s*(?:bad\s*)?hire|bad\s*hire|staff\s*churn|คนแรกที่ควรจ้าง|ควรจ้างใคร|จ้างใครก่อน|จ้างพนักงาน|จ้างทีม|จ้างลูกน้อง|จ้างผู้ช่วย|ผู้ช่วยส่วนตัว|เวอร์ชวล\s*แอสซิสแตนท์|จ้าง\s*VA|จ้างฟรีแลนซ์|จ้างคอนแทรกเตอร์|จ้างเซลส์|จ้างซัพพอร์ต|จ้างแอดมิน|จ้างโอเปอเรชัน|ผู้จัดการทีม|ผู้จัดการร้าน|หัวหน้าทีม|โครงสร้างทีม|ผังองค์กร|ออกแบบทีม|มอบหมายงาน|กระจายงาน|ดีเลเกต|แทนตัวเอง|ถอดงานจากตัวเอง|เขียน\s*JD|สัมภาษณ์ผู้สมัคร|ทดลองงาน|เลิกจ้าง|ไล่ออก|เปลี่ยนคน|ลูกน้องไม่ดี|招人|招聘|雇人|雇員|雇员|員工|员工|團隊|团队|組織架構|组织架构|職位設計|职位设计|工作描述|委派|外包|面試|面试|試用期|试用期|解僱|解雇/i]) && !teamCompensation;
  const marketing = has([/ยิงแอด|ลงแอด|ซื้อแอด|โฆษณา|แคมเปญ|แคมเปญยิงแอด|paid\s*traffic|paid\s*ads?|ad\s*spend|media\s*buy(?:ing)?|campaign|launch\s*campaign|lead\s*gen(?:eration)?|ลีด|lead|leads|funnel|ฟันเนล|landing\s*page|แลนดิ้ง|cac|roas|cpa|cpl|ctr|cpc|cpm|pixel|retarget(?:ing)?|remarket(?:ing)?|conversion\s*rate|creative\s*test|ad\s*creative|audience\s*test|lookalike|affiliate|referral\s*traffic|traffic\s*quality|traffic|投放|廣告|广告|流量投放|獲客|获客|漏斗|轉化率|转化率|再行銷|再营销|著陸頁|着陆页/i]) && !salesScript && !partnershipProgram && !hiringDelegation && !teamCompensation && !partnerDueDiligence && !unitEconomics;
  const retention = has([/ต่ออายุ|ต่อสมาชิก|ยกเลิก|ยกเลิกสมาชิก|คืนเงิน|ขอเงินคืน|รีฟันด์|รีฟัน|refund|chargeback|ชาร์จแบ็ก|renew|renewal|recurring|retention|retain|churn|cancel(?:lation)?|unsubscribe|repeat\s*purchase|repeat\s*customer|customer\s*retention|lifetime\s*value|ltv|mrr|arr|退款|續費|续费|取消|流失|留存|復購|复购/i]);
  const supportOps = has([/ซัพพอร์ต|ซับพอร์ต|บริการลูกค้า|บริการหลังการขาย|บริการ|ลูกค้าบ่น|ลูกค้าร้องเรียน|ร้องเรียน|คอมเพลน|เคสค้าง|ทิคเก็ต|ticket|tickets|support|customer\s*support|service\s*quality|service\s*recovery|complain|complaint|complaints|case\s*backlog|backlog|queue|คิวค้าง|ส่งมอบ|ส่งงาน|ส่งของ|ส่งช้า|ส่งมอบช้า|delivery|deliver|delivered|fulfillment|fulfilment|shipping|shipment|onboarding|ออนบอร์ด|sla|service\s*level|operation|operations|ops|process|sop|workflow|handoff|handover|quality\s*control|qa|staff\s*capacity|support\s*load|客服|客訴|客诉|投訴|投诉|交付|履約|履约|服務|服务|工單|工单|排隊|排队|售後|售后/i]) && !hiringDelegation && !teamCompensation && !partnerDueDiligence;
  const techProduct = has([/เทคโนโลยี|เทค|แอป|แอพ|เว็บ|เว็บไซต์|ซอฟต์แวร์|ซอฟต์แวร์|ระบบ|แพลตฟอร์ม|โปรดักต์|ฟีเจอร์|โรดแมป|เอ็มวีพี|เบต้า|เอไอ|เอไอแชท|แชทบอท|ฐานข้อมูล|เซิร์ฟเวอร์|คลาวด์|ดีพลอย|ดีพลอยเมนต์|ออโตเมชัน|อัตโนมัติ|อินทิเกรชัน|เชื่อมระบบ|ข้อมูลรั่ว|ความปลอดภัยข้อมูล|ความเป็นส่วนตัว|app|website|web\s*app|software|saas|platform|product\s*roadmap|roadmap|mvp|beta|feature|tech\s*stack|technology|server|backend|frontend|database|db\b|api|sdk|cloud|deploy|deployment|release|automation|integration|ai\b|llm|chatbot|machine\s*learning|model|prompt|vector|embedding|data\s*model|data\s*privacy|privacy|security|cyber|data\s*breach|uptime|downtime|latency|scalability|scaling|bug|debug|refactor|repository|repo|github|devops|ci\/cd|技術|技术|科技|軟體|软件|系統|系统|平台|產品|产品|功能|伺服器|服务器|資料庫|数据库|雲端|云端|部署|自動化|自动化|整合|隱私|隐私|安全|漏洞|宕機|宕机/i]);
  const industryFit = has([/เหมาะกับ(?:อาชีพ|งาน|ธุรกิจ|กิจการ|ตลาด|สายงาน|สายอาชีพ|บทบาท|role)|อาชีพอะไร|งานอะไร|สายงานอะไร|สายอาชีพอะไร|ธุรกิจอะไร|ธุรกิจแบบไหน|เปิดร้านอะไร|ขายอะไรดี|ทำอะไรดี|ทำอะไรได้เงิน|ตลาดไหน|ตลาดอะไร|ตลาดที่เหมาะ|ช่องทางทำเงิน|อุตสาหกรรม|อุตสาหกรรมไหน|นิช|นีช|ช่องว่างตลาด|สินค้าอะไร|บริการอะไร|สายไหนดี|career\s*fit|career\s*path|what\s*(career|job|profession|business|industry|sector|niche)|which\s*(career|job|profession|business|industry|sector|niche)|industry|sector|niche|market\s*fit|role\s*fit|profession\s*fit|business\s*type|job\s*type|moneti[sz]e|monetizable|職業|职业|行業|行业|產業|产业|市場定位|市场定位|適合.*(職業|行业|產業|市場)|适合.*(职业|行业|产业|市场)/i]);
  const customerFit = has([/ลูกค้ากลุ่มไหน|กลุ่มลูกค้า|ลูกค้าแบบไหน|ลูกค้าประเภทไหน|กลุ่มเป้าหมาย|เป้าหมายลูกค้า|ควรขายให้ใคร|ขายให้ใคร|ใครควรซื้อ|ใครเหมาะจะซื้อ|ใครจะซื้อ|คนซื้อแบบไหน|คนตามแบบไหน|ผู้ติดตามแบบไหน|subscriber\s*แบบไหน|target\s*audience|ideal\s*customer|customer\s*persona|buyer\s*persona|client\s*persona|audience\s*persona|customer\s*segment|buyer\s*segment|market\s*segment|persona\s*fit|customer\s*fit|audience\s*fit|customer\s*type|client\s*type|客戶群|客户群|目標客戶|目标客户|受眾|受众|客群|買家|买家|顧客|顾客|粉絲群|粉丝群/i]);
	  const offerFit = has([/สินค้าแบบไหน|สินค้าประเภทไหน|สินค้าอะไร|ขายสินค้าอะไร|ทำสินค้าอะไร|บริการแบบไหน|บริการประเภทไหน|บริการอะไร|ทำบริการอะไร|ข้อเสนอแบบไหน|ข้อเสนออะไร|ข้อเสนอขาย|ทำคอร์สหรือ|คอร์สหรือ|ที่ปรึกษาหรือ|consult\s*หรือ|digital\s*product|physical\s*product|premium\s*service|producti[sz]e|productized|done[-\s]?for[-\s]?you|done\s*for\s*you|dfy|group\s*program|fixed[-\s]?scope|product\s*fit|service\s*fit|offer\s*fit|offer\s*type|product\s*line|service\s*line|what\s*(product|service|offer)|which\s*(product|service|offer)|產品線|产品线|產品類型|产品类型|服務類型|服务类型|商品類型|商品类型|做什麼產品|做什么产品|做什麼服務|做什么服务/i]);
	  const deliveryModel = has([/ส่งมอบแบบไหน|โมเดลส่งมอบ|รูปแบบส่งมอบ|delivery\s*model|delivery\s*fit|fulfillment\s*model|fulfilment\s*model|capacity\s*model|high[-\s]?touch|low[-\s]?touch|one[-\s]?to[-\s]?one|1[:\s]?1|ตัวต่อตัว|รายคน|limited\s*slots?|premium\s*slots?|self[-\s]?serve|self\s*service|serve\s*self|ทำเองได้|template\s*library|knowledge\s*base|audit[-\s]?report|audit\s*report|fixed[-\s]?scope|retainer|agency\s*service|done[-\s]?for[-\s]?you|done\s*for\s*you|done[-\s]?with[-\s]?you|done\s*with\s*you|dfy|dwy|group\s*program|cohort|membership\s*(model|program|delivery)|subscription\s*(model|delivery)|recurring\s*service|hybrid\s*delivery|unlimited\s*support|จำกัดรอบแก้|จำกัดจำนวนลูกค้า|รับกี่คน|ส่งงานยังไง|ระบบสมาชิกแบบไหน|สมัครสมาชิกแบบไหน|交付模式|履約模式|履约模式|高接觸|低接觸|一對一|一对一|自助|會員制交付|会员制交付|訂閱模式|订阅模式|固定範圍|固定范围/i]);
	  const valueLadder = has([/high[-\s]?ticket|low[-\s]?ticket|premium(?!\s*(?:slots?|service|delivery))|vip|วีไอพี|ขายแพง|ขายถูก|ของแพง|ของถูก|ลูกค้าพรีเมียม|ลูกค้าไฮเอนด์|แพ็กเริ่มต้น|แพ็คเริ่มต้น|แพคเริ่มต้น|แพ็กสูง|แพ็คสูง|แพคสูง|แพ็กพรีเมียม|แพ็คพรีเมียม|แพคพรีเมียม|entry\s*offer|starter\s*(?:offer|tier|plan|package)|tripwire|front[-\s]?end\s*offer|backend\s*offer|back[-\s]?end\s*offer|backend\s*(?:tier|price|pricing|package|plan)|subscription\s*backend|membership\s*ladder|value\s*ladder|offer\s*ladder|tier\s*ladder|ascension|upsell\s*path|enterprise\s*(?:tier|package|plan)|mid[-\s]?ticket|ราคาสูง|ราคาต่ำ|บันไดราคา|บันไดสินค้า|階梯|高價|高价|低價|低价|入門|入门|高端|低端|客單價|客单价/i]);
	  const scopeBoundary = has([/รับประกัน|การันตี|การรับประกัน|คำรับประกัน|เงื่อนไขรับประกัน|รับประกันผล|การันตีผล|ไม่รับประกันผล|ขอบเขตงาน|ขอบเขตบริการ|ขอบเขต\s*scope|ขอบเขตข้อเสนอ|สิ่งที่รวม|สิ่งที่ไม่รวม|นอกขอบเขต|ในขอบเขต|แก้ไม่อั้น|แก้กี่รอบ|จำกัดรอบแก้|จำกัดรอบ|รอบแก้|รีวิชั่น|สโคป|ส่งมอบอะไรบ้าง|deliverables?|scope\s*of\s*work|out[-\s]?of[-\s]?scope|in[-\s]?scope|guarantee|guaranteed|money[-\s]?back|refund[-\s]?proof|no[-\s]?refund|refund\s*policy|cancellation\s*policy|warranty|promise\s*boundary|result\s*guarantee|success\s*guarantee|revision\s*limit|unlimited\s*revisions?|acceptance\s*criteria|milestone\s*acceptance|deliverable[-\s]?only|process\s*guarantee|satisfaction\s*check|terms\s*of\s*service|service\s*terms|policy\s*page|保證|保证|退款政策|不退款|服務範圍|服务范围|範圍|范围|交付物|修訂|修订|無限修改|无限修改|驗收|验收/i]);
	  const qualificationGate = has([/คัดกรองลูกค้า|คัดลูกค้า|คัดคน|คัดผู้สมัคร|แบบฟอร์มคัดกรอง|ฟอร์มคัดกรอง|ฟอร์มสมัคร|ใบสมัคร|ใบสมัครลูกค้า|แบบฟอร์มสมัคร|แบบฟอร์มรับลูกค้า|ฟอร์มรับลูกค้า|แบบฟอร์มก่อนคุย|ฟอร์มก่อนโทร|แบบฟอร์มก่อนขาย|intake\s*form|intake\s*questionnaire|intake\s*gate|qualification\s*form|qualifying\s*form|qualification\s*gate|qualification\s*quiz|qualify\s*clients?|client\s*qualification|buyer\s*qualification|client\s*screening|buyer\s*screening|screening\s*form|application\s*form|application\s*quiz|fit\s*score|fit[-\s]?score|pre[-\s]?call\s*form|pre[-\s]?call\s*questionnaire|discovery\s*questionnaire|required\s*documents?|document\s*upload|red\s*flags?|reject\s*criteria|acceptance\s*criteria\s*before|deposit\s*gate|paid\s*diagnostic|setup\s*checklist|kickoff\s*checklist|onboarding\s*form|onboarding\s*flow|onboarding\s*checklist|handoff\s*checklist|客戶篩選|客户筛选|篩選表|筛选表|資格審核|资格审核|申請表|申请表|入門表|入门表|入職表|入职表|表單|表单|紅旗|红旗|拒絕條件|拒绝条件/i]);
	  const customerSuccess = has([/customer\s*success|success\s*playbook|customer\s*success\s*playbook|renewal\s*playbook|renewal\s*sequence|renewal\s*cadence|account\s*management|account\s*plan|account\s*review|customer\s*health\s*score|health\s*score|success\s*milestones?|success\s*metric|success\s*plan|success\s*path|check[-\s]?in\s*cadence|customer\s*check[-\s]?in|progress\s*review|qbr|quarterly\s*business\s*review|adoption\s*plan|activation\s*plan|product\s*adoption|service\s*adoption|expansion\s*(?:plan|motion|revenue|account)|upsell\s*timing|renewal\s*ask|ask\s*renewal|ask\s*expansion|referral\s*ask|ask\s*referral|rescue\s*plan|at[-\s]?risk\s*clients?|save\s*play|win[-\s]?back|make\s*clients?\s*get\s*results?|clients?\s*get\s*results?|ลูกค้าได้ผลลัพธ์|ทำให้ลูกค้าได้ผล|แผนต่ออายุ|แผนให้ลูกค้าต่ออายุ|เพลย์บุ๊กต่ออายุ|ระบบต่ออายุ|จังหวะต่ออายุ|สุขภาพลูกค้า|คะแนนสุขภาพลูกค้า|เช็กอินลูกค้า|เช็คอินลูกค้า|ติดตามผลลูกค้า|รีวิวความคืบหน้า|แผนช่วยลูกค้า|ช่วยลูกค้าให้สำเร็จ|ลูกค้าเสี่ยงยกเลิก|แผนกู้ลูกค้า|กู้ลูกค้า|ขยายบัญชี|ขยายแพ็กเกจ|ขอ referral|ขอรีเฟอร์|ขอแนะนำต่อ|客戶成功|客户成功|續約劇本|续约剧本|續約流程|续约流程|健康分|客戶健康|客户健康|成功里程碑|進度回顧|进度回顾|擴張收入|扩张收入|挽回客戶|挽回客户/i]) && !partnershipProgram && !hiringDelegation && !teamCompensation && !partnerDueDiligence;
	  const retentionIntent = retention && !deliveryModel && !valueLadder && !scopeBoundary && !customerSuccess;
  const talent = has([/นิสัย|ตัวตน|บุคลิก|บุคลิกภาพ|พรสวรรค์|จุดแข็ง|จุดอ่อน|ความถนัด|ทักษะ|ฝีมือ|เสน่ห์|หน้าตา|รูปลักษณ์|รูปร่าง|ภาพจำ|แบรนด์|สไตล์|เหมาะกับอะไร|character|personality|temperament|identity|talent|skill|strength|weakness|appearance|looks|body|charisma|personal\s*brand|style|aptitude|gift|命宮|命主|命度|身宮|身主|相貌|形性|Lagna|Ascendant|chart\s*ruler/i]);
  const decision = has([/ควร|ดีไหม|ได้ไหม|ไหวไหม|เอาไหม|ลุย|รอ|เลือก|ทางเลือก|ตัดสินใจ|ทำยังไง|ต้องทำอะไร|เริ่ม|หยุด|เลิก|ลาออก|ย้ายงาน|เปิดร้าน|ลงทุน|ซื้อ|ขาย|เซ็น|สมัคร|รับงาน|รับข้อเสนอ|go\s*\/?\s*no|go|wait|choose|choice|decision|should|advice|strategy|next\s*step|action|recommend/i]);
  const remedy = has([/แก้ดวง|เสริมดวง|แก้ยังไง|เสริมยังไง|ลดแรง|ลดความเสี่ยง|บรรเทา|รับมือ|ป้องกัน|ทำอะไรให้ดีขึ้น|ปรับตัวยังไง|ปรับยังไง|ระวังยังไง|ทำบุญ|สะเดาะ|remedy|remedial|mitigat|upaya|protect|strengthen|improve|risk[-\s]?reduction|reduce\s+risk/i]) && !has([/แก้เวลาเกิด|ปรับเวลาเกิด|หาเวลาเกิด|ตรวจเวลาเกิด|rectification|birth\s*time\s*correction/i]);
  const validation = has([/ตรงไหม|ตรงมั้ย|ทำไมไม่ตรง|ไม่ตรง|พิสูจน์ดวง|ตรวจความตรง|เช็คความตรง|ที่ผ่านมา|อดีต|เคยเกิด|ช่วงก่อน|ย้อนหลัง|เหตุการณ์จริง|validate|validation|calibrate|calibration|past\s*event|life\s*event|specificity|prove/i]);
  const interaction = has([/ปฏิกิริยาดาว|ดาวกระทบ|ดาวสัมพันธ์|ดาวชน|ดาวหนุน|ดาวกด|มุมดาว|ดาวทำมุม|aspect|aspects|contact|contacts|conjunction|opposition|square|trine|sextile|parallel|antiscia|reception|drishti|dṛṣṭi|graha\s*contact|yoga|โยคะ|三方|四正|三方四正|四化|飛化|飞化|飛星|飞星/i]);
  const business = has([/ธุรกิจ|กิจการ|เปิดร้าน|บริษัท|ร้านค้า|ค้าขาย|ขายของ|ลูกค้า|คู่ค้า|ซัพพลาย|supplier|client|customer|business|company|startup|commerce|trade|merchant|ลงทุน|investment|investor|ซื้อ|ขาย|purchase|sell|สัญญา|เซ็น|contract|หุ้นส่วน|partner|partnership|loan|credit|cashflow|กระแสเงินสด|กำไร|profit|ขาดทุน|loss|รายรับ|รายจ่าย|บัญชี|accounting/i]);
  const authority = has([/เอกสาร|หนังสือรับรอง|ใบอนุญาต|อนุญาต|อนุมัติ|ราชการ|รัฐบาล|หน่วยงาน|รัฐ|กฎหมาย|ศาล|คดี|ฟ้อง|ทนาย|ภาษี|ตรวจสอบ|ออดิท|audit|compliance|regulator|regulatory|government|official|authority|approval|approve|permit|license|licence|certificate|certification|application|document|paperwork|visa|immigration|consulate|embassy|court|legal|lawsuit|litigation|tax|inheritance|insurance|contract|agreement|evidence|deadline/i]);
  const employment = has([/สมัครงาน|สัมภาษณ์|เรซูเม่|resume|cv|งานใหม่|รับงาน|รับข้อเสนอ|ข้อเสนองาน|job\s*offer|offer\s*letter|interview|employment|employer|employee|workplace|ตำแหน่ง|เลื่อนตำแหน่ง|promotion|promote|title|เงินเดือน|salary|compensation|โบนัส|bonus|ปรับเงินเดือน|เจ้านาย|หัวหน้า|boss|manager|ลาออก|resign|resignation|ย้ายงาน|transfer|probation|ทดลองงาน|hiring|hire|recruit|recruitment/i]) && !hiringDelegation && !teamCompensation && !partnerDueDiligence;
  const advancedTiming = has([
    /secondary\s*progress|progression|progressed|primary\s*direction|solar\s*arc|annual\s*profection|profection|solar\s*return|lunar\s*return|eclipse|time[-\s]?lord|distribution|tajika|varshaphala|varsha\s*phala|jaimini|ashtottari|kalachakra|chara\s*dasha|yogini|naisargika/i,
    /โปรเกรส|โพรเกรส|ดวงจรปีเกิด|ดวงจรวันเกิด|solar\s*return|โซลาร์\s*รีเทิร์น|ลูนาร์\s*รีเทิร์น|คราส|สุริยุปราคา|จันทรุปราคา|ทักษาจร/i,
  ]);
  const horary = has([/horary|prashna|prasna|prashnam|prasnam|ดวงคำถาม|โหรายาม|ถามยาม|ตั้งดวงถาม|ตั้งดวงคำถาม/i]);
  const electional = has([/electional|election|date\s*selection|muhurta|muhūrta|muhurtham|เลือกวัน|เลือกเวลา|วางฤกษ์|หาฤกษ์|ฤกษ์|มูหูรตะ|มูฮูรตะ/i]);
  const mundane = has([/mundane|event\s*chart|ingress|comet|ดวงเมือง|ดวงประเทศ|เหตุการณ์โลก|เศรษฐกิจโลก|สงคราม|ภัยธรรมชาติ|การเมืองโลก|ดาวหาง/i]);
  const rectification = has([/rectification|birth\s*time\s*correction|แก้เวลาเกิด|ปรับเวลาเกิด|หาเวลาเกิด|ตรวจเวลาเกิด/i]);
  const locality = has([/astrocartography|relocation\s*chart|locality|geodetic|แผนที่ดวง|เส้นดวง|ทำเลชีวิต/i]);
  const medicalSpecialty = has([/medical|decumbiture|diagnos|surgery|treatment|hospital|procedure|ผ่าตัด|รักษา|วินิจฉัย|โรงพยาบาล|หัตถการ/i]);
  const specialty = advancedTiming || horary || electional || mundane || rectification || locality || medicalSpecialty;
  const westernSpecialty = specialty;
  const pair = births.length > 1;
  const noTime = births.some((b) => !b.hasTime);
  return {
    timing,
		    relationship: relationship && !taxAccounting && !loanCreditDebt && !insuranceClaim,
    money,
    career,
    health: health && !insuranceClaim,
    travel,
    home,
    children,
    study,
    education,
    people,
    risk,
    fortune,
    windfall,
    creator,
    reputation,
	    retention: retentionIntent && !unitEconomics && !loanCreditDebt && !insuranceClaim,
	    pricing,
				    marketing: marketing && !salesTeamQa && !cashflowBudget && !unitEconomics && !supplyInventory && !taxAccounting && !loanCreditDebt && !insuranceClaim,
				    supportOps: supportOps && !salesTeamQa && !cashflowBudget && !unitEconomics && !supplyInventory && !taxAccounting && !loanCreditDebt && !insuranceClaim,
			    techProduct: techProduct && !cashflowBudget && !unitEconomics && !supplyInventory && !taxAccounting && !loanCreditDebt && !insuranceClaim,
    industryFit,
	    customerFit,
	    offerFit,
	    deliveryModel,
		    valueLadder,
		    scopeBoundary,
			    salesScript,
			    salesTeamQa,
					    cashflowBudget,
					    unitEconomics,
					    supplyInventory,
					    taxAccounting,
					    loanCreditDebt,
					    insuranceClaim,
			    qualificationGate,
		    caseStudyProof,
					    customerSuccess: customerSuccess && !salesTeamQa && !cashflowBudget && !unitEconomics && !supplyInventory && !taxAccounting && !loanCreditDebt && !insuranceClaim,
					    partnershipProgram: partnershipProgram && !salesTeamQa && !cashflowBudget && !unitEconomics && !supplyInventory && !taxAccounting && !loanCreditDebt && !insuranceClaim,
					    hiringDelegation: hiringDelegation && !salesTeamQa && !cashflowBudget && !unitEconomics && !supplyInventory && !taxAccounting && !loanCreditDebt && !insuranceClaim,
					    teamCompensation: teamCompensation && !salesTeamQa && !cashflowBudget && !unitEconomics && !supplyInventory && !taxAccounting && !loanCreditDebt && !insuranceClaim,
			    partnerDueDiligence,
	    talent,
    decision,
    remedy,
    validation,
    interaction,
    business: business && !insuranceClaim,
    authority: authority && !insuranceClaim,
				    employment: employment && !salesTeamQa && !cashflowBudget && !unitEconomics && !supplyInventory && !taxAccounting && !loanCreditDebt && !insuranceClaim,
    property,
    pair,
    noTime,
    advancedTiming,
    horary,
    electional,
    mundane,
    rectification,
    locality,
    specialty,
    westernSpecialty,
						    general: !(timing || relationship || money || career || health || travel || home || children || study || education || people || risk || fortune || windfall || creator || reputation || retentionIntent || pricing || marketing || supportOps || techProduct || industryFit || customerFit || offerFit || deliveryModel || valueLadder || scopeBoundary || salesScript || salesTeamQa || cashflowBudget || unitEconomics || supplyInventory || taxAccounting || loanCreditDebt || insuranceClaim || qualificationGate || caseStudyProof || customerSuccess || partnershipProgram || hiringDelegation || teamCompensation || partnerDueDiligence || talent || decision || remedy || validation || interaction || business || authority || employment || property || advancedTiming || horary || electional || mundane || rectification || locality),
  };
}

function pushUnique(list: string[], ...files: string[]): void {
  for (const file of files) {
    if (file && !list.includes(file)) list.push(file);
  }
}

function prioritizeAfterMethod(list: string[], ...files: string[]): void {
  const present = files.filter((file) => list.includes(file));
  if (!present.length) return;
  for (const file of present) {
    const idx = list.indexOf(file);
    if (idx >= 0) list.splice(idx, 1);
  }
  const methodIdx = list.indexOf("00-method.md");
  list.splice(methodIdx >= 0 ? methodIdx + 1 : 0, 0, ...present);
}

function prioritizeToFront(list: string[], ...files: string[]): void {
  const present = files.filter((file) => list.includes(file));
  if (!present.length) return;
  for (const file of present) {
    const idx = list.indexOf(file);
    if (idx >= 0) list.splice(idx, 1);
  }
  list.unshift(...present);
}

function selectCanonFilesForPrompt(science: ScienceId, question: string, births: BirthData[]): string[] | undefined {
  if (science === "bazi") return undefined;
  const intent = canonIntentFromQuestion(question, births);
  const files: string[] = [];
  pushUnique(files, ...(CANON_ROUTER_BASE_FILES[science] || []));

  if (science === "qizheng") {
			    if (intent.timing || intent.relationship || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.health || intent.children || intent.education || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.authority || intent.employment || intent.property || intent.specialty || intent.general) pushUnique(files, "10-degree-limit-specificity.md", "05-xingxian.md");
    if (intent.timing) pushUnique(files, "19-timing-forecast-specificity.md");
    if (intent.specialty) pushUnique(files, "24-specialty-scope-electional-guard.md", "19-timing-forecast-specificity.md", "20-decision-action-guidance-specificity.md", "08-topic-evidence-gates.md");
    if (intent.health) pushUnique(files, "29-health-surgery-recovery-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.travel) pushUnique(files, "32-travel-foreign-relocation-specificity.md", "14-home-family-travel-study-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.children) pushUnique(files, "31-children-pregnancy-creativity-specificity.md", "14-home-family-travel-study-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "17-fortune-fame-inner-life-specificity.md");
    if (intent.education) pushUnique(files, "30-education-exam-writing-specificity.md", "14-home-family-travel-study-specificity.md", "26-authority-document-legal-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "17-fortune-fame-inner-life-specificity.md");
    if (intent.windfall) pushUnique(files, "34-windfall-speculation-cash-leak-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.creator && !intent.marketing) pushUnique(files, "35-creator-audience-sales-conversion-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.reputation) pushUnique(files, "36-reputation-public-trust-crisis-specificity.md", "17-fortune-fame-inner-life-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.retention) pushUnique(files, "37-retention-refund-subscription-churn-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.pricing) pushUnique(files, "38-pricing-offer-promotion-upsell-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.marketing) pushUnique(files, "39-marketing-acquisition-campaign-funnel-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.supportOps) pushUnique(files, "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.techProduct) pushUnique(files, "41-technology-product-platform-ai-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.industryFit) pushUnique(files, "42-career-industry-market-fit-specificity.md", "12-career-wealth-health-specificity.md", "18-temperament-talent-appearance-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.customerFit) pushUnique(files, "43-customer-audience-persona-fit-specificity.md", "15-people-network-collaboration-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "42-career-industry-market-fit-specificity.md", "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.offerFit) pushUnique(files, "44-product-service-offer-fit-specificity.md", "42-career-industry-market-fit-specificity.md", "43-customer-audience-persona-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.deliveryModel) pushUnique(files, "45-delivery-model-capacity-specificity.md", "44-product-service-offer-fit-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.valueLadder) pushUnique(files, "46-premium-low-ticket-value-ladder-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "44-product-service-offer-fit-specificity.md", "43-customer-audience-persona-fit-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.scopeBoundary) pushUnique(files, "47-guarantee-scope-boundary-specificity.md", "37-retention-refund-subscription-churn-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "44-product-service-offer-fit-specificity.md", "45-delivery-model-capacity-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.salesScript) pushUnique(files, "48-sales-page-webinar-consult-script-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "43-customer-audience-persona-fit-specificity.md", "44-product-service-offer-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "47-guarantee-scope-boundary-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.qualificationGate) pushUnique(files, "49-onboarding-qualification-form-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "43-customer-audience-persona-fit-specificity.md", "44-product-service-offer-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.caseStudyProof) pushUnique(files, "50-case-study-testimonial-proof-library-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "43-customer-audience-persona-fit-specificity.md", "48-sales-page-webinar-consult-script-specificity.md", "47-guarantee-scope-boundary-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
		    if (intent.customerSuccess) pushUnique(files, "51-customer-success-renewal-playbook-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "50-case-study-testimonial-proof-library-specificity.md", "43-customer-audience-persona-fit-specificity.md", "45-delivery-model-capacity-specificity.md", "47-guarantee-scope-boundary-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
		    if (intent.partnershipProgram) pushUnique(files, "52-partnership-affiliate-referral-program-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "43-customer-audience-persona-fit-specificity.md", "49-onboarding-qualification-form-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
		    if (intent.hiringDelegation) pushUnique(files, "53-hiring-delegation-org-design-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "49-onboarding-qualification-form-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
		    if (intent.teamCompensation) pushUnique(files, "54-team-compensation-incentive-performance-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
				    if (intent.partnerDueDiligence) pushUnique(files, "55-partner-due-diligence-conflict-termination-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
				    if (intent.salesTeamQa) pushUnique(files, "56-sales-team-pipeline-qa-followup-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "49-onboarding-qualification-form-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
					    if (intent.cashflowBudget) pushUnique(files, "57-cashflow-runway-budget-cost-control-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
						    if (intent.unitEconomics) pushUnique(files, "58-unit-economics-profit-breakeven-payback-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
						    if (intent.supplyInventory) pushUnique(files, "59-inventory-procurement-supplier-stock-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "32-travel-foreign-relocation-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
						    if (intent.taxAccounting) pushUnique(files, "60-tax-accounting-bookkeeping-compliance-specificity.md", "26-authority-document-legal-specificity.md", "25-business-investment-contract-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
						    if (intent.loanCreditDebt) pushUnique(files, "61-loan-credit-debt-refinance-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
						    if (intent.insuranceClaim) pushUnique(files, "62-insurance-claim-policy-coverage-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.business) pushUnique(files, "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.authority) pushUnique(files, "26-authority-document-legal-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.employment) pushUnique(files, "27-employment-job-offer-specificity.md", "12-career-wealth-health-specificity.md", "15-people-network-collaboration-specificity.md", "26-authority-document-legal-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.property) pushUnique(files, "28-property-vehicle-relocation-specificity.md", "14-home-family-travel-study-specificity.md", "12-career-wealth-health-specificity.md", "26-authority-document-legal-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
	    if (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget) pushUnique(files, "33-relationship-status-marriage-breakup-specificity.md", "11-pair-relationship-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.pair) pushUnique(files, "11-pair-relationship-specificity.md");
			    if (intent.relationship || intent.career || intent.money || intent.health || intent.travel || intent.home || intent.children || intent.study || intent.education || intent.people || intent.risk || intent.fortune || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property || intent.specialty || intent.general) pushUnique(files, "10-degree-limit-specificity.md", "03-geju.md", "07-sanfang-pair-weighting.md");
			    if (intent.career || intent.money || intent.windfall || intent.creator || intent.marketing || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.teamCompensation || intent.salesTeamQa || intent.health || intent.home || intent.risk || intent.timing) pushUnique(files, "12-career-wealth-health-specificity.md");
    if (intent.home || intent.travel || intent.children || intent.study || intent.education) pushUnique(files, "14-home-family-travel-study-specificity.md");
    if (intent.people) pushUnique(files, "15-people-network-collaboration-specificity.md");
    if (intent.risk) pushUnique(files, "16-risk-dispute-hidden-pressure-specificity.md");
    if (intent.fortune) pushUnique(files, "17-fortune-fame-inner-life-specificity.md");
    if (intent.talent) pushUnique(files, "18-temperament-talent-appearance-specificity.md", "13-natal-life-direction-specificity.md");
    if (intent.decision) pushUnique(files, "20-decision-action-guidance-specificity.md", "13-natal-life-direction-specificity.md");
    if (intent.remedy) pushUnique(files, "21-remedy-mitigation-specificity.md", "13-natal-life-direction-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md");
    if (intent.validation) pushUnique(files, "22-validation-past-event-specificity.md", "13-natal-life-direction-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.interaction) pushUnique(files, "23-star-interaction-specificity.md", "10-degree-limit-specificity.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md");
    if (intent.general) pushUnique(files, "13-natal-life-direction-specificity.md");
			    if (intent.money || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.career || intent.health || intent.travel || intent.home || intent.children || intent.study || intent.education || intent.people || intent.risk || intent.fortune || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property || intent.specialty || intent.general) pushUnique(files, "04-xingqing.md");
    if (intent.pair) pushUnique(files, "07-sanfang-pair-weighting.md");
    if (intent.timing && !files.includes("05-xingxian.md")) pushUnique(files, "05-xingxian.md");
    // canon verbatim 張果星宗 (additive · public domain): 十干化曜 (field data.huaYao มีทุกดวง) + 星情總論/歌斷 11 曜
    // เรียก prioritizeAfterMethod ก่อน chain ตาม intent ด้านล่าง → ไฟล์ใหม่จะต่อท้าย topical packs ที่ถูก prioritize ทีหลัง (ไม่แซงของเดิม)
    pushUnique(files, "25-shigan-huayao.md", "26-xingqing-verbatim-clean.md");
    prioritizeAfterMethod(files, "25-shigan-huayao.md");
    if (intent.interaction || intent.talent || intent.general || intent.fortune || intent.validation) {
      prioritizeAfterMethod(files, "25-shigan-huayao.md", "26-xingqing-verbatim-clean.md");
    }
		    if (intent.pair) {
		      prioritizeAfterMethod(files, "33-relationship-status-marriage-breakup-specificity.md", "11-pair-relationship-specificity.md", "07-sanfang-pair-weighting.md", "10-degree-limit-specificity.md", "23-star-interaction-specificity.md", "22-validation-past-event-specificity.md", "21-remedy-mitigation-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "01-enyong-12gong.md", "02-miaowang.md", "05-xingxian.md");
			    } else if (intent.insuranceClaim) {
			      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "62-insurance-claim-policy-coverage-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
			    } else if (intent.loanCreditDebt) {
			      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "61-loan-credit-debt-refinance-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
			    } else if (intent.cashflowBudget) {
		      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "57-cashflow-runway-budget-cost-control-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
		    } else if (intent.unitEconomics) {
		      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "58-unit-economics-profit-breakeven-payback-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
			    } else if (intent.supplyInventory) {
			      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "59-inventory-procurement-supplier-stock-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "32-travel-foreign-relocation-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
			    } else if (intent.taxAccounting) {
			      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "60-tax-accounting-bookkeeping-compliance-specificity.md", "26-authority-document-legal-specificity.md", "25-business-investment-contract-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
			    } else if (intent.salesTeamQa) {
		      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "56-sales-team-pipeline-qa-followup-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "49-onboarding-qualification-form-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
		    } else if (intent.teamCompensation) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "54-team-compensation-incentive-performance-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.partnerDueDiligence) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "55-partner-due-diligence-conflict-termination-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.partnershipProgram) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "52-partnership-affiliate-referral-program-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "43-customer-audience-persona-fit-specificity.md", "49-onboarding-qualification-form-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.hiringDelegation) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "53-hiring-delegation-org-design-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "49-onboarding-qualification-form-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "33-relationship-status-marriage-breakup-specificity.md", "11-pair-relationship-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.customerSuccess) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "51-customer-success-renewal-playbook-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "50-case-study-testimonial-proof-library-specificity.md", "43-customer-audience-persona-fit-specificity.md", "45-delivery-model-capacity-specificity.md", "47-guarantee-scope-boundary-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.health) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "29-health-surgery-recovery-specificity.md", "24-specialty-scope-electional-guard.md", "21-remedy-mitigation-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.specialty) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "24-specialty-scope-electional-guard.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "12-career-wealth-health-specificity.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.scopeBoundary) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "47-guarantee-scope-boundary-specificity.md", "37-retention-refund-subscription-churn-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "44-product-service-offer-fit-specificity.md", "45-delivery-model-capacity-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.salesScript) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "48-sales-page-webinar-consult-script-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "43-customer-audience-persona-fit-specificity.md", "44-product-service-offer-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "47-guarantee-scope-boundary-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.qualificationGate) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "49-onboarding-qualification-form-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "43-customer-audience-persona-fit-specificity.md", "44-product-service-offer-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.caseStudyProof) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "50-case-study-testimonial-proof-library-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "43-customer-audience-persona-fit-specificity.md", "48-sales-page-webinar-consult-script-specificity.md", "47-guarantee-scope-boundary-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.customerSuccess) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "51-customer-success-renewal-playbook-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "50-case-study-testimonial-proof-library-specificity.md", "43-customer-audience-persona-fit-specificity.md", "45-delivery-model-capacity-specificity.md", "47-guarantee-scope-boundary-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.deliveryModel) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "45-delivery-model-capacity-specificity.md", "44-product-service-offer-fit-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.valueLadder) {
	      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "46-premium-low-ticket-value-ladder-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "44-product-service-offer-fit-specificity.md", "43-customer-audience-persona-fit-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
	    } else if (intent.supportOps && !intent.retention && !intent.pricing && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.techProduct && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "41-technology-product-platform-ai-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.offerFit && !intent.deliveryModel && !intent.retention && !intent.pricing && !intent.marketing && !intent.techProduct && !intent.customerFit) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "44-product-service-offer-fit-specificity.md", "42-career-industry-market-fit-specificity.md", "43-customer-audience-persona-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.industryFit && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "42-career-industry-market-fit-specificity.md", "12-career-wealth-health-specificity.md", "18-temperament-talent-appearance-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.customerFit && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.industryFit && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "43-customer-audience-persona-fit-specificity.md", "15-people-network-collaboration-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "42-career-industry-market-fit-specificity.md", "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.children && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "31-children-pregnancy-creativity-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "14-home-family-travel-study-specificity.md", "17-fortune-fame-inner-life-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.education && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "30-education-exam-writing-specificity.md", "20-decision-action-guidance-specificity.md", "14-home-family-travel-study-specificity.md", "26-authority-document-legal-specificity.md", "17-fortune-fame-inner-life-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.employment) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "27-employment-job-offer-specificity.md", "20-decision-action-guidance-specificity.md", "12-career-wealth-health-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.property && !intent.marketing) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "28-property-vehicle-relocation-specificity.md", "20-decision-action-guidance-specificity.md", "14-home-family-travel-study-specificity.md", "12-career-wealth-health-specificity.md", "26-authority-document-legal-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.travel && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "32-travel-foreign-relocation-specificity.md", "20-decision-action-guidance-specificity.md", "14-home-family-travel-study-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.windfall) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "34-windfall-speculation-cash-leak-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "17-fortune-fame-inner-life-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.creator && !intent.marketing && !intent.reputation && !intent.retention && !intent.pricing) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.reputation && !intent.retention) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "17-fortune-fame-inner-life-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.retention) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "37-retention-refund-subscription-churn-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.marketing) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "39-marketing-acquisition-campaign-funnel-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.pricing) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.authority) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "26-authority-document-legal-specificity.md", "25-business-investment-contract-specificity.md", "20-decision-action-guidance-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.business) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "25-business-investment-contract-specificity.md", "20-decision-action-guidance-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.interaction) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "23-star-interaction-specificity.md", "08-topic-evidence-gates.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "04-xingqing.md", "05-xingxian.md");
    } else if (intent.validation) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "22-validation-past-event-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "13-natal-life-direction-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.remedy) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "11-pair-relationship-specificity.md", "14-home-family-travel-study-specificity.md", "17-fortune-fame-inner-life-specificity.md", "13-natal-life-direction-specificity.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.decision) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "12-career-wealth-health-specificity.md", "11-pair-relationship-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "14-home-family-travel-study-specificity.md", "13-natal-life-direction-specificity.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.people) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "08-topic-evidence-gates.md", "15-people-network-collaboration-specificity.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.risk) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "08-topic-evidence-gates.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.talent) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "08-topic-evidence-gates.md", "18-temperament-talent-appearance-specificity.md", "13-natal-life-direction-specificity.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.fortune) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "08-topic-evidence-gates.md", "17-fortune-fame-inner-life-specificity.md", "13-natal-life-direction-specificity.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if ((intent.travel || intent.children || intent.study || intent.education || intent.home) && !intent.career && !intent.money && !intent.health) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "08-topic-evidence-gates.md", "14-home-family-travel-study-specificity.md", "07-sanfang-pair-weighting.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.career || intent.money || intent.health || intent.home || intent.timing) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "19-timing-forecast-specificity.md", "08-topic-evidence-gates.md", "12-career-wealth-health-specificity.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else if (intent.general) {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "08-topic-evidence-gates.md", "13-natal-life-direction-specificity.md", "09-star-nature-operational-summary.md", "05-xingxian.md");
    } else {
      prioritizeAfterMethod(files, "10-degree-limit-specificity.md", "08-topic-evidence-gates.md", "09-star-nature-operational-summary.md");
    }
    return files;
  }

  if (science === "ziwei") {
	    if (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget) pushUnique(files, "33-relationship-status-marriage-breakup-specificity.md", "11-pair-relationship-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.pair) pushUnique(files, "11-pair-relationship-specificity.md");
    if (intent.timing) pushUnique(files, "19-timing-forecast-specificity.md");
    if (intent.specialty) pushUnique(files, "24-specialty-scope-electional-guard.md", "19-timing-forecast-specificity.md", "20-decision-action-guidance-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.health) pushUnique(files, "29-health-surgery-recovery-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.travel) pushUnique(files, "32-travel-foreign-relocation-specificity.md", "14-home-family-travel-study-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.children) pushUnique(files, "31-children-pregnancy-creativity-specificity.md", "14-home-family-travel-study-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.education) pushUnique(files, "30-education-exam-writing-specificity.md", "14-home-family-travel-study-specificity.md", "26-authority-document-legal-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.windfall) pushUnique(files, "34-windfall-speculation-cash-leak-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.creator && !intent.marketing) pushUnique(files, "35-creator-audience-sales-conversion-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "30-education-exam-writing-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.reputation) pushUnique(files, "36-reputation-public-trust-crisis-specificity.md", "17-fortune-fame-inner-life-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.retention) pushUnique(files, "37-retention-refund-subscription-churn-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.pricing) pushUnique(files, "38-pricing-offer-promotion-upsell-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.marketing) pushUnique(files, "39-marketing-acquisition-campaign-funnel-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.supportOps) pushUnique(files, "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "21-remedy-mitigation-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.techProduct) pushUnique(files, "41-technology-product-platform-ai-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.industryFit) pushUnique(files, "42-career-industry-market-fit-specificity.md", "12-career-wealth-health-specificity.md", "18-temperament-talent-appearance-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
	    if (intent.customerFit) pushUnique(files, "43-customer-audience-persona-fit-specificity.md", "15-people-network-collaboration-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "42-career-industry-market-fit-specificity.md", "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
	    if (intent.offerFit) pushUnique(files, "44-product-service-offer-fit-specificity.md", "42-career-industry-market-fit-specificity.md", "43-customer-audience-persona-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
	    if (intent.deliveryModel) pushUnique(files, "45-delivery-model-capacity-specificity.md", "44-product-service-offer-fit-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
	    if (intent.valueLadder) pushUnique(files, "46-premium-low-ticket-value-ladder-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "44-product-service-offer-fit-specificity.md", "43-customer-audience-persona-fit-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
	    if (intent.scopeBoundary) pushUnique(files, "47-guarantee-scope-boundary-specificity.md", "37-retention-refund-subscription-churn-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "44-product-service-offer-fit-specificity.md", "45-delivery-model-capacity-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
	    if (intent.salesScript) pushUnique(files, "48-sales-page-webinar-consult-script-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "43-customer-audience-persona-fit-specificity.md", "44-product-service-offer-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "47-guarantee-scope-boundary-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
	    if (intent.qualificationGate) pushUnique(files, "49-onboarding-qualification-form-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "43-customer-audience-persona-fit-specificity.md", "44-product-service-offer-fit-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
	    if (intent.caseStudyProof) pushUnique(files, "50-case-study-testimonial-proof-library-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "35-creator-audience-sales-conversion-specificity.md", "43-customer-audience-persona-fit-specificity.md", "48-sales-page-webinar-consult-script-specificity.md", "47-guarantee-scope-boundary-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
		    if (intent.customerSuccess) pushUnique(files, "51-customer-success-renewal-playbook-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "50-case-study-testimonial-proof-library-specificity.md", "43-customer-audience-persona-fit-specificity.md", "45-delivery-model-capacity-specificity.md", "47-guarantee-scope-boundary-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
		    if (intent.partnershipProgram) pushUnique(files, "52-partnership-affiliate-referral-program-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "43-customer-audience-persona-fit-specificity.md", "49-onboarding-qualification-form-specificity.md", "38-pricing-offer-promotion-upsell-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
		    if (intent.hiringDelegation) pushUnique(files, "53-hiring-delegation-org-design-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "49-onboarding-qualification-form-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
		    if (intent.teamCompensation) pushUnique(files, "54-team-compensation-incentive-performance-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
				    if (intent.partnerDueDiligence) pushUnique(files, "55-partner-due-diligence-conflict-termination-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "47-guarantee-scope-boundary-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
			    if (intent.salesTeamQa) pushUnique(files, "56-sales-team-pipeline-qa-followup-specificity.md", "15-people-network-collaboration-specificity.md", "25-business-investment-contract-specificity.md", "49-onboarding-qualification-form-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "36-reputation-public-trust-crisis-specificity.md", "12-career-wealth-health-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
				    if (intent.cashflowBudget) pushUnique(files, "57-cashflow-runway-budget-cost-control-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
				    if (intent.unitEconomics) pushUnique(files, "58-unit-economics-profit-breakeven-payback-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
				    if (intent.supplyInventory) pushUnique(files, "59-inventory-procurement-supplier-stock-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "32-travel-foreign-relocation-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
				    if (intent.taxAccounting) pushUnique(files, "60-tax-accounting-bookkeeping-compliance-specificity.md", "26-authority-document-legal-specificity.md", "25-business-investment-contract-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
				    if (intent.loanCreditDebt) pushUnique(files, "61-loan-credit-debt-refinance-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
				    if (intent.insuranceClaim) pushUnique(files, "62-insurance-claim-policy-coverage-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.business) pushUnique(files, "25-business-investment-contract-specificity.md", "12-career-wealth-health-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.authority) pushUnique(files, "26-authority-document-legal-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.employment) pushUnique(files, "27-employment-job-offer-specificity.md", "12-career-wealth-health-specificity.md", "15-people-network-collaboration-specificity.md", "26-authority-document-legal-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.property) pushUnique(files, "28-property-vehicle-relocation-specificity.md", "14-home-family-travel-study-specificity.md", "12-career-wealth-health-specificity.md", "26-authority-document-legal-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md");
    if (intent.decision) pushUnique(files, "20-decision-action-guidance-specificity.md", "13-natal-life-direction-specificity.md");
    if (intent.remedy) pushUnique(files, "21-remedy-mitigation-specificity.md", "13-natal-life-direction-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md");
    if (intent.validation) pushUnique(files, "22-validation-past-event-specificity.md", "13-natal-life-direction-specificity.md", "19-timing-forecast-specificity.md");
    if (intent.interaction) pushUnique(files, "23-star-sihua-interaction-specificity.md", "10-palace-sihua-specificity.md", "04-feixing-cetian-topic-rules.md");
			    if (intent.relationship || intent.career || intent.money || intent.health || intent.travel || intent.home || intent.children || intent.study || intent.education || intent.people || intent.risk || intent.fortune || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property || intent.specialty || intent.timing || intent.general) pushUnique(files, "10-palace-sihua-specificity.md", "04-feixing-cetian-topic-rules.md");
			    if (intent.career || intent.money || intent.windfall || intent.creator || intent.marketing || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.teamCompensation || intent.salesTeamQa || intent.health || intent.home || intent.risk || intent.timing) pushUnique(files, "12-career-wealth-health-specificity.md");
    if (intent.home || intent.travel || intent.children || intent.study || intent.education) pushUnique(files, "14-home-family-travel-study-specificity.md");
    if (intent.people) pushUnique(files, "15-people-network-collaboration-specificity.md");
    if (intent.risk) pushUnique(files, "16-risk-dispute-hidden-pressure-specificity.md");
    if (intent.fortune) pushUnique(files, "17-fortune-fame-inner-life-specificity.md");
    if (intent.talent) pushUnique(files, "18-temperament-talent-appearance-specificity.md", "13-natal-life-direction-specificity.md");
    if (intent.general) pushUnique(files, "13-natal-life-direction-specificity.md");
    if (intent.timing || intent.relationship || intent.pair || intent.health || intent.education || intent.specialty) pushUnique(files, "06-liuyue-liuri-sihua-rules.md");
			    if (intent.timing || intent.general || intent.health || intent.career || intent.money || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.home || intent.travel || intent.children || intent.study || intent.education || intent.people || intent.risk || intent.fortune || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property || intent.specialty) pushUnique(files, "08-quanshu-limit-special-rules.md");
	    if (intent.general || (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget) || intent.timing || intent.validation) pushUnique(files, "ziwei-quanshu-core.md");
    // canon verbatim 紫微斗數全書卷一 (additive · public domain): 星垣論 + 諸星問答論 + 得地合格訣/失陷破格訣
    if (intent.general || intent.relationship || intent.pair || intent.timing || intent.validation || intent.interaction || intent.talent || intent.fortune) pushUnique(files, "07-quanshu-xingyuan-wenda.md");
    if (intent.interaction || intent.talent) prioritizeAfterMethod(files, "07-quanshu-xingyuan-wenda.md");
			    if (intent.pair || ((intent.timing || (intent.relationship && !intent.retention)) && !intent.windfall && !intent.creator && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.industryFit && !intent.customerFit && !intent.offerFit && !intent.deliveryModel && !intent.valueLadder && !intent.scopeBoundary && !intent.salesScript && !intent.salesTeamQa && !intent.cashflowBudget && !intent.qualificationGate && !intent.caseStudyProof && !intent.customerSuccess && !intent.partnershipProgram && !intent.hiringDelegation && !intent.teamCompensation && !intent.partnerDueDiligence && !intent.business && !intent.authority && !intent.employment && !intent.property && !intent.health && !intent.children && !intent.education)) {
      prioritizeAfterMethod(
        files,
        "33-relationship-status-marriage-breakup-specificity.md",
        "11-pair-relationship-specificity.md",
        "23-star-sihua-interaction-specificity.md",
        "22-validation-past-event-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "09-evidence-gates-topic-router.md",
        "24-specialty-scope-electional-guard.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "18-temperament-talent-appearance-specificity.md",
        "12-career-wealth-health-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
		    } else if (intent.insuranceClaim) {
		      prioritizeAfterMethod(files, "09-evidence-gates-topic-router.md", "10-palace-sihua-specificity.md", "62-insurance-claim-policy-coverage-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md", "04-feixing-cetian-topic-rules.md", "08-quanshu-limit-special-rules.md");
		    } else if (intent.loanCreditDebt) {
		      prioritizeAfterMethod(files, "09-evidence-gates-topic-router.md", "10-palace-sihua-specificity.md", "61-loan-credit-debt-refinance-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "25-business-investment-contract-specificity.md", "26-authority-document-legal-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md", "04-feixing-cetian-topic-rules.md", "08-quanshu-limit-special-rules.md");
		    } else if (intent.cashflowBudget) {
		      prioritizeAfterMethod(files, "09-evidence-gates-topic-router.md", "10-palace-sihua-specificity.md", "57-cashflow-runway-budget-cost-control-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md", "04-feixing-cetian-topic-rules.md", "08-quanshu-limit-special-rules.md");
		    } else if (intent.unitEconomics) {
		      prioritizeAfterMethod(files, "09-evidence-gates-topic-router.md", "10-palace-sihua-specificity.md", "58-unit-economics-profit-breakeven-payback-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md", "04-feixing-cetian-topic-rules.md", "08-quanshu-limit-special-rules.md");
		    } else if (intent.supplyInventory) {
		      prioritizeAfterMethod(files, "09-evidence-gates-topic-router.md", "10-palace-sihua-specificity.md", "59-inventory-procurement-supplier-stock-specificity.md", "25-business-investment-contract-specificity.md", "40-service-support-operations-fulfillment-specificity.md", "49-onboarding-qualification-form-specificity.md", "15-people-network-collaboration-specificity.md", "32-travel-foreign-relocation-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "17-fortune-fame-inner-life-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md", "04-feixing-cetian-topic-rules.md", "08-quanshu-limit-special-rules.md");
		    } else if (intent.taxAccounting) {
		      prioritizeAfterMethod(files, "09-evidence-gates-topic-router.md", "10-palace-sihua-specificity.md", "60-tax-accounting-bookkeeping-compliance-specificity.md", "26-authority-document-legal-specificity.md", "25-business-investment-contract-specificity.md", "16-risk-dispute-hidden-pressure-specificity.md", "15-people-network-collaboration-specificity.md", "12-career-wealth-health-specificity.md", "20-decision-action-guidance-specificity.md", "19-timing-forecast-specificity.md", "06-liuyue-liuri-sihua-rules.md", "04-feixing-cetian-topic-rules.md", "08-quanshu-limit-special-rules.md");
		    } else if (intent.salesTeamQa) {
		      prioritizeAfterMethod(
		        files,
		        "09-evidence-gates-topic-router.md",
		        "10-palace-sihua-specificity.md",
		        "56-sales-team-pipeline-qa-followup-specificity.md",
		        "15-people-network-collaboration-specificity.md",
		        "25-business-investment-contract-specificity.md",
		        "49-onboarding-qualification-form-specificity.md",
		        "40-service-support-operations-fulfillment-specificity.md",
		        "36-reputation-public-trust-crisis-specificity.md",
		        "16-risk-dispute-hidden-pressure-specificity.md",
		        "17-fortune-fame-inner-life-specificity.md",
		        "12-career-wealth-health-specificity.md",
		        "20-decision-action-guidance-specificity.md",
		        "19-timing-forecast-specificity.md",
		        "06-liuyue-liuri-sihua-rules.md",
		        "04-feixing-cetian-topic-rules.md",
		        "08-quanshu-limit-special-rules.md",
		      );
		    } else if (intent.teamCompensation) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "54-team-compensation-incentive-performance-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "47-guarantee-scope-boundary-specificity.md",
	        "40-service-support-operations-fulfillment-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "17-fortune-fame-inner-life-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.partnerDueDiligence) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "55-partner-due-diligence-conflict-termination-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "26-authority-document-legal-specificity.md",
	        "47-guarantee-scope-boundary-specificity.md",
	        "40-service-support-operations-fulfillment-specificity.md",
	        "36-reputation-public-trust-crisis-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "17-fortune-fame-inner-life-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.partnershipProgram) {
	      prioritizeAfterMethod(
	        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "52-partnership-affiliate-referral-program-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "25-business-investment-contract-specificity.md",
        "43-customer-audience-persona-fit-specificity.md",
        "49-onboarding-qualification-form-specificity.md",
        "38-pricing-offer-promotion-upsell-specificity.md",
        "47-guarantee-scope-boundary-specificity.md",
        "40-service-support-operations-fulfillment-specificity.md",
        "36-reputation-public-trust-crisis-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "12-career-wealth-health-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.customerSuccess) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "51-customer-success-renewal-playbook-specificity.md",
        "40-service-support-operations-fulfillment-specificity.md",
        "49-onboarding-qualification-form-specificity.md",
        "50-case-study-testimonial-proof-library-specificity.md",
        "43-customer-audience-persona-fit-specificity.md",
        "45-delivery-model-capacity-specificity.md",
        "47-guarantee-scope-boundary-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "25-business-investment-contract-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "12-career-wealth-health-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.health) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "29-health-surgery-recovery-specificity.md",
        "24-specialty-scope-electional-guard.md",
        "21-remedy-mitigation-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.specialty) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "24-specialty-scope-electional-guard.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "12-career-wealth-health-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
	    } else if (intent.scopeBoundary) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "47-guarantee-scope-boundary-specificity.md",
	        "37-retention-refund-subscription-churn-specificity.md",
	        "38-pricing-offer-promotion-upsell-specificity.md",
	        "44-product-service-offer-fit-specificity.md",
	        "45-delivery-model-capacity-specificity.md",
	        "40-service-support-operations-fulfillment-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "26-authority-document-legal-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.salesScript) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "48-sales-page-webinar-consult-script-specificity.md",
	        "35-creator-audience-sales-conversion-specificity.md",
	        "43-customer-audience-persona-fit-specificity.md",
	        "44-product-service-offer-fit-specificity.md",
	        "38-pricing-offer-promotion-upsell-specificity.md",
	        "47-guarantee-scope-boundary-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "17-fortune-fame-inner-life-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.qualificationGate) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "49-onboarding-qualification-form-specificity.md",
	        "47-guarantee-scope-boundary-specificity.md",
	        "40-service-support-operations-fulfillment-specificity.md",
	        "43-customer-audience-persona-fit-specificity.md",
	        "44-product-service-offer-fit-specificity.md",
	        "38-pricing-offer-promotion-upsell-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "26-authority-document-legal-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.caseStudyProof) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "50-case-study-testimonial-proof-library-specificity.md",
	        "36-reputation-public-trust-crisis-specificity.md",
	        "35-creator-audience-sales-conversion-specificity.md",
	        "43-customer-audience-persona-fit-specificity.md",
	        "48-sales-page-webinar-consult-script-specificity.md",
	        "47-guarantee-scope-boundary-specificity.md",
	        "49-onboarding-qualification-form-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "17-fortune-fame-inner-life-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.hiringDelegation) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "53-hiring-delegation-org-design-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "49-onboarding-qualification-form-specificity.md",
	        "47-guarantee-scope-boundary-specificity.md",
	        "40-service-support-operations-fulfillment-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "17-fortune-fame-inner-life-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.customerSuccess) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "51-customer-success-renewal-playbook-specificity.md",
	        "40-service-support-operations-fulfillment-specificity.md",
	        "49-onboarding-qualification-form-specificity.md",
	        "50-case-study-testimonial-proof-library-specificity.md",
	        "43-customer-audience-persona-fit-specificity.md",
	        "45-delivery-model-capacity-specificity.md",
	        "47-guarantee-scope-boundary-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "17-fortune-fame-inner-life-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.deliveryModel) {
	      prioritizeAfterMethod(
	        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "45-delivery-model-capacity-specificity.md",
        "44-product-service-offer-fit-specificity.md",
        "40-service-support-operations-fulfillment-specificity.md",
        "25-business-investment-contract-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.valueLadder) {
	      prioritizeAfterMethod(
	        files,
	        "09-evidence-gates-topic-router.md",
	        "10-palace-sihua-specificity.md",
	        "46-premium-low-ticket-value-ladder-specificity.md",
	        "38-pricing-offer-promotion-upsell-specificity.md",
	        "44-product-service-offer-fit-specificity.md",
	        "43-customer-audience-persona-fit-specificity.md",
	        "40-service-support-operations-fulfillment-specificity.md",
	        "25-business-investment-contract-specificity.md",
	        "15-people-network-collaboration-specificity.md",
	        "16-risk-dispute-hidden-pressure-specificity.md",
	        "12-career-wealth-health-specificity.md",
	        "20-decision-action-guidance-specificity.md",
	        "19-timing-forecast-specificity.md",
	        "06-liuyue-liuri-sihua-rules.md",
	        "04-feixing-cetian-topic-rules.md",
	        "08-quanshu-limit-special-rules.md",
	      );
	    } else if (intent.supportOps && !intent.retention && !intent.pricing && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "40-service-support-operations-fulfillment-specificity.md",
        "25-business-investment-contract-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.techProduct && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "41-technology-product-platform-ai-specificity.md",
        "25-business-investment-contract-specificity.md",
        "26-authority-document-legal-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "12-career-wealth-health-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.offerFit && !intent.deliveryModel && !intent.retention && !intent.pricing && !intent.marketing && !intent.techProduct && !intent.customerFit) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "44-product-service-offer-fit-specificity.md",
        "42-career-industry-market-fit-specificity.md",
        "43-customer-audience-persona-fit-specificity.md",
        "38-pricing-offer-promotion-upsell-specificity.md",
        "40-service-support-operations-fulfillment-specificity.md",
        "25-business-investment-contract-specificity.md",
        "12-career-wealth-health-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.industryFit && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "42-career-industry-market-fit-specificity.md",
        "12-career-wealth-health-specificity.md",
        "18-temperament-talent-appearance-specificity.md",
        "25-business-investment-contract-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.customerFit && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.industryFit && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "43-customer-audience-persona-fit-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "35-creator-audience-sales-conversion-specificity.md",
        "42-career-industry-market-fit-specificity.md",
        "25-business-investment-contract-specificity.md",
        "12-career-wealth-health-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.children && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "31-children-pregnancy-creativity-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "14-home-family-travel-study-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.education && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "30-education-exam-writing-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "14-home-family-travel-study-specificity.md",
        "26-authority-document-legal-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.employment) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "27-employment-job-offer-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "12-career-wealth-health-specificity.md",
        "26-authority-document-legal-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.property && !intent.marketing) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "28-property-vehicle-relocation-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "14-home-family-travel-study-specificity.md",
        "12-career-wealth-health-specificity.md",
        "26-authority-document-legal-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.travel && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "32-travel-foreign-relocation-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "14-home-family-travel-study-specificity.md",
        "26-authority-document-legal-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.windfall) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "34-windfall-speculation-cash-leak-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.creator && !intent.marketing && !intent.reputation && !intent.retention && !intent.pricing) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "35-creator-audience-sales-conversion-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "25-business-investment-contract-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "12-career-wealth-health-specificity.md",
        "30-education-exam-writing-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.reputation && !intent.retention && !intent.pricing) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "36-reputation-public-trust-crisis-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "25-business-investment-contract-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.retention) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "37-retention-refund-subscription-churn-specificity.md",
        "25-business-investment-contract-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.marketing) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "39-marketing-acquisition-campaign-funnel-specificity.md",
        "25-business-investment-contract-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.pricing) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "38-pricing-offer-promotion-upsell-specificity.md",
        "25-business-investment-contract-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "21-remedy-mitigation-specificity.md",
        "19-timing-forecast-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.authority) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "26-authority-document-legal-specificity.md",
        "25-business-investment-contract-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "06-liuyue-liuri-sihua-rules.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.business) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "25-business-investment-contract-specificity.md",
        "20-decision-action-guidance-specificity.md",
        "12-career-wealth-health-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.interaction) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "23-star-sihua-interaction-specificity.md",
        "10-palace-sihua-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "19-timing-forecast-specificity.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.validation) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "22-validation-past-event-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "13-natal-life-direction-specificity.md",
        "12-career-wealth-health-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.remedy) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "21-remedy-mitigation-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "11-pair-relationship-specificity.md",
        "14-home-family-travel-study-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "13-natal-life-direction-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.decision) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "20-decision-action-guidance-specificity.md",
        "19-timing-forecast-specificity.md",
        "10-palace-sihua-specificity.md",
        "12-career-wealth-health-specificity.md",
        "11-pair-relationship-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "14-home-family-travel-study-specificity.md",
        "13-natal-life-direction-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if ((intent.home || intent.travel || intent.children || intent.study || intent.education) && !intent.career && !intent.money && !intent.health) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "14-home-family-travel-study-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.people) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "15-people-network-collaboration-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.risk) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "16-risk-dispute-hidden-pressure-specificity.md",
        "12-career-wealth-health-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.talent) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "18-temperament-talent-appearance-specificity.md",
        "13-natal-life-direction-specificity.md",
        "05-main-star-topic-matrix.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.fortune) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "17-fortune-fame-inner-life-specificity.md",
        "13-natal-life-direction-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.career || intent.money || intent.health || intent.home) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "12-career-wealth-health-specificity.md",
        "04-feixing-cetian-topic-rules.md",
        "08-quanshu-limit-special-rules.md",
      );
    } else if (intent.general) {
      prioritizeAfterMethod(
        files,
        "09-evidence-gates-topic-router.md",
        "10-palace-sihua-specificity.md",
        "13-natal-life-direction-specificity.md",
        "05-main-star-topic-matrix.md",
        "07-modern-licensed-collation-rules.md",
      );
    }
    return files;
  }

  if (science === "western") {
    pushUnique(files, "00b-licensed-modern-source-policy.md");
			    if (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.hiringDelegation && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget) pushUnique(files, "28-relationship-status-marriage-breakup-specificity.md", "06-relationship-nativity-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "00c-licensed-modern-extraction-framework.md", "02-lilly-houses.md", "03-synastry-timing-notime-weighting.md");
    if (intent.pair) pushUnique(files, "06-relationship-nativity-specificity.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "00c-licensed-modern-extraction-framework.md", "02-lilly-houses.md", "03-synastry-timing-notime-weighting.md");
    if (intent.timing || intent.advancedTiming) pushUnique(files, "14-timing-forecast-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md", "03-synastry-timing-notime-weighting.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md");
    if (intent.noTime) pushUnique(files, "00f-public-domain-no-time-predictive-medical-rules.md", "03-synastry-timing-notime-weighting.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md");
    if (intent.health) pushUnique(files, "24-health-surgery-recovery-specificity.md", "19-specialty-scope-availability.md", "00f-public-domain-no-time-predictive-medical-rules.md", "00g-public-domain-horary-electional-mundane-classical-rules.md", "11-risk-dispute-hidden-pressure-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md");
    if (intent.westernSpecialty) pushUnique(files, "19-specialty-scope-availability.md", "00g-public-domain-horary-electional-mundane-classical-rules.md", "04-specialty-router-evidence-gates.md");
    if (intent.travel) pushUnique(files, "27-travel-foreign-relocation-specificity.md", "09-home-family-travel-study-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md", "05-dignity-lots-specificity.md");
    if (intent.children) pushUnique(files, "26-children-pregnancy-creativity-specificity.md", "09-home-family-travel-study-specificity.md", "06-relationship-nativity-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md");
    if (intent.education) pushUnique(files, "25-education-exam-writing-specificity.md", "09-home-family-travel-study-specificity.md", "21-authority-document-legal-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "10-people-network-collaboration-specificity.md", "05-dignity-lots-specificity.md");
    if (intent.windfall) pushUnique(files, "29-windfall-speculation-cash-leak-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md");
    if (intent.creator && !intent.marketing) pushUnique(files, "30-creator-audience-sales-conversion-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "25-education-exam-writing-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md");
    if (intent.reputation) pushUnique(files, "31-reputation-public-trust-crisis-specificity.md", "12-fortune-fame-inner-life-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md");
    if (intent.retention) pushUnique(files, "32-retention-refund-subscription-churn-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md");
    if (intent.pricing) pushUnique(files, "33-pricing-offer-promotion-upsell-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md");
    if (intent.marketing) pushUnique(files, "34-marketing-acquisition-campaign-funnel-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md");
    if (intent.supportOps) pushUnique(files, "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    if (intent.techProduct) pushUnique(files, "36-technology-product-platform-ai-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    if (intent.industryFit) pushUnique(files, "37-career-industry-market-fit-specificity.md", "07-career-money-health-specificity.md", "13-temperament-talent-appearance-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    if (intent.customerFit) pushUnique(files, "38-customer-audience-persona-fit-specificity.md", "10-people-network-collaboration-specificity.md", "30-creator-audience-sales-conversion-specificity.md", "37-career-industry-market-fit-specificity.md", "20-business-investment-contract-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    if (intent.offerFit) pushUnique(files, "39-product-service-offer-fit-specificity.md", "37-career-industry-market-fit-specificity.md", "38-customer-audience-persona-fit-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    if (intent.deliveryModel) pushUnique(files, "40-delivery-model-capacity-specificity.md", "39-product-service-offer-fit-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    if (intent.valueLadder) pushUnique(files, "41-premium-low-ticket-value-ladder-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "39-product-service-offer-fit-specificity.md", "38-customer-audience-persona-fit-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    if (intent.scopeBoundary) pushUnique(files, "42-guarantee-scope-boundary-specificity.md", "32-retention-refund-subscription-churn-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "39-product-service-offer-fit-specificity.md", "40-delivery-model-capacity-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    if (intent.salesScript) pushUnique(files, "43-sales-page-webinar-consult-script-specificity.md", "30-creator-audience-sales-conversion-specificity.md", "38-customer-audience-persona-fit-specificity.md", "39-product-service-offer-fit-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "42-guarantee-scope-boundary-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    if (intent.qualificationGate) pushUnique(files, "44-onboarding-qualification-form-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "38-customer-audience-persona-fit-specificity.md", "39-product-service-offer-fit-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    if (intent.caseStudyProof) pushUnique(files, "45-case-study-testimonial-proof-library-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "30-creator-audience-sales-conversion-specificity.md", "38-customer-audience-persona-fit-specificity.md", "43-sales-page-webinar-consult-script-specificity.md", "42-guarantee-scope-boundary-specificity.md", "44-onboarding-qualification-form-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
		    if (intent.customerSuccess) pushUnique(files, "46-customer-success-renewal-playbook-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "45-case-study-testimonial-proof-library-specificity.md", "38-customer-audience-persona-fit-specificity.md", "40-delivery-model-capacity-specificity.md", "42-guarantee-scope-boundary-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
		    if (intent.partnershipProgram) pushUnique(files, "47-partnership-affiliate-referral-program-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "38-customer-audience-persona-fit-specificity.md", "44-onboarding-qualification-form-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
		    if (intent.hiringDelegation) pushUnique(files, "48-hiring-delegation-org-design-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "44-onboarding-qualification-form-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
		    if (intent.teamCompensation) pushUnique(files, "49-team-compensation-incentive-performance-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md");
				    if (intent.partnerDueDiligence) pushUnique(files, "50-partner-due-diligence-conflict-termination-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
				    if (intent.salesTeamQa) pushUnique(files, "51-sales-team-pipeline-qa-followup-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "44-onboarding-qualification-form-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
				    if (intent.cashflowBudget) pushUnique(files, "52-cashflow-runway-budget-cost-control-specificity.md", "20-business-investment-contract-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
				    if (intent.unitEconomics) pushUnique(files, "53-unit-economics-profit-breakeven-payback-specificity.md", "20-business-investment-contract-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
				    if (intent.supplyInventory) pushUnique(files, "54-inventory-procurement-supplier-stock-specificity.md", "20-business-investment-contract-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "10-people-network-collaboration-specificity.md", "27-travel-foreign-relocation-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
				    if (intent.taxAccounting) pushUnique(files, "55-tax-accounting-bookkeeping-compliance-specificity.md", "21-authority-document-legal-specificity.md", "20-business-investment-contract-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
				    if (intent.loanCreditDebt) pushUnique(files, "56-loan-credit-debt-refinance-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
				    if (intent.insuranceClaim) pushUnique(files, "57-insurance-claim-policy-coverage-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
    if (intent.business) pushUnique(files, "20-business-investment-contract-specificity.md", "07-career-money-health-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md");
    if (intent.authority) pushUnique(files, "21-authority-document-legal-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "00g-public-domain-horary-electional-mundane-classical-rules.md");
    if (intent.employment) pushUnique(files, "22-employment-job-offer-specificity.md", "07-career-money-health-specificity.md", "10-people-network-collaboration-specificity.md", "21-authority-document-legal-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md");
    if (intent.property) pushUnique(files, "23-property-vehicle-relocation-specificity.md", "09-home-family-travel-study-specificity.md", "07-career-money-health-specificity.md", "21-authority-document-legal-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md");
			    if (intent.money || intent.windfall || intent.creator || intent.marketing || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.career || intent.health || intent.home || intent.risk || intent.timing) pushUnique(files, "07-career-money-health-specificity.md");
    if (intent.home || intent.travel || intent.children || intent.study || intent.education) pushUnique(files, "09-home-family-travel-study-specificity.md");
    if (intent.people) pushUnique(files, "10-people-network-collaboration-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
    if (intent.risk) pushUnique(files, "11-risk-dispute-hidden-pressure-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md", "00g-public-domain-horary-electional-mundane-classical-rules.md");
    if (intent.fortune) pushUnique(files, "12-fortune-fame-inner-life-specificity.md", "05-dignity-lots-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    if (intent.talent) pushUnique(files, "13-temperament-talent-appearance-specificity.md", "05-dignity-lots-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    if (intent.decision) pushUnique(files, "15-decision-action-guidance-specificity.md", "08-natal-life-direction-specificity.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    if (intent.remedy) pushUnique(files, "16-remedy-mitigation-specificity.md", "08-natal-life-direction-specificity.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md", "11-risk-dispute-hidden-pressure-specificity.md");
    if (intent.validation) pushUnique(files, "17-validation-past-event-specificity.md", "08-natal-life-direction-specificity.md", "14-timing-forecast-specificity.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    if (intent.interaction) pushUnique(files, "18-planetary-interaction-specificity.md", "00a-public-domain-interactions.md", "05-dignity-lots-specificity.md", "04-specialty-router-evidence-gates.md", "00e-public-domain-modern-bridge-rules.md");
    if (intent.general) pushUnique(files, "08-natal-life-direction-specificity.md");
			    if (intent.money || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.career || intent.home || intent.travel || intent.children || intent.education || intent.people || intent.risk || intent.fortune || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property) pushUnique(files, "05-dignity-lots-specificity.md", "02-lilly-houses.md", "tetrabiblos-core.md");
    if (intent.general) pushUnique(files, "05-dignity-lots-specificity.md", "00c-licensed-modern-extraction-framework.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md", "03-synastry-timing-notime-weighting.md", "04-specialty-router-evidence-gates.md");
    if (intent.general) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "08-natal-life-direction-specificity.md", "00c-licensed-modern-extraction-framework.md", "03-synastry-timing-notime-weighting.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    }
    if (intent.westernSpecialty || intent.advancedTiming) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "19-specialty-scope-availability.md", "24-health-surgery-recovery-specificity.md", "05-dignity-lots-specificity.md", "14-timing-forecast-specificity.md", "00g-public-domain-horary-electional-mundane-classical-rules.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    }
			    if (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.hiringDelegation && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget && !intent.pair && !intent.westernSpecialty) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "28-relationship-status-marriage-breakup-specificity.md", "06-relationship-nativity-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "00c-licensed-modern-extraction-framework.md", "02-lilly-houses.md", "03-synastry-timing-notime-weighting.md");
    }
	    if (intent.interaction && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "18-planetary-interaction-specificity.md", "00a-public-domain-interactions.md", "08-natal-life-direction-specificity.md", "14-timing-forecast-specificity.md", "07-career-money-health-specificity.md", "06-relationship-nativity-specificity.md", "00e-public-domain-modern-bridge-rules.md");
			    } else if (intent.insuranceClaim && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
			      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "57-insurance-claim-policy-coverage-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
			    } else if (intent.loanCreditDebt && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
			      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "56-loan-credit-debt-refinance-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
			    } else if (intent.cashflowBudget && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
			      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "52-cashflow-runway-budget-cost-control-specificity.md", "20-business-investment-contract-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
			    } else if (intent.unitEconomics && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
			      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "53-unit-economics-profit-breakeven-payback-specificity.md", "20-business-investment-contract-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
				    } else if (intent.supplyInventory && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
				      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "54-inventory-procurement-supplier-stock-specificity.md", "20-business-investment-contract-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "10-people-network-collaboration-specificity.md", "27-travel-foreign-relocation-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
				    } else if (intent.taxAccounting && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
				      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "55-tax-accounting-bookkeeping-compliance-specificity.md", "21-authority-document-legal-specificity.md", "20-business-investment-contract-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
			    } else if (intent.salesTeamQa && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
		      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "51-sales-team-pipeline-qa-followup-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "44-onboarding-qualification-form-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
		    } else if (intent.partnershipProgram && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "47-partnership-affiliate-referral-program-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "38-customer-audience-persona-fit-specificity.md", "44-onboarding-qualification-form-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.hiringDelegation && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "48-hiring-delegation-org-design-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "44-onboarding-qualification-form-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.teamCompensation && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "49-team-compensation-incentive-performance-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.partnerDueDiligence && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "50-partner-due-diligence-conflict-termination-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.customerSuccess && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "46-customer-success-renewal-playbook-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "45-case-study-testimonial-proof-library-specificity.md", "38-customer-audience-persona-fit-specificity.md", "40-delivery-model-capacity-specificity.md", "42-guarantee-scope-boundary-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.health && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "24-health-surgery-recovery-specificity.md", "19-specialty-scope-availability.md", "16-remedy-mitigation-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "14-timing-forecast-specificity.md", "07-career-money-health-specificity.md", "05-dignity-lots-specificity.md", "00f-public-domain-no-time-predictive-medical-rules.md", "00g-public-domain-horary-electional-mundane-classical-rules.md");
	    } else if (intent.scopeBoundary && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "42-guarantee-scope-boundary-specificity.md", "32-retention-refund-subscription-churn-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "39-product-service-offer-fit-specificity.md", "40-delivery-model-capacity-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.salesScript && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "43-sales-page-webinar-consult-script-specificity.md", "30-creator-audience-sales-conversion-specificity.md", "38-customer-audience-persona-fit-specificity.md", "39-product-service-offer-fit-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "42-guarantee-scope-boundary-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.qualificationGate && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "44-onboarding-qualification-form-specificity.md", "42-guarantee-scope-boundary-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "38-customer-audience-persona-fit-specificity.md", "39-product-service-offer-fit-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.caseStudyProof && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "45-case-study-testimonial-proof-library-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "30-creator-audience-sales-conversion-specificity.md", "38-customer-audience-persona-fit-specificity.md", "43-sales-page-webinar-consult-script-specificity.md", "42-guarantee-scope-boundary-specificity.md", "44-onboarding-qualification-form-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.customerSuccess && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "46-customer-success-renewal-playbook-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "44-onboarding-qualification-form-specificity.md", "45-case-study-testimonial-proof-library-specificity.md", "38-customer-audience-persona-fit-specificity.md", "40-delivery-model-capacity-specificity.md", "42-guarantee-scope-boundary-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.deliveryModel && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "40-delivery-model-capacity-specificity.md", "39-product-service-offer-fit-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.valueLadder && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
	      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "41-premium-low-ticket-value-ladder-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "39-product-service-offer-fit-specificity.md", "38-customer-audience-persona-fit-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
	    } else if (intent.supportOps && !intent.retention && !intent.pricing && !intent.offerFit && !intent.deliveryModel && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.techProduct && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "36-technology-product-platform-ai-specificity.md", "20-business-investment-contract-specificity.md", "21-authority-document-legal-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.offerFit && !intent.deliveryModel && !intent.retention && !intent.pricing && !intent.marketing && !intent.techProduct && !intent.customerFit && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "39-product-service-offer-fit-specificity.md", "37-career-industry-market-fit-specificity.md", "38-customer-audience-persona-fit-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "35-service-support-operations-fulfillment-specificity.md", "20-business-investment-contract-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.industryFit && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.offerFit && !intent.deliveryModel && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "37-career-industry-market-fit-specificity.md", "07-career-money-health-specificity.md", "13-temperament-talent-appearance-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "12-fortune-fame-inner-life-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.customerFit && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.industryFit && !intent.offerFit && !intent.deliveryModel && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "38-customer-audience-persona-fit-specificity.md", "10-people-network-collaboration-specificity.md", "30-creator-audience-sales-conversion-specificity.md", "37-career-industry-market-fit-specificity.md", "20-business-investment-contract-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.children && !intent.creator && !intent.marketing && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "26-children-pregnancy-creativity-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "09-home-family-travel-study-specificity.md", "06-relationship-nativity-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.education && !intent.creator && !intent.marketing && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "25-education-exam-writing-specificity.md", "15-decision-action-guidance-specificity.md", "09-home-family-travel-study-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.employment && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "22-employment-job-offer-specificity.md", "15-decision-action-guidance-specificity.md", "07-career-money-health-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
    } else if (intent.property && !intent.marketing && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "23-property-vehicle-relocation-specificity.md", "15-decision-action-guidance-specificity.md", "09-home-family-travel-study-specificity.md", "07-career-money-health-specificity.md", "21-authority-document-legal-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
    } else if (intent.travel && !intent.creator && !intent.marketing && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "27-travel-foreign-relocation-specificity.md", "15-decision-action-guidance-specificity.md", "09-home-family-travel-study-specificity.md", "21-authority-document-legal-specificity.md", "10-people-network-collaboration-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.windfall && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "29-windfall-speculation-cash-leak-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "12-fortune-fame-inner-life-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.creator && !intent.marketing && !intent.reputation && !intent.retention && !intent.pricing && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "30-creator-audience-sales-conversion-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "12-fortune-fame-inner-life-specificity.md", "07-career-money-health-specificity.md", "25-education-exam-writing-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.marketing && !intent.reputation && !intent.retention && !intent.pricing && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "34-marketing-acquisition-campaign-funnel-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.reputation && !intent.retention && !intent.pricing && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "31-reputation-public-trust-crisis-specificity.md", "12-fortune-fame-inner-life-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "20-business-investment-contract-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.retention && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "32-retention-refund-subscription-churn-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.pricing && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "33-pricing-offer-promotion-upsell-specificity.md", "20-business-investment-contract-specificity.md", "10-people-network-collaboration-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.authority && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "21-authority-document-legal-specificity.md", "20-business-investment-contract-specificity.md", "15-decision-action-guidance-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00g-public-domain-horary-electional-mundane-classical-rules.md", "00e-public-domain-modern-bridge-rules.md");
    } else if (intent.business && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "20-business-investment-contract-specificity.md", "15-decision-action-guidance-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "10-people-network-collaboration-specificity.md", "14-timing-forecast-specificity.md", "02-lilly-houses.md", "00e-public-domain-modern-bridge-rules.md");
    } else if (intent.validation && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "17-validation-past-event-specificity.md", "14-timing-forecast-specificity.md", "08-natal-life-direction-specificity.md", "07-career-money-health-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "06-relationship-nativity-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.remedy && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "06-relationship-nativity-specificity.md", "09-home-family-travel-study-specificity.md", "08-natal-life-direction-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.decision && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "15-decision-action-guidance-specificity.md", "14-timing-forecast-specificity.md", "07-career-money-health-specificity.md", "06-relationship-nativity-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "09-home-family-travel-study-specificity.md", "08-natal-life-direction-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if ((intent.home || intent.travel || intent.children || intent.study || intent.education) && !intent.career && !intent.money && !intent.health && !intent.relationship && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "25-education-exam-writing-specificity.md", "09-home-family-travel-study-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.people && !intent.relationship && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "10-people-network-collaboration-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.risk && !intent.relationship && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "11-risk-dispute-hidden-pressure-specificity.md", "07-career-money-health-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.talent && !intent.relationship && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "13-temperament-talent-appearance-specificity.md", "08-natal-life-direction-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if (intent.fortune && !intent.relationship && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "12-fortune-fame-inner-life-specificity.md", "08-natal-life-direction-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    } else if ((intent.career || intent.money || intent.health || intent.home) && !intent.relationship && !intent.pair && !intent.advancedTiming && !intent.horary && !intent.electional && !intent.mundane && !intent.rectification && !intent.locality) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "14-timing-forecast-specificity.md", "07-career-money-health-specificity.md", "00e-public-domain-modern-bridge-rules.md", "00f-public-domain-no-time-predictive-medical-rules.md");
    }
			    if (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget && !intent.pair && !intent.westernSpecialty) {
      prioritizeAfterMethod(files, "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "28-relationship-status-marriage-breakup-specificity.md", "06-relationship-nativity-specificity.md", "15-decision-action-guidance-specificity.md", "16-remedy-mitigation-specificity.md", "14-timing-forecast-specificity.md", "00c-licensed-modern-extraction-framework.md", "02-lilly-houses.md", "03-synastry-timing-notime-weighting.md");
    }
    if (intent.pair) {
      prioritizeToFront(files, "28-relationship-status-marriage-breakup-specificity.md", "06-relationship-nativity-specificity.md", "18-planetary-interaction-specificity.md", "17-validation-past-event-specificity.md", "03-synastry-timing-notime-weighting.md", "04-specialty-router-evidence-gates.md", "05-dignity-lots-specificity.md", "00c-licensed-modern-extraction-framework.md");
    }
    return files;
  }

  if (science === "vedic") {
		    if (intent.timing || intent.relationship || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.salesTeamQa || intent.health || intent.children || intent.education || intent.general) pushUnique(files, "02-bphs-dasha-yoga.md");
    if (intent.timing) pushUnique(files, "16-timing-forecast-specificity.md");
    if (intent.specialty) pushUnique(files, "21-specialty-scope-prashna-muhurta-guard.md", "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "16-timing-forecast-specificity.md", "17-decision-action-guidance-specificity.md");
    if (intent.health) pushUnique(files, "26-health-surgery-recovery-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.travel) pushUnique(files, "29-travel-foreign-relocation-specificity.md", "11-home-family-travel-study-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.children) pushUnique(files, "28-children-pregnancy-creativity-specificity.md", "11-home-family-travel-study-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "08-compatibility-specificity.md");
    if (intent.education) pushUnique(files, "27-education-exam-writing-specificity.md", "11-home-family-travel-study-specificity.md", "23-authority-document-legal-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "12-people-network-collaboration-specificity.md");
    if (intent.windfall) pushUnique(files, "31-windfall-speculation-cash-leak-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.creator && !intent.marketing) pushUnique(files, "32-creator-audience-sales-conversion-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "27-education-exam-writing-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.reputation) pushUnique(files, "33-reputation-public-trust-crisis-specificity.md", "14-fortune-fame-inner-life-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.retention) pushUnique(files, "34-retention-refund-subscription-churn-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.pricing) pushUnique(files, "35-pricing-offer-promotion-upsell-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.marketing) pushUnique(files, "36-marketing-acquisition-campaign-funnel-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.supportOps) pushUnique(files, "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.techProduct) pushUnique(files, "38-technology-product-platform-ai-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.industryFit) pushUnique(files, "39-career-industry-market-fit-specificity.md", "09-career-wealth-health-specificity.md", "15-temperament-talent-appearance-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
	    if (intent.customerFit) pushUnique(files, "40-customer-audience-persona-fit-specificity.md", "12-people-network-collaboration-specificity.md", "32-creator-audience-sales-conversion-specificity.md", "39-career-industry-market-fit-specificity.md", "22-business-investment-contract-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
	    if (intent.offerFit) pushUnique(files, "41-product-service-offer-fit-specificity.md", "39-career-industry-market-fit-specificity.md", "40-customer-audience-persona-fit-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
	    if (intent.deliveryModel) pushUnique(files, "42-delivery-model-capacity-specificity.md", "41-product-service-offer-fit-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
	    if (intent.valueLadder) pushUnique(files, "43-premium-low-ticket-value-ladder-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "41-product-service-offer-fit-specificity.md", "40-customer-audience-persona-fit-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
	    if (intent.scopeBoundary) pushUnique(files, "44-guarantee-scope-boundary-specificity.md", "34-retention-refund-subscription-churn-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "41-product-service-offer-fit-specificity.md", "42-delivery-model-capacity-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
	    if (intent.salesScript) pushUnique(files, "45-sales-page-webinar-consult-script-specificity.md", "32-creator-audience-sales-conversion-specificity.md", "40-customer-audience-persona-fit-specificity.md", "41-product-service-offer-fit-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "44-guarantee-scope-boundary-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
	    if (intent.qualificationGate) pushUnique(files, "46-onboarding-qualification-form-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "40-customer-audience-persona-fit-specificity.md", "41-product-service-offer-fit-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
	    if (intent.caseStudyProof) pushUnique(files, "47-case-study-testimonial-proof-library-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "32-creator-audience-sales-conversion-specificity.md", "40-customer-audience-persona-fit-specificity.md", "45-sales-page-webinar-consult-script-specificity.md", "44-guarantee-scope-boundary-specificity.md", "46-onboarding-qualification-form-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
		    if (intent.customerSuccess) pushUnique(files, "48-customer-success-renewal-playbook-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "47-case-study-testimonial-proof-library-specificity.md", "40-customer-audience-persona-fit-specificity.md", "42-delivery-model-capacity-specificity.md", "44-guarantee-scope-boundary-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
		    if (intent.partnershipProgram) pushUnique(files, "49-partnership-affiliate-referral-program-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "40-customer-audience-persona-fit-specificity.md", "46-onboarding-qualification-form-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
		    if (intent.hiringDelegation) pushUnique(files, "50-hiring-delegation-org-design-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "46-onboarding-qualification-form-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
		    if (intent.teamCompensation) pushUnique(files, "51-team-compensation-incentive-performance-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
				    if (intent.partnerDueDiligence) pushUnique(files, "52-partner-due-diligence-conflict-termination-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
				    if (intent.salesTeamQa) pushUnique(files, "53-sales-team-pipeline-qa-followup-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "46-onboarding-qualification-form-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
					    if (intent.cashflowBudget) pushUnique(files, "54-cashflow-runway-budget-cost-control-specificity.md", "22-business-investment-contract-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
					    if (intent.unitEconomics) pushUnique(files, "55-unit-economics-profit-breakeven-payback-specificity.md", "22-business-investment-contract-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
						    if (intent.supplyInventory) pushUnique(files, "56-inventory-procurement-supplier-stock-specificity.md", "22-business-investment-contract-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "12-people-network-collaboration-specificity.md", "29-travel-foreign-relocation-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
						    if (intent.taxAccounting) pushUnique(files, "57-tax-accounting-bookkeeping-compliance-specificity.md", "23-authority-document-legal-specificity.md", "22-business-investment-contract-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
						    if (intent.loanCreditDebt) pushUnique(files, "58-loan-credit-debt-refinance-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
						    if (intent.insuranceClaim) pushUnique(files, "59-insurance-claim-policy-coverage-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.business) pushUnique(files, "22-business-investment-contract-specificity.md", "09-career-wealth-health-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.authority) pushUnique(files, "23-authority-document-legal-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.employment) pushUnique(files, "24-employment-job-offer-specificity.md", "09-career-wealth-health-specificity.md", "12-people-network-collaboration-specificity.md", "23-authority-document-legal-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.property) pushUnique(files, "25-property-vehicle-relocation-specificity.md", "11-home-family-travel-study-specificity.md", "09-career-wealth-health-specificity.md", "23-authority-document-legal-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md");
		    if (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.hiringDelegation && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget) pushUnique(files, "30-relationship-status-marriage-breakup-specificity.md", "08-compatibility-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "02-bphs-dasha-yoga.md");
			    if (intent.horary || intent.electional || intent.advancedTiming || intent.noTime || intent.general || intent.timing || intent.relationship || intent.money || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.career || intent.health || intent.home || intent.travel || intent.children || intent.study || intent.education || intent.people || intent.risk || intent.fortune || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property || intent.specialty) pushUnique(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md");
		    if ((intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.hiringDelegation && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget) || intent.pair) pushUnique(files, "08-compatibility-specificity.md");
			    if (intent.career || intent.money || intent.windfall || intent.creator || intent.marketing || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.health || intent.home || intent.risk || intent.timing) pushUnique(files, "09-career-wealth-health-specificity.md");
    if (intent.home || intent.travel || intent.children || intent.study || intent.education) pushUnique(files, "11-home-family-travel-study-specificity.md");
    if (intent.people) pushUnique(files, "12-people-network-collaboration-specificity.md");
    if (intent.risk) pushUnique(files, "13-risk-dispute-hidden-pressure-specificity.md");
    if (intent.fortune) pushUnique(files, "14-fortune-fame-inner-life-specificity.md");
    if (intent.talent) pushUnique(files, "15-temperament-talent-appearance-specificity.md", "10-natal-life-direction-specificity.md");
    if (intent.decision) pushUnique(files, "17-decision-action-guidance-specificity.md", "10-natal-life-direction-specificity.md");
    if (intent.remedy) pushUnique(files, "18-remedy-mitigation-specificity.md", "10-natal-life-direction-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md");
    if (intent.validation) pushUnique(files, "19-validation-past-event-specificity.md", "10-natal-life-direction-specificity.md", "16-timing-forecast-specificity.md");
    if (intent.interaction) pushUnique(files, "20-graha-interaction-specificity.md", "07-functional-topic-specificity.md", "05-dasha-deepening-rules.md");
    if (intent.general) pushUnique(files, "10-natal-life-direction-specificity.md");
			    if (intent.relationship || intent.money || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.career || intent.health || intent.home || intent.travel || intent.children || intent.study || intent.education || intent.people || intent.risk || intent.fortune || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property || intent.timing || intent.noTime || intent.specialty || intent.general) pushUnique(files, "07-functional-topic-specificity.md", "04-topic-packs.md");
		    if (intent.timing || intent.relationship || intent.money || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.career || intent.health || intent.home || intent.travel || intent.children || intent.study || intent.education || intent.people || intent.risk || intent.fortune || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property || intent.specialty || intent.general) pushUnique(files, "05-dasha-deepening-rules.md");
		    if (intent.relationship || intent.money || intent.windfall || intent.creator || intent.marketing || intent.reputation || intent.retention || intent.pricing || intent.supportOps || intent.techProduct || intent.industryFit || intent.customerFit || intent.offerFit || intent.deliveryModel || intent.valueLadder || intent.scopeBoundary || intent.hiringDelegation || intent.teamCompensation || intent.partnerDueDiligence || intent.salesTeamQa || intent.career || intent.home || intent.travel || intent.children || intent.study || intent.education || intent.people || intent.risk || intent.fortune || intent.talent || intent.decision || intent.remedy || intent.validation || intent.interaction || intent.business || intent.authority || intent.employment || intent.property || intent.noTime || intent.specialty || intent.general) pushUnique(files, "vedic-core.md");
	    if (intent.pair || (intent.relationship && !intent.retention && !intent.partnershipProgram && !intent.hiringDelegation && !intent.partnerDueDiligence && !intent.salesTeamQa && !intent.cashflowBudget && !intent.specialty && !intent.business && !intent.authority && !intent.employment && !intent.property && !intent.health)) {
	      prioritizeAfterMethod(files, "30-relationship-status-marriage-breakup-specificity.md", "08-compatibility-specificity.md", "20-graha-interaction-specificity.md", "19-validation-past-event-specificity.md", "18-remedy-mitigation-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
			    } else if (intent.insuranceClaim) {
			      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "59-insurance-claim-policy-coverage-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
			    } else if (intent.loanCreditDebt) {
			      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "58-loan-credit-debt-refinance-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
			    } else if (intent.cashflowBudget) {
		      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "54-cashflow-runway-budget-cost-control-specificity.md", "22-business-investment-contract-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
		    } else if (intent.unitEconomics) {
		      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "55-unit-economics-profit-breakeven-payback-specificity.md", "22-business-investment-contract-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
			    } else if (intent.supplyInventory) {
			      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "56-inventory-procurement-supplier-stock-specificity.md", "22-business-investment-contract-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "12-people-network-collaboration-specificity.md", "29-travel-foreign-relocation-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
			    } else if (intent.taxAccounting) {
			      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "57-tax-accounting-bookkeeping-compliance-specificity.md", "23-authority-document-legal-specificity.md", "22-business-investment-contract-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
		    } else if (intent.salesTeamQa) {
		      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "53-sales-team-pipeline-qa-followup-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "46-onboarding-qualification-form-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
		    } else if (intent.partnershipProgram) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "49-partnership-affiliate-referral-program-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "40-customer-audience-persona-fit-specificity.md", "46-onboarding-qualification-form-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.hiringDelegation) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "50-hiring-delegation-org-design-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "46-onboarding-qualification-form-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.teamCompensation) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "51-team-compensation-incentive-performance-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.partnerDueDiligence) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "52-partner-due-diligence-conflict-termination-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.customerSuccess) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "48-customer-success-renewal-playbook-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "47-case-study-testimonial-proof-library-specificity.md", "40-customer-audience-persona-fit-specificity.md", "42-delivery-model-capacity-specificity.md", "44-guarantee-scope-boundary-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.health) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "26-health-surgery-recovery-specificity.md", "21-specialty-scope-prashna-muhurta-guard.md", "18-remedy-mitigation-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.specialty) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "21-specialty-scope-prashna-muhurta-guard.md", "07-functional-topic-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.scopeBoundary) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "44-guarantee-scope-boundary-specificity.md", "34-retention-refund-subscription-churn-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "41-product-service-offer-fit-specificity.md", "42-delivery-model-capacity-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.salesScript) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "45-sales-page-webinar-consult-script-specificity.md", "32-creator-audience-sales-conversion-specificity.md", "40-customer-audience-persona-fit-specificity.md", "41-product-service-offer-fit-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "44-guarantee-scope-boundary-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.qualificationGate) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "46-onboarding-qualification-form-specificity.md", "44-guarantee-scope-boundary-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "40-customer-audience-persona-fit-specificity.md", "41-product-service-offer-fit-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.caseStudyProof) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "47-case-study-testimonial-proof-library-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "32-creator-audience-sales-conversion-specificity.md", "40-customer-audience-persona-fit-specificity.md", "45-sales-page-webinar-consult-script-specificity.md", "44-guarantee-scope-boundary-specificity.md", "46-onboarding-qualification-form-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.customerSuccess) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "48-customer-success-renewal-playbook-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "46-onboarding-qualification-form-specificity.md", "47-case-study-testimonial-proof-library-specificity.md", "40-customer-audience-persona-fit-specificity.md", "42-delivery-model-capacity-specificity.md", "44-guarantee-scope-boundary-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.deliveryModel) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "42-delivery-model-capacity-specificity.md", "41-product-service-offer-fit-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.valueLadder) {
	      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "43-premium-low-ticket-value-ladder-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "41-product-service-offer-fit-specificity.md", "40-customer-audience-persona-fit-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
	    } else if (intent.supportOps && !intent.retention && !intent.pricing && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.techProduct && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "38-technology-product-platform-ai-specificity.md", "22-business-investment-contract-specificity.md", "23-authority-document-legal-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.offerFit && !intent.deliveryModel && !intent.retention && !intent.pricing && !intent.marketing && !intent.techProduct && !intent.customerFit) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "41-product-service-offer-fit-specificity.md", "39-career-industry-market-fit-specificity.md", "40-customer-audience-persona-fit-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "37-service-support-operations-fulfillment-specificity.md", "22-business-investment-contract-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.industryFit && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "39-career-industry-market-fit-specificity.md", "09-career-wealth-health-specificity.md", "15-temperament-talent-appearance-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "14-fortune-fame-inner-life-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.customerFit && !intent.retention && !intent.pricing && !intent.marketing && !intent.supportOps && !intent.techProduct && !intent.industryFit && !intent.offerFit && !intent.deliveryModel) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "40-customer-audience-persona-fit-specificity.md", "12-people-network-collaboration-specificity.md", "32-creator-audience-sales-conversion-specificity.md", "39-career-industry-market-fit-specificity.md", "22-business-investment-contract-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.children && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "28-children-pregnancy-creativity-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "11-home-family-travel-study-specificity.md", "08-compatibility-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.education && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "27-education-exam-writing-specificity.md", "17-decision-action-guidance-specificity.md", "11-home-family-travel-study-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.employment) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "24-employment-job-offer-specificity.md", "17-decision-action-guidance-specificity.md", "09-career-wealth-health-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.property && !intent.marketing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "25-property-vehicle-relocation-specificity.md", "17-decision-action-guidance-specificity.md", "11-home-family-travel-study-specificity.md", "09-career-wealth-health-specificity.md", "23-authority-document-legal-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.travel && !intent.creator && !intent.marketing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "29-travel-foreign-relocation-specificity.md", "17-decision-action-guidance-specificity.md", "11-home-family-travel-study-specificity.md", "23-authority-document-legal-specificity.md", "12-people-network-collaboration-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.windfall) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "31-windfall-speculation-cash-leak-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "14-fortune-fame-inner-life-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.creator && !intent.marketing && !intent.reputation && !intent.retention && !intent.pricing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "32-creator-audience-sales-conversion-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "14-fortune-fame-inner-life-specificity.md", "09-career-wealth-health-specificity.md", "27-education-exam-writing-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.marketing && !intent.reputation && !intent.retention && !intent.pricing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "36-marketing-acquisition-campaign-funnel-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.reputation && !intent.retention && !intent.pricing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "33-reputation-public-trust-crisis-specificity.md", "14-fortune-fame-inner-life-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "22-business-investment-contract-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.retention) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "34-retention-refund-subscription-churn-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.pricing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "35-pricing-offer-promotion-upsell-specificity.md", "22-business-investment-contract-specificity.md", "12-people-network-collaboration-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "17-decision-action-guidance-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.authority) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "23-authority-document-legal-specificity.md", "22-business-investment-contract-specificity.md", "17-decision-action-guidance-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.business) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "22-business-investment-contract-specificity.md", "17-decision-action-guidance-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "12-people-network-collaboration-specificity.md", "16-timing-forecast-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.interaction) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "20-graha-interaction-specificity.md", "16-timing-forecast-specificity.md", "10-natal-life-direction-specificity.md", "09-career-wealth-health-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.validation) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "19-validation-past-event-specificity.md", "16-timing-forecast-specificity.md", "10-natal-life-direction-specificity.md", "09-career-wealth-health-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.remedy) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "18-remedy-mitigation-specificity.md", "16-timing-forecast-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "08-compatibility-specificity.md", "11-home-family-travel-study-specificity.md", "10-natal-life-direction-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.decision) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "17-decision-action-guidance-specificity.md", "16-timing-forecast-specificity.md", "09-career-wealth-health-specificity.md", "08-compatibility-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "11-home-family-travel-study-specificity.md", "10-natal-life-direction-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if ((intent.home || intent.travel || intent.children || intent.study || intent.education) && !intent.career && !intent.money && !intent.health) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "11-home-family-travel-study-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.people) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "12-people-network-collaboration-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.risk) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "13-risk-dispute-hidden-pressure-specificity.md", "09-career-wealth-health-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.talent) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "15-temperament-talent-appearance-specificity.md", "10-natal-life-direction-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.fortune) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "14-fortune-fame-inner-life-specificity.md", "10-natal-life-direction-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.career || intent.money || intent.health || intent.home || intent.timing) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "16-timing-forecast-specificity.md", "09-career-wealth-health-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    } else if (intent.general) {
      prioritizeAfterMethod(files, "06-evidence-gates-specialty-router.md", "07-functional-topic-specificity.md", "10-natal-life-direction-specificity.md", "05-dasha-deepening-rules.md", "04-topic-packs.md");
    }
    return files;
  }

  return undefined;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad2 = (n: number) => String(n).padStart(2, "0");

function bangkokParts(d: Date): { year: number; month: number; day: number } {
  const bkk = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return { year: bkk.getUTCFullYear(), month: bkk.getUTCMonth() + 1, day: bkk.getUTCDate() };
}

function normalizeYear(raw: number): number | null {
  const y = raw >= 2400 && raw <= 2699 ? raw - 543 : raw;
  return y >= 1900 && y <= 2150 ? y : null;
}

function isValidDatePart(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function bangkokNoonUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0)); // 12:00 Asia/Bangkok
}

function timingRef(year: number, month: number, day: number, source: FusionTimingReference["source"], label: string): FusionTimingReference {
  return { refDate: bangkokNoonUTC(year, month, day), targetYear: year, source, label };
}

export function resolveFusionTimingReference(question: string, now = new Date()): FusionTimingReference {
  const text = String(question || "");
  const current = bangkokParts(now);
  const ymd = text.match(/(?:^|[^\d])(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[^\d]|$)/);
  if (ymd) {
    const year = normalizeYear(Number(ymd[1]));
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (year && isValidDatePart(year, month, day)) {
      return timingRef(year, month, day, "question_date", `วันที่ที่ผู้ใช้ระบุ ${year}-${pad2(month)}-${pad2(day)}`);
    }
  }
  const dmy = text.match(/(?:^|[^\d])(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[^\d]|$)/);
  if (dmy) {
    const year = normalizeYear(Number(dmy[3]));
    const month = Number(dmy[2]);
    const day = Number(dmy[1]);
    if (year && isValidDatePart(year, month, day)) {
      return timingRef(year, month, day, "question_date", `วันที่ที่ผู้ใช้ระบุ ${year}-${pad2(month)}-${pad2(day)}`);
    }
  }
  if (/(ปีหน้า|next\s+year)/i.test(text)) {
    const year = current.year + 1;
    return timingRef(year, 7, 1, "relative_year", `ปีหน้าจากวันปัจจุบัน = ${year}`);
  }
  if (/(ปีที่แล้ว|last\s+year)/i.test(text)) {
    const year = current.year - 1;
    return timingRef(year, 7, 1, "relative_year", `ปีที่แล้วจากวันปัจจุบัน = ${year}`);
  }
  if (/(ปีนี้|this\s+year)/i.test(text)) {
    return timingRef(current.year, 7, 1, "relative_year", `ปีนี้ = ${current.year}`);
  }

  const yearRe = /(?:^|[^\d])((?:19|20|21|24|25|26)\d{2})(?:[^\d]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = yearRe.exec(text))) {
    const year = normalizeYear(Number(m[1]));
    if (year) return timingRef(year, 7, 1, "question_year", `ปีที่ผู้ใช้ระบุ ${year}`);
  }
  return {
    refDate: now,
    targetYear: current.year,
    source: "current_date",
    label: `วันปัจจุบัน ${current.year}-${pad2(current.month)}-${pad2(current.day)}`,
  };
}

function qizhengTransitYears(refDate: Date): number[] {
  const center = bangkokParts(refDate).year;
  return Array.from({ length: 13 }, (_, i) => center - 6 + i);
}

function birthLocalLine(b: BirthData): string {
  const parts = bangkokParts(b.dtUTC);
  const bkk = new Date(b.dtUTC.getTime() + BANGKOK_OFFSET_MS);
  const date = b.birthDate || `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  const time = b.birthTime || `${pad2(bkk.getUTCHours())}:${pad2(bkk.getUTCMinutes())}`;
  return `เวลาเกิดท้องถิ่นที่ผู้ใช้กรอก: ${date} ${time} Asia/Bangkok · ใช้ค่านี้เป็นวันเกิดผู้ใช้เท่านั้น (UTC instant ภายในระบบ: ${b.dtUTC.toISOString()} · ห้ามนำวันที่ UTC ไปแสดงเป็นวันเกิด)`;
}

function metaFor(science: ScienceId, file: string): Pick<CanonSourceMapRow, "title" | "sourceUrl" | "licenseClass" | "mode"> {
  const m = CANON_SOURCE_META[science]?.[file] || {};
  return {
    title: m.title || `${science}/${file}`,
    sourceUrl: m.sourceUrl || "local:unmapped",
    licenseClass: m.licenseClass || "unknown",
    mode: m.mode || (m.licenseClass === "public_domain" ? "verbatim" : "summary"),
  };
}

/** โหลดคัมภีร์ศาสตร์ (data/library/astro-canon/<science>/*.md) · best-effort · cap ขนาด
 *  cap 56K = qizheng มี 4 ไฟล์ (恩用12宮+廟旺+格局+星情 ~50K) โหลดครบ · ศาสตร์อื่นไฟล์เดียว <30K ไม่กระทบ
 *  รวม canon+packet+question ยังต่ำกว่า SIFU_FUSION_INTERNAL_MESSAGE_MAX_CHARS (80K) */
export function loadCanonBundle(science: ScienceId, maxChars = CANON_TEXT_MAX_CHARS, selectedFiles?: string[]): CanonBundle {
  const selectedKey = selectedFiles?.length ? selectedFiles.join("|") : "";
  const cacheKey = `${science}:${maxChars}:${selectedKey}`;
  if (canonCache.has(cacheKey)) return canonCache.get(cacheKey)!;
  let text = "";
  const sourceMap: CanonSourceMapRow[] = [];
  try {
    const dir = join(CANON_DIR, science);
    if (existsSync(dir)) {
      const defaultFiles = selectedFiles?.length ? selectedFiles : CANON_DEFAULT_FILES[science];
      const files = defaultFiles?.length
        ? defaultFiles.filter((x) => x.endsWith(".md") && !x.includes(".NOTE.") && existsSync(join(dir, x)))
        : readdirSync(dir).filter((x) => x.endsWith(".md") && !x.includes(".NOTE.")).sort();
      for (const f of files) {
        if (text.length >= maxChars) break;
        const full = readFileSync(join(dir, f), "utf8");
        const remaining = Math.max(0, maxChars - text.length);
        const segment = full.slice(0, remaining);
        if (!segment) break;
        const before = text.length;
        text += segment + (text.length + segment.length < maxChars ? "\n\n" : "");
        const meta = metaFor(science, f);
        sourceMap.push({
          science,
          sourceId: `${science}:${f.replace(/\.md$/, "")}`,
          file: f,
          ...meta,
          sourceHashSha256: sha256(full),
          promptSegmentHashSha256: sha256(segment),
          includedChars: segment.length,
          totalChars: full.length,
          truncated: segment.length < full.length || text.length >= maxChars,
        });
        if (text.length === before) break;
      }
    }
  } catch { /* ไม่มีคัมภีร์ = ใช้ packet + guard ในตัว */ }
  text = text.slice(0, maxChars);
  const bundle: CanonBundle = {
    science,
    text,
    textHashSha256: sha256(text),
    promptChars: text.length,
    truncated: sourceMap.some((r) => r.truncated),
    sourceMap,
  };
  canonCache.set(cacheKey, bundle);
  return bundle;
}

export function loadCanon(science: ScienceId, maxChars = CANON_TEXT_MAX_CHARS): string {
  return loadCanonBundle(science, maxChars).text;
}

/** render ผังของศาสตร์ (เฉพาะ astro · bazi ไปทาง /api/sifu เดิม) */
function structuredPacketJson(packet: unknown): string {
  if (packet && typeof packet === "object" && (packet as { discipline?: unknown }).discipline === "qizheng") {
    const p = packet as Record<string, any>;
    const d = p.data as Record<string, any>;
    const hasTime = Boolean(p.hasBirthTime);
    const compact = {
      discipline: p.discipline,
      packetVersion: p.packetVersion,
      hasBirthTime: p.hasBirthTime,
      degradeLevel: p.degradeLevel,
      notAvailable: p.notAvailable,
      data: {
        timeDependentClosed: hasTime ? undefined : ["ascendant", "mingDegree", "duZhu", "shenGong", "shenZhu", "houses12", "enYongChouNan", "geju", "xingXian", "house-basedTransit"],
        ascendant: hasTime ? d.ascendant : null,
        mingDegree: hasTime ? d.mingDegree : null,
        shenDegree: hasTime ? d.shenDegree : null,
        yongshen: hasTime ? d.yongshen : null,
        stars: d.stars?.map((s: any) => [s.zh, s.th, s.signTh, s.signDeg, s.shu, s.shuDeg, s.status, s.retro ? 1 : 0]),
        enStars: hasTime ? d.enStars : [],
        yongStars: hasTime ? d.yongStars : [],
        nanStars: hasTime ? d.nanStars : [],
        chouStars: hasTime ? d.chouStars : [],
        geju: hasTime ? d.geju : [],
        houses12: hasTime ? d.houses12?.map((h: any) => [h.house, h.zh, h.domain, h.signTh, h.rulerTh, h.rulerStatus, h.rulerInHouse, h.starsInHouse, h.level]) : [],
        transit: hasTime ? d.transit : [],
        xingXian: hasTime ? d.xingXian : null,
        huaYao: d.huaYao ? {
          yearStem: d.huaYao.yearStem,
          roles: d.huaYao.roles.map((r: any) => [r.roleFull, r.meaningZh, r.palaceZh, r.starZh, r.starTh, r.natalHouse, r.natalStatus, r.retro ? 1 : 0]),
        } : null,
        verdictTh: d.verdictTh,
        level: d.level,
      },
    };
    return JSON.stringify(compact);
  }
  if (packet && typeof packet === "object" && (packet as { discipline?: unknown }).discipline === "western") {
    const p = packet as Record<string, any>;
    const d = p.data as Record<string, any>;
    const compact = {
      discipline: p.discipline,
      packetVersion: p.packetVersion,
      hasBirthTime: p.hasBirthTime,
      birthTimeMode: p.birthTimeMode,
      anchorTime: p.anchorTime,
      moonUncertainty: p.moonUncertainty,
      gender: p.gender,
      sect: p.sect,
      partOfFortuneFormula: p.partOfFortuneFormula,
      forbiddenFieldsWhenNoTime: p.forbiddenFieldsWhenNoTime,
      allowedFieldsWhenNoTime: p.allowedFieldsWhenNoTime,
      unsupportedSpecialtyPackets: p.unsupportedSpecialtyPackets,
      timingCoverage: p.timingCoverage,
      notAvailable: p.notAvailable,
      data: {
        ascendant: d.ascendant,
        mc: d.mc,
        partOfFortune: d.partOfFortune,
        lots: d.lots?.map((x: any) => [x.key, x.nameTh, x.signTh, x.signDeg, x.house, x.formulaMode]),
        planets: d.planets?.map((x: any) => ({
          n: x.name,
          th: x.nameTh,
          sign: x.signTh,
          deg: x.signDeg,
          h: x.house,
          retro: x.retro ? 1 : 0,
          dignity: x.dignity,
          minorDignity: {
            score: x.minorDignity?.score,
            triplicity: x.minorDignity?.activeTriplicityLord,
            term: x.minorDignity?.termLord,
            face: x.minorDignity?.faceLord,
            peregrine: x.minorDignity?.peregrine ? 1 : 0,
          },
          decl: x.declination,
          uncertain: x.uncertain ? 1 : 0,
        })),
        houses: d.houses?.map((x: any) => [x.house, x.signTh]),
        aspects: d.aspects?.map((x: any) => [x.a, x.b, x.type, x.orb, x.applying ? 1 : 0]),
        minorAspects: d.minorAspects?.map((x: any) => [x.a, x.b, x.type, x.orb, x.applying ? 1 : 0]),
        aspectPatterns: d.aspectPatterns?.map((x: any) => [x.type, x.planets, x.apex || x.focus || null]),
        hiddenContacts: d.hiddenContacts?.map((x: any) => [x.a, x.b, x.type, x.orb]),
        fixedStarHits: d.fixedStarHits?.map((x: any) => [x.star, x.starTh, x.target, x.contact, x.orb, x.nature]),
        transits: {
          refDate: d.transits?.refDate,
          aspectsToNatal: d.transits?.aspectsToNatal?.map((x: any) => [x.transit, x.natal, x.natalKind, x.type, x.orb]),
        },
        timingSupport: {
          retrogrades: d.timingSupport?.retrogrades?.map((x: any) => [x.planet, x.retro ? 1 : 0]),
          returnCycles: d.timingSupport?.returnCycles?.map((x: any) => [x.planet, x.ageAtRefDate, x.currentCycleNumber, x.orbToReturn, x.currentAspectToNatal]),
        },
        chartRuler: d.chartRuler,
        houseRulers: d.houseRulers?.map((x: any) => [x.house, x.signTh, x.ruler, x.rulerTh, x.rulerPlanet?.house, x.rulerPlanet?.dignity]),
        topicLordMatrix: d.topicLordMatrix?.map((row: any) => ({
          topic: row.topic,
          labelTh: row.labelTh,
          availability: row.availability,
          evidence: row.evidence?.map((ev: any) => [ev.role, ev.planet || ev.lot || null, ev.planetTh || ev.lotTh || null, ev.signTh || null, ev.signDeg ?? null, ev.house ?? null, ev.dignity || null, ev.minorScore ?? null, ev.reason]),
        })),
        dispositors: d.dispositors?.map((x: any) => [x.planet, x.ruler, x.rulerHouse, x.rulerDignity]),
        dominantPlanets: d.dominantPlanets?.map((x: any) => [x.name, x.nameTh, x.score, x.reasons]),
        shape: d.shape,
      },
    };
    return JSON.stringify(compact);
  }
  if (packet && typeof packet === "object" && (packet as { discipline?: unknown }).discipline === "vedic") {
    const p = packet as Record<string, unknown>;
    const d = p.data as Record<string, any>;
    const compact = {
      discipline: p.discipline,
      packetVersion: p.packetVersion,
      hasBirthTime: p.hasBirthTime,
      degradeLevel: p.degradeLevel,
      birthTimeMode: p.birthTimeMode,
      anchorTime: p.anchorTime,
      moonUncertainty: p.moonUncertainty,
      timingConfidence: p.timingConfidence,
      chandraLagnaMode: p.chandraLagnaMode,
      allowedFieldsWhenNoTime: p.allowedFieldsWhenNoTime,
      forbiddenFieldsWhenNoTime: p.forbiddenFieldsWhenNoTime,
      notAvailable: p.notAvailable,
      data: {
        ayanamsa: d.ayanamsa,
        lagna: d.lagna,
        grahas: d.grahas?.map((g: any) => ({
          n: g.name, r: g.rashi, deg: g.deg, h: g.house, nak: g.nakshatra, pada: g.pada,
          dignity: g.dignity, lord: g.rashiLord, rel: g.rashiLordRelation,
          retro: g.retro, speed: g.speed, combust: g.combust, sunOrb: g.combustion?.orbFromSun,
        })),
        bhavas: d.bhavas?.map((b: any) => [b.house, b.sign, b.lord]),
        moonNakshatra: d.moonNakshatra,
        vimshottari: d.vimshottari,
        vargas: {
          navamsaD9: d.vargas?.navamsaD9?.map((x: any) => [x.name, x.rashi, x.deg, x.dignity, x.vargottama ? 1 : 0]),
          dashamsaD10: d.vargas?.dashamsaD10?.map((x: any) => [x.name, x.rashi, x.deg, x.dignity, x.vargottama ? 1 : 0]),
          shodasha: Object.fromEntries(Object.entries(d.vargas?.shodasha || {}).map(([name, rows]) => [
            name,
            (rows as any[]).map((x: any) => [x.name, x.rashi, x.deg, x.dignity, x.vargottama ? 1 : 0]),
          ])),
        },
        drishti: d.drishti?.map((x: any) => [x.from, x.to, x.aspectHouse]),
        yogaCandidates: d.yogaCandidates,
        shadbala: {
          method: d.shadbala?.method,
          scale: d.shadbala?.scale,
          planets: d.shadbala?.planets?.map((x: any) => [x.graha, x.score, x.band, x.components]),
        },
        ashtakavarga: {
          method: d.ashtakavarga?.method,
          planets: d.ashtakavarga?.planets?.map((x: any) => [x.graha, x.totalBindus, x.bindusByRashi?.map((r: any) => r.bindu)]),
          sarvaByRashi: d.ashtakavarga?.sarvaByRashi?.map((x: any) => x.bindu),
          sarvaTotal: d.ashtakavarga?.sarvaTotal,
        },
        gochara: {
          refDate: d.gochara?.refDate,
          grahas: d.gochara?.grahas?.map((g: any) => [g.name, g.rashi, g.deg, g.houseFromLagna, g.houseFromMoon, g.dignity, g.retro ? 1 : 0, g.combust ? 1 : 0]),
          hitsToNatal: d.gochara?.hitsToNatal?.map((x: any) => [x.transit, x.natal, x.relation, x.aspectHouse]),
        },
      },
    };
    return JSON.stringify(compact);
  }
  return JSON.stringify(packet);
}

export function renderChartForScience(science: ScienceId, b: BirthData, refDate: Date): string {
  if (science === "qizheng") {
    const packet = buildQizhengPacket(b.dtUTC, b.lat, b.lng, b.hasTime, qizhengTransitYears(refDate), refDate);
    return `${renderQizhengPrompt(packet)}\n\nSTRUCTURED_CHART_PACKET:\n${structuredPacketJson(packet)}`;
  }
  if (science === "western") {
    const chart = westernChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender, refDate);
    // เฟส 1 timeline: ชั้นเวลา "ทั้งปีเป้าหมาย" (exact transit/SR/profection/progression/eclipse/station)
    const targetYear = bangkokParts(refDate).year;
    let timeline: WesternTimeline | null = null;
    try {
      timeline = buildWesternTimeline(chart, { dtUTC: b.dtUTC, lat: b.lat, lng: b.lng }, targetYear);
    } catch { timeline = null; /* timeline ล้ม = ส่งผังหลักต่อ (degrade อย่างชัดเจนผ่าน TIMING_COVERAGE) */ }
    const packet = buildWesternPacket(chart, timeline);
    return `${renderWesternPrompt(packet)}\n\nSTRUCTURED_CHART_PACKET:\n${structuredPacketJson(packet)}`;
  }
  if (science === "vedic") {
    const chart = vedicChart(b.dtUTC, b.lat, b.lng, b.hasTime, refDate);
    // เฟส 2 timeline: ทศา 3 ชั้น + gochara segment + sade sati + varshaphala ของปีเป้าหมาย
    let vTimeline: VedicTimeline | null = null;
    try {
      vTimeline = buildVedicTimeline(chart, bangkokParts(refDate).year);
    } catch { vTimeline = null; /* timeline ล้ม = degrade ชัดเจนผ่าน notAvailable */ }
    const packet = buildVedicPacket(chart, vTimeline);
    return `${renderVedicPrompt(packet)}\n\nSTRUCTURED_CHART_PACKET:\n${structuredPacketJson(packet)}`;
  }
  if (science === "ziwei") {
    const packet = buildZiweiPacket(b.dtUTC, b.lat, b.lng, b.gender, b.hasTime, { refDate });
    return `${renderZiweiPrompt(packet)}\n\nSTRUCTURED_CHART_PACKET:\n${structuredPacketJson(packet)}`;
  }
  return "";
}

const LANG_NAME: Record<string, string> = { th: "ไทย", en: "อังกฤษ", zh: "จีน" };
const DECISIVE_READING_POLICY = [
  "=== นโยบายคำตอบผู้ใช้จริง ===",
  "นี่คือโหมดอ่านดวง ไม่ใช่โหมด audit ระบบ: ห้ามทำ Gap Register, readiness %, production checklist, หรือสรุปว่าเว็บพร้อม/ไม่พร้อม เว้นแต่คำถามผู้ใช้ถามตรวจระบบโดยตรง",
  "ถ้า field ที่เกี่ยวกับคำถามมีครบ ให้ฟันธงตามดวงอย่างชัดเจน ไม่ตอบกั๊ก ไม่วนบอกว่าต้องมีศาสตร์อื่น และไม่ยกชั้นสูงที่ไม่เกี่ยวกับคำถามมาเป็นข้อขาด",
  "ถ้า field สำคัญต่อคำถามขาดจริง ให้บอกเฉพาะจุดที่ขาดนั้น แล้วฟันธงเฉพาะขอบเขตที่ผังรองรับ ห้ามแต่งตำแหน่ง/มุม/ดาว/จังหวะเอง",
  "เรื่องสุขภาพ การเงิน กฎหมาย แต่งงาน ผ่าตัด หรือลงทุน: ฟันธงเชิงโหราศาสตร์ได้ แต่เขียนเป็นสัญญาณ/ข้อควรระวัง ไม่ใช่คำสั่งแทนผู้เชี่ยวชาญชีวิตจริง",
].join("\n");

const SPECIFIC_READING_CONTRACT = [
  "=== สัญญาความเฉพาะเจาะจง (สำคัญมาก) ===",
  "คำตอบต้องอ่านแล้วรู้ทันทีว่าเป็นดวงนี้เท่านั้น ไม่ใช่ horoscope ทั่วไปที่ใช้ได้กับหลายคน",
  "ต้องยกหลักฐานเฉพาะจากผังอย่างน้อย 5 จุดในโหมดเดี่ยว หรือ 6 จุดในโหมดคู่; ถ้า topic pack ที่ถูกเลือกมีหัวข้อ Answer Contract ให้ตอบให้ครบทุกบรรทัดของ contract นั้นแม้ต้องใช้หลักฐานมากกว่า 5 จุด",
  "แต่ละจุดต้องมีตำแหน่ง/ดาว/เรือน/เสา/วัยจร/สถานะจริงจากผัง แล้วแปลเป็นผลชีวิตหนึ่งประโยค",
  "ทุกคำฟันธงหลักต้องมี anchor จาก packet ติดอยู่ในประโยคเดียวกัน เช่น ดาว+ราศี+เรือน, องศา/宿/ฤกษ์, 四化/大限/流年, dignity/bala/ashtakavarga, หรือช่วงปีจรที่ระบบส่งมา",
  "ถ้าประโยคใดสามารถใช้กับคนทั่วไปได้โดยไม่ต้องมีผังนี้ ให้เขียนใหม่ให้มีชื่อเจ้าชะตา + field เฉพาะ + ผลชีวิตเฉพาะทันที",
  "ห้ามเขียนบทเรียนตำรา ห้ามอธิบายความหมายดาว/เรือน/เสาแบบลอย ๆ โดยไม่ผูกกับตำแหน่งของเจ้าชะตา",
  "ห้ามตอบกว้างแบบ 'การงานมีโอกาสดี', 'ความรักต้องสื่อสาร', 'สุขภาพควรพักผ่อน' ถ้าไม่มีหลักฐานเฉพาะจากผังตามหลังทันที",
  "ถ้าคำถามเป็นตัวอย่าง/demo/ว่าง ให้ตอบแบบโชว์ฝีมือ: ฟันธง 3 เรื่องที่เฉพาะที่สุดของดวงนี้ พร้อมหลักฐานและคำแนะนำที่ทำได้ทันที",
  "ห้ามไล่ครบทุกเรื่องชีวิตถ้าคำถามไม่ได้ถาม ให้ลงลึกเฉพาะเรื่องที่ถามก่อน แล้วค่อยเสริมจุดเฉพาะที่จำเป็น",
  "ปิดท้ายด้วย 'จุดเฉพาะที่ทำให้คำตอบนี้เป็นของดวงนี้' 3 ข้อ เว้นแต่คำตอบสั้นมาก; แต่ละข้อต้องมี field เฉพาะ ไม่ใช่คำแนะนำทั่วไป",
].join("\n");

const FUSION_JUDGE_SYNTHESIS_CONTRACT = [
  "=== สัญญาการหลอมรวม Fusion Judge ===",
  "อย่าเฉลี่ยคำตอบทุกศาสตร์ให้กลายเป็นคำกลาง ๆ; ให้ดึงเฉพาะ claim ที่มีหลักฐานเฉพาะจาก panel มาใช้",
  "ก่อนฟันธงแต่ละข้อ ให้แยกในใจว่า: ศาสตร์ไหนหนุน, ศาสตร์ไหนค้าน, ศาสตร์ไหนตอบกว้างหรือไม่มีหลักฐานพอ",
  "ถ้า panel ใดให้แต่คำกว้างโดยไม่มีตำแหน่ง/เรือน/ดาว/วัยจร/ช่วงเวลาเฉพาะ ให้ลดน้ำหนัก panel นั้นและห้ามเอาไปนับเป็นฉันทามติ",
  "จุดร่วมที่ฟันธงหนักต้องมีอย่างน้อย 2 ศาสตร์หนุนด้วย anchor เฉพาะ ถ้ามีแค่ศาสตร์เดียวให้เขียนว่าเป็นสัญญาณเฉพาะศาสตร์นั้น ไม่ใช่ฉันทามติ",
  "ถ้าศาสตร์ต่างกัน ให้แปลเป็นเงื่อนไขชีวิตจริง ไม่ใช่บอกว่าสับสน เช่น 'งานหนุนแต่เงินรั่ว', 'คู่มีแรงดึงแต่ timing ยังหนัก'",
  "คำตอบสุดท้ายต้องมีอย่างน้อย 3 หลักฐานข้ามศาสตร์ที่ระบุชื่อศาสตร์และ anchor เฉพาะ เช่น ดาว/เรือน/ภพ/วัยจร/四化/行限/dasha/transit",
  "ถ้าคำถามเป็นฤกษ์/ถามยาม/medical/mundane/locality ให้รักษาขอบเขตของแต่ละ panel: specialty missing ไม่ใช่ห้ามตอบทั้งหมด แต่ห้ามแปลง fallback เป็นคำตัดสิน specialty เต็มระบบ",
].join("\n");

function subjectLockLine(births: BirthData[]): string {
  if (births.length === 1) {
    const name = births[0]?.name || "เจ้าชะตา";
    return [
      "=== SUBJECT_LOCK / ห้ามตอบกว้าง ===",
      `ดวงที่ต้องอ่านมีคนเดียว: "${name}". ทุกคำฟันธงต้องผูกกับคนนี้เท่านั้น`,
      `ต้องเอ่ยชื่อ "${name}" ในฟันธงประโยคแรก และห้ามเขียนเหมือนคำทำนายรวมที่ใช้ได้กับหลายคน`,
      "ห้ามนับการไม่มีดวงคู่เป็นข้อเสียของคำถามเดี่ยว เว้นแต่ผู้ใช้ถามเรื่องคู่/สมพงษ์โดยตรง",
    ].join("\n");
  }
  const names = births.map((b) => `"${b.name || "ดวง"}"`).join(" กับ ");
  return [
    "=== SUBJECT_LOCK / ห้ามตอบเกินคู่ที่เลือก ===",
    `ดูคู่เฉพาะ ${names}. ห้ามเขียนเป็นคำตอบกว้างสำหรับหลายดวงหรือหลายคู่`,
    "ทุกย่อหน้าต้องระบุว่าพูดถึงคนใด หรือพูดถึงปฏิกิริยาของทั้งคู่จากรายการข้ามดวงที่ระบบส่งมา",
    "ห้ามใช้ข้อดีจุดเดียวลบข้อเสียใหญ่ และห้ามใช้ข้อเสียจุดเดียวกลบแรงหนุนหลักของทั้งคู่",
  ].join("\n");
}

const MARKDOWN_FORMAT_CONTRACT = [
  "รูปแบบการจัดหน้า (บังคับ · หน้าเว็บ render markdown):",
  "- ใช้หัวข้อ ## คั่นแต่ละส่วน · เว้นบรรทัดว่างระหว่างย่อหน้า ห้ามเขียนติดกันเป็นพืด",
  "- ถ้าเทียบหลายรายการ/หลายเดือน/หลายปี/หลายคน ตั้งแต่ 3 แถวขึ้นไป ต้องใช้ตาราง markdown (| หัว | ... | + บรรทัด |---| + แถวข้อมูล)",
  "- หลักฐานหลายจุดใช้ bullet (- ) จุดละบรรทัด · เน้นคำสำคัญ/วันที่/ชื่อดาวด้วย **ตัวหนา**",
].join("\n");

function answerFormatLine(births: BirthData[], judge = false): string {
  const names = births.map((b) => b.name || "เจ้าชะตา").join(" / ");
  if (judge) {
    return [
      MARKDOWN_FORMAT_CONTRACT,
      "รูปแบบตอบบังคับ:",
      `1) ฟันธงรวมเฉพาะ ${names} 1-2 ประโยค ห้ามขึ้นต้นด้วยภาพรวมทั่วไป`,
      "2) จุดที่ศาสตร์เห็นตรงกัน 3 ข้อ โดยแต่ละข้อระบุหลักฐานเฉพาะจากศาสตร์นั้น ๆ",
      "3) จุดที่ต่างกันหรือข้อระวัง 1-2 ข้อ เฉพาะที่มีผลต่อคำถาม",
      "4) ทำอะไรต่อ 3 ข้อ แบบลงมือได้จริง",
      "ห้ามพูดคำว่า packet/engine/prompt/CLI/คัมภีร์ในคำตอบ",
    ].join("\n");
  }
  return [
    MARKDOWN_FORMAT_CONTRACT,
    "รูปแบบตอบบังคับ:",
    `1) ฟันธงเฉพาะ ${names} 1-2 ประโยค ห้ามขึ้นต้นด้วยภาพรวมทั่วไป`,
    "2) หลักฐานเฉพาะจากผังอย่างน้อย 5 จุด (โหมดคู่ใช้ 6 จุด) และถ้า topic pack มี Answer Contract ให้ทำครบทุกบรรทัด แต่ละจุดต้องโยงกับคำถามโดยตรง",
    "3) คำตอบตรงคำถามแบบลงลึก ไม่ใช่สรุปกว้างทุกมิติ",
    "4) คำแนะนำปฏิบัติ 3 ข้อ ที่สัมพันธ์กับหลักฐานดวง",
    "ห้ามพูดคำว่า packet/engine/prompt/CLI/คัมภีร์ในคำตอบ",
  ].join("\n");
}

/** prompt 1 panel ศาสตร์ (รองรับ 1-2 ดวง) */
export function buildSciencePrompt(
  science: ScienceId,
  births: BirthData[],
  question: string,
  lang = "th",
  refDate = new Date("2026-06-30T00:00:00Z"),
  timingRefOverride?: FusionTimingReference,
): string {
  const bind = DISCIPLINES[science];
  const timingRef = timingRefOverride || resolveFusionTimingReference(question, refDate);
  const selectedCanonFiles = selectCanonFilesForPrompt(science, question, births);
  const assemble = (bundle: CanonBundle) => {
    const L: string[] = [];
    L.push(`คุณคือซินแสผู้เชี่ยวชาญ "${bind.labelTh}" (${bind.labelZh})`);
    L.push(`อ่านดวงจาก "ผังที่ระบบคำนวณ" ด้านล่างเท่านั้น · ⚠️ ${bind.termGuard}`);
    L.push(`ห้ามเดาตำแหน่งดาว/เรือน/ดวง · field ไหนไม่มีให้บอกว่าไม่มี · ตอบภาษา${LANG_NAME[lang] || "ไทย"}นำ`);
    L.push("คำตอบต้องสอดคล้องกับคัมภีร์/กฎ/SOURCE_MAP ที่แนบมาและ field ใน STRUCTURED_CHART_PACKET เท่านั้น · ห้ามใช้ความรู้ทั่วไปนอก packet มาเติมคำฟันธง");
    L.push(DECISIVE_READING_POLICY);
    L.push(subjectLockLine(births));
    L.push(SPECIFIC_READING_CONTRACT);
    L.push(`=== จังหวะเวลาที่ใช้คำนวณจร ===\nวันอ้างอิงจร: ${timingRef.refDate.toISOString().slice(0, 10)} · ปีเป้าหมาย ${timingRef.targetYear} · ที่มา: ${timingRef.label}\nถ้าคำถามถามปี/วันที่นี้ ให้ใช้จรของปีเป้าหมายนี้เป็นแกน ห้ามตอบว่าเห็นเฉพาะปีปัจจุบันเมื่อข้อมูลจรปีเป้าหมายถูกส่งมาแล้ว`);
    if (bundle.text) {
      L.push(`\n=== คัมภีร์ ${bind.labelTh} (หลักการตีความ — ใช้เป็นฐาน) ===`);
      if (selectedCanonFiles?.length) {
        L.push(`SOURCE_ROUTER: selected_by_question=${selectedCanonFiles.join(",")}`);
      }
      L.push(`SOURCE_MAP: ${bundle.sourceMap.map((r) => `${r.sourceId}[${r.licenseClass}/${r.mode}/${r.includedChars}${r.truncated ? "/truncated" : ""}]`).join(" | ")}`);
      L.push(bundle.text);
      L.push(`=== จบคัมภีร์ · hash=${bundle.textHashSha256.slice(0, 16)} · chars=${bundle.promptChars} ===`);
    }
    births.forEach((b, i) => {
      L.push(`\n=== ผังดวง${births.length > 1 ? ` คนที่ ${i + 1}: ${b.name}` : ` ${b.name}`} ===`);
      L.push(birthLocalLine(b));
      if (!b.hasTime) {
        if (science === "western") {
          L.push(`⚠️ ดวงนี้ไม่ทราบเวลาเกิด — Western ให้อ่านแบบ no-time: ใช้ดาวในราศี/ฐานะดาว/มุมดาว/ธาตุ/คุณภาพ และปิดลัคนา MC เรือน จุดโชค sect และ chart ruler`);
        } else if (science === "vedic") {
          L.push(`⚠️ ดวงนี้ไม่ทราบเวลาเกิด — Vedic ให้อ่านแบบ no-time: ใช้ graha ใน rashi, dignity, combustion, retrograde, drishti ระหว่าง graha เท่านั้น; ห้ามฟันหนักจาก Lagna/bhava และให้ถือ Moon nakshatra/Vimshottari เป็นไม่แน่นอนถ้า packet ติดธง`);
        } else {
          L.push(`⚠️ ดวงนี้ไม่ทราบเวลาเกิด — ส่วนที่ต้องลัคนา/เรือนอ่านไม่ได้ (อ่านเท่าที่มี)`);
        }
      }
      L.push(renderChartForScience(science, b, timingRef.refDate));
    });
    // เฟส 6: ② ช่วงหลายปี → บล็อกสรุปย่อรายปี (ต่อดวง)
    const yearRange = resolveFusionYearRange(question, refDate);
    if (yearRange) {
      births.forEach((b) => { L.push(renderMultiYearBlock(science, b as FusionBirthLike, yearRange.startYear, yearRange.endYear)); });
    }
    if (births.length > 1) {
      L.push(renderPairInteractionPacket(science, births, timingRef.refDate));
      // เฟส 6: ① ชั้นเวลาโหมดดูคู่ (ปฏิทินร่วมรายเดือนของปีเป้าหมาย)
      L.push(renderPairTimingBlock(science, births as FusionBirthLike[], timingRef.targetYear));
      L.push(`\n=== ดูคู่ ===\nวิเคราะห์ทั้ง ${births.length} ดวง + ความเข้ากัน/ปฏิกิริยาระหว่างกัน ตามหลัก ${bind.labelTh} (ส่งคำตอบครบทุกดวง) · ใช้เฉพาะ PAIR_INTERACTION_PACKET เป็นรายการปฏิกิริยาข้ามดวง ห้ามสร้างคู่/มุม/ดาวข้ามดวงเพิ่มเอง · แยกแรงหนุนกับแรงเสียดทานให้ชัด อย่าให้จุดดีจุดเดียวกลบข้อเสียใหญ่ หรือข้อเสียจุดเดียวกลบแรงหนุนหลัก`);
    } else {
      L.push(`\n=== โหมดเดี่ยว ===\nมีผังเดียวโดยเจตนา · อย่านับ "ไม่มีดวงคู่/ไม่มีปฏิกิริยาข้ามสองผัง" เป็นข้อมูลขาดของการดูดวงเดี่ยว เว้นแต่คำถามผู้ใช้ถามเรื่องดูคู่/สมพงษ์โดยตรง`);
    }
    L.push(`\n=== คำถามผู้ถาม ===\n${question}`);
    L.push(`\n${answerFormatLine(births)}`);
    return L.join("\n");
  };
  let maxCanon = CANON_TEXT_MAX_CHARS;
  let bundle = loadCanonBundle(science, maxCanon, selectedCanonFiles);
  let prompt = assemble(bundle);
  while (prompt.length > FUSION_PANEL_PROMPT_MAX_CHARS && maxCanon > CANON_TEXT_MIN_CHARS) {
    const shrinkBy = prompt.length - FUSION_PANEL_PROMPT_MAX_CHARS + 2_000;
    maxCanon = Math.max(CANON_TEXT_MIN_CHARS, maxCanon - shrinkBy);
    bundle = loadCanonBundle(science, maxCanon, selectedCanonFiles);
    prompt = assemble(bundle);
  }
  if (prompt.length > FUSION_PANEL_PROMPT_MAX_CHARS) {
    const marker = `\n[TRUNCATED_NONCRITICAL_PREFIX_FOR_PROMPT_CAP originalChars=${prompt.length}]\n`;
    const headBudget = 12_000;
    const tailBudget = FUSION_PANEL_PROMPT_MAX_CHARS - headBudget - marker.length;
    prompt = `${prompt.slice(0, headBudget)}${marker}${prompt.slice(-tailBudget)}`;
  }
  return prompt.slice(0, FUSION_PANEL_PROMPT_MAX_CHARS);
}

/** prompt judge หลอมรวมทุก panel */
export function buildJudgePrompt(panels: { science: ScienceId; reply: string }[], births: BirthData[], question: string, lang = "th"): string {
  const L: string[] = [];
  L.push(`คุณคือ "ซินแสใหญ่" ผู้หลอมรวมคำพยากรณ์จากหลายศาสตร์เป็นคำตอบเดียว`);
  L.push(`มี ${panels.length} ศาสตร์อ่านดวง${births.length > 1 ? "คู่" : ""}เดียวกัน · หน้าที่: หา "จุดตรงกัน = ฟันธงหนัก" + "จุดต่าง = เงื่อนไข/ข้อระวัง" + สรุปคำแนะนำ`);
  L.push(`⚠️ ห้ามคำนวณดวงเอง · ใช้เฉพาะคำพยากรณ์ของแต่ละศาสตร์ด้านล่าง · ติดป้ายชื่อศาสตร์ทุกครั้งที่อ้างอิง · ตอบภาษา${LANG_NAME[lang] || "ไทย"}`);
  L.push(`⚠️ ห้ามเอาหลักของศาสตร์หนึ่งไปตัดสิน/หักล้างอีกศาสตร์ (แต่ละศาสตร์มีกติกาของตัวเอง) · หน้าที่คุณคือ "เทียบข้อสรุป" ว่าตรง/ต่างกันอย่างไร ไม่ใช่ชี้ว่าศาสตร์ไหนถูก`);
  L.push(DECISIVE_READING_POLICY);
  L.push(subjectLockLine(births));
  L.push(SPECIFIC_READING_CONTRACT);
  L.push(FUSION_JUDGE_SYNTHESIS_CONTRACT);
  L.push(`ถ้า panel ใดหลุดไปตอบแบบ audit ระบบ/Gap Register/readiness ทั้งที่คำถามเป็นการดูดวง ให้ถือว่าเป็นคำตอบหลุดรูปแบบ และใช้เฉพาะหลักฐานดวงหรือคำฟันธงที่เกี่ยวกับชีวิตผู้ถามเท่านั้น`);
  panels.forEach((p) => {
    const reply = p.reply.length > JUDGE_PANEL_REPLY_MAX_CHARS
      ? `${p.reply.slice(0, JUDGE_PANEL_REPLY_MAX_CHARS)}\n[TRUNCATED_FOR_JUDGE:${p.reply.length}]`
      : p.reply;
    L.push(`\n=== ศาสตร์ ${DISCIPLINES[p.science].labelTh} ว่า ===\n${reply}`);
  });
  L.push(`\n=== คำถาม ===\n${question}`);
  L.push(`\n${answerFormatLine(births, true)}`);
  return L.join("\n").slice(0, FUSION_PANEL_PROMPT_MAX_CHARS);
}
