#!/usr/bin/env python3
"""Unit tests for the Natal + Daily Overview Text Code Mapper.

Verifies (skeleton level · no translation):
- Day Master stem → code (10 stems)
- DM strength label → code (strong/weak/balanced/follow/special)
- Dominant / weak element list → codes
- Daily natal relation + yongshen/jishen/dm_effect → daily codes
- Output shape: { text_codes, debug }
- Static checks: no narrative / advice / warning in source
- Registry covers every code referenced by the mapper
"""
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "data/i18n/code-registry/natal-daily-overview.json"
MAPPER = ROOT / "src/lib/text-code-mapper.ts"


def load_registry() -> dict:
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


def known_codes() -> set[str]:
    reg = load_registry()
    out: set[str] = set()
    for group in reg["groups"].values():
        out.update(group["codes"])
    return out


def mapper_text() -> str:
    return MAPPER.read_text(encoding="utf-8")


def test_registry_groups_complete() -> None:
    reg = load_registry()
    required_groups = {
        "natal_dm_type",
        "natal_dm_strength",
        "natal_element_balance",
        "natal_overview_composer",
        "daily_natal_interaction",
        "daily_yongshen_jishen",
        "daily_dm_effect",
        "daily_overview_composer",
    }
    assert required_groups.issubset(reg["groups"].keys()), set(reg["groups"].keys())


def test_stem_to_dm_code_covers_10_stems() -> None:
    reg = load_registry()
    stem_map = reg["stem_to_dm_code"]
    stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]
    for stem in stems:
        assert stem in stem_map, stem
        assert stem_map[stem] in known_codes(), stem_map[stem]


def test_dm_strength_mapping() -> None:
    reg = load_registry()
    s_map = reg["strength_to_code"]
    for label in ["strong", "very_strong", "extremely_strong", "slightly_strong"]:
        assert s_map[label] == "natal_dm_strong", label
    for label in ["weak", "very_weak", "extremely_weak", "slightly_weak"]:
        assert s_map[label] == "natal_dm_weak", label
    assert s_map["balanced"] == "natal_dm_balanced"
    for label in ["follow", "follow_wealth", "follow_official", "follow_output", "follow_seal"]:
        assert s_map[label] == "natal_dm_follow_structure", label
    assert s_map["special"] == "natal_dm_special_structure"


def test_element_balance_mapping() -> None:
    reg = load_registry()
    elements = ["wood", "fire", "earth", "metal", "water"]
    for el in elements:
        assert reg["element_high_codes"][el] == f"natal_element_{el}_high"
        assert reg["element_low_codes"][el] == f"natal_element_{el}_low"
        assert reg["element_high_codes"][el] in known_codes()
        assert reg["element_low_codes"][el] in known_codes()


def test_daily_personalized_mapping() -> None:
    reg = load_registry()
    assert reg["daily_relation_to_code"]["supports"] == "daily_supports_natal"
    assert reg["daily_relation_to_code"]["challenges"] == "daily_challenges_natal"
    assert reg["daily_relation_to_code"]["mixed"] == "daily_mixed_with_natal"
    assert reg["daily_dm_effect_to_code"]["strengthen"] == "daily_dm_strengthened"
    assert reg["daily_dm_effect_to_code"]["weaken"] == "daily_dm_weakened"
    for code in [
        "daily_supports_natal",
        "daily_challenges_natal",
        "daily_mixed_with_natal",
        "daily_yongshen_supported",
        "daily_jishen_activated",
        "daily_dm_strengthened",
        "daily_dm_weakened",
    ]:
        assert code in known_codes(), code


def test_mapper_source_no_narrative() -> None:
    text = mapper_text()
    # ห้ามมีคำแปล/คำทำนาย/คำขยายใน source
    forbidden_substrings = [
        "ปิดดีล", "ปิดการขาย", "ชง", "ดีมาก", "หนุนดวง",
        "บั่นทอน", "ระวัง", "วันนี้ดี", "ฤกษ์มงคล",
        "advice:", "narrative:", "warning:",
    ]
    for s in forbidden_substrings:
        assert s not in text, f"forbidden text in mapper: {s!r}"
    # ห้ามมี string ภาษาไทยใน string literal
    th_in_string_literal = re.findall(r'"[^"]*[ก-๙][^"]*"', text)
    assert not th_in_string_literal, f"thai text in literal: {th_in_string_literal[:3]}"


def test_mapper_source_uses_registry_only() -> None:
    text = mapper_text()
    assert "natal-daily-overview.json" in text, "must import registry"
    assert "buildOverviewCodes" in text
    assert "text_codes" in text
    assert "debug" in text
    # ไม่ควรมี hardcoded fallback text
    forbidden_calls = ["fallback:", "default:'", 'default:"']
    for s in forbidden_calls:
        assert s not in text, f"forbidden fallback in mapper: {s!r}"


def test_mapper_exports_expected_helpers() -> None:
    text = mapper_text()
    expected = [
        "mapDayMaster",
        "mapDmStrength",
        "mapDominantElements",
        "mapWeakElements",
        "mapDailyNatalRelation",
        "mapDailyDmEffect",
        "mapYongshenJishen",
        "buildNatalCodes",
        "buildDailyCodes",
        "buildOverviewCodes",
        "listKnownCodes",
    ]
    for name in expected:
        assert f"export function {name}" in text, name


def test_output_shape_documented() -> None:
    """The mapper's buildOverviewCodes contract returns { text_codes, debug }."""
    text = mapper_text()
    assert "OverviewCodesResult" in text
    # type fields
    assert "text_codes: string[]" in text
    assert "debug:" in text
    assert "matched_groups" in text


def main() -> int:
    tests = [
        test_registry_groups_complete,
        test_stem_to_dm_code_covers_10_stems,
        test_dm_strength_mapping,
        test_element_balance_mapping,
        test_daily_personalized_mapping,
        test_mapper_source_no_narrative,
        test_mapper_source_uses_registry_only,
        test_mapper_exports_expected_helpers,
        test_output_shape_documented,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
