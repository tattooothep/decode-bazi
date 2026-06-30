#!/usr/bin/env python3
# ดึงตำรา七政四餘/擇日 เป็น text (archive _djvu.txt) + สแกนเล็ก (Commons) · ประหยัด disk
import json, os, sys, urllib.request, urllib.parse, ssl
UA = "TianxingPack/1.0 (tattoothep@gmail.com)"
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
BASE = "knowledge/tianxing/sources"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=60, context=ctx).read()

def dl(url, dest):
    try:
        data = get(url); os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "wb").write(data); return len(data)
    except Exception as e:
        print(f"  ✗ {os.path.basename(dest)}: {e}"); return 0

def archive_djvu(item_id, destdir):
    """ดึงทุก _djvu.txt ของ archive item"""
    try:
        meta = json.loads(get(f"https://archive.org/metadata/{item_id}"))
    except Exception as e:
        print(f"  ✗ meta {item_id}: {e}"); return
    files = [f["name"] for f in meta.get("files", []) if f["name"].endswith("_djvu.txt")]
    if not files: print(f"  ✗ {item_id}: ไม่มี _djvu.txt"); return
    for i, fn in enumerate(files):
        url = f"https://archive.org/download/{item_id}/" + urllib.parse.quote(fn)
        safe = f"{item_id}__{i+1:02d}_djvu.txt".replace("/", "_")
        n = dl(url, f"{BASE}/{destdir}/{safe}")
        if n: print(f"  ✓ {item_id} [{i+1}/{len(files)}] {n//1024}KB")

GROUP = sys.argv[1] if len(sys.argv) > 1 else "all"

if GROUP in ("guolao", "all"):
    print("== 果老星宗 ==")
    archive_djvu("guolaoxingzong", "01_qizheng_core/guolaoxingzong")

if GROUP in ("xingxue", "all"):
    print("== 星學大成 (16) ==")
    for n in range(6054192, 6054208):
        archive_djvu(f"{n:08d}.cn", "02_star_encyclopedia/xingxue_dacheng")

if GROUP in ("xieji", "all"):
    print("== 欽定協紀辨方書 (26) ==")
    for n in range(6056502, 6056528):
        archive_djvu(f"{n:08d}.cn", "04_xuanze_decision/qinding_xieji_bianfangshu")

if GROUP in ("supp", "all"):
    print("== 禽星易見 + 玉匣記 ==")
    archive_djvu("1781_20260505", "05_supplements/qinxing_yijian")
    archive_djvu("20241205_20241205_0310", "05_supplements/yu_xia_ji")

if GROUP in ("commons", "all"):
    print("== Commons scans (เล็ก) ==")
    commons = {
        "04_xuanze_decision/xuanze_zongjing/xuanze_zongjing.pdf": "https://upload.wikimedia.org/wikipedia/commons/7/7a/NCL-06639_%E9%81%B8%E6%93%87%E5%AE%97%E9%8F%A1.pdf",
        "03_zaoming_tianxing/tianyuan_ge/tianyuan_ge.pdf": "https://upload.wikimedia.org/wikipedia/commons/a/a8/Shanghai_%E5%A4%A9%E5%85%83%E6%AD%8C%E4%B8%80%E5%8D%B7%E4%B8%80%E5%8D%B7.pdf",
        "03_zaoming_tianxing/zaoming_zongjingji/zaoming_zongjingji_full.pdf": "https://upload.wikimedia.org/wikipedia/commons/9/9e/Shanghai_%E9%80%A0%E5%91%BD%E5%AE%97%E9%8F%A1%E9%9B%86%E5%8D%81%E4%BA%8C%E5%8D%B7.pdf",
    }
    for dest, url in commons.items():
        n = dl(url, f"{BASE}/{dest}")
        if n: print(f"  ✓ {os.path.basename(dest)} {n//1024//1024}MB")

print("done.")
