#!/usr/bin/env python3
"""
enhance_palm.py — เปิดตาให้ AI เห็นเส้นลายมือชัดสุด (ไม่ต้อง GPU)
input:  รูปฝ่ามือ (มือถือถ่าย)
output: <stem>_clear.jpg (ภาพจริงคมขึ้น) + <stem>_lines.jpg (เน้นเส้น) + JSON {clarity, ...}
วัดความเบลอด้วย Laplacian variance -> "% ความชัด" (กันอ่านมั่วจากรูปเบลอ)
"""
import sys, json, cv2, numpy as np

def clarity_pct(gray):
    # Laplacian variance: ยิ่งสูง = คมชัด. map -> 0..100 (คาลิเบรตหยาบ)
    v = cv2.Laplacian(gray, cv2.CV_64F).var()
    # 20=เบลอมาก ~ 400+=คมมาก
    pct = max(0, min(100, (np.log1p(v) - np.log1p(20)) / (np.log1p(400) - np.log1p(20)) * 100))
    return round(pct), round(v, 1)

def enhance(path, stem):
    img = cv2.imread(path)
    if img is None:
        return {"ok": False, "error": "อ่านรูปไม่ได้"}
    h, w = img.shape[:2]

    # 1) upscale ถ้าเล็ก (ลายมือต้องละเอียด) — Lanczos, cap ที่ 1600px ด้านยาว
    long_side = max(h, w)
    if long_side < 1200:
        scale = min(3.0, 1400 / long_side)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4)
        h, w = img.shape[:2]

    gray0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cpct, cvar = clarity_pct(gray0)

    # 2) CLAHE บน L channel (เด่นเส้นในแสงไม่สม่ำเสมอ)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l2 = clahe.apply(l)
    clear = cv2.cvtColor(cv2.merge((l2, a, b)), cv2.COLOR_LAB2BGR)

    # 3) unsharp mask (คมเส้นขึ้นบนภาพจริง)
    blur = cv2.GaussianBlur(clear, (0, 0), 3)
    clear = cv2.addWeighted(clear, 1.5, blur, -0.5, 0)

    # 4) ภาพเน้นเส้น: grayscale + CLAHE แรง + adaptive-ish edge (ให้ AI เห็นโครงเส้น)
    g = clahe.apply(gray0)
    g = cv2.bilateralFilter(g, 7, 50, 50)         # ลด noise คงขอบ
    # black-hat เน้นร่องเส้น (เส้นมือ = ร่องเข้ม)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, kernel)
    lines = cv2.normalize(bh, None, 0, 255, cv2.NORM_MINMAX)
    lines = cv2.convertScaleAbs(lines, alpha=1.6, beta=0)
    lines = 255 - lines   # เส้นดำบนพื้นขาว อ่านง่าย

    p_clear = f"{stem}_clear.jpg"
    p_lines = f"{stem}_lines.jpg"
    cv2.imwrite(p_clear, clear, [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(p_lines, lines, [cv2.IMWRITE_JPEG_QUALITY, 92])

    return {"ok": True, "clarity": cpct, "lap_var": cvar,
            "size": [w, h], "clear": p_clear, "lines": p_lines,
            "advise": "ดี" if cpct >= 55 else ("พอใช้" if cpct >= 35 else "เบลอ-ควรถ่ายใหม่")}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: enhance_palm.py <img> [stem]"}))
        sys.exit(1)
    src = sys.argv[1]
    stem = sys.argv[2] if len(sys.argv) > 2 else src.rsplit(".", 1)[0]
    print(json.dumps(enhance(src, stem), ensure_ascii=False))
