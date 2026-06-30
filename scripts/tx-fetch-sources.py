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

def archive_pdf(item_id, destdir):
    """ดึงทุก .pdf (ตัวเต็ม คมชัด) ของ archive item"""
    try:
        meta = json.loads(get(f"https://archive.org/metadata/{item_id}"))
    except Exception as e:
        print(f"  ✗ meta {item_id}: {e}"); return
    files = [f["name"] for f in meta.get("files", []) if f["name"].lower().endswith(".pdf")]
    if not files: print(f"  ✗ {item_id}: ไม่มี .pdf"); return
    for i, fn in enumerate(files):
        url = f"https://archive.org/download/{item_id}/" + urllib.parse.quote(fn)
        safe = f"{item_id}__{i+1:02d}.pdf".replace("/", "_")
        dest = f"{BASE}/{destdir}/{safe}"
        if os.path.exists(dest) and os.path.getsize(dest) > 100000: print(f"  ⏭ {safe} มีแล้ว"); continue
        n = dl(url, dest)
        if n: print(f"  ✓ {item_id} [{i+1}/{len(files)}] {n//1048576}MB")

def commons_api(params):
    params["format"]="json"
    u="https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode(params)
    return json.loads(get(u))

def commons_search_dl(query, destdir, limit=80):
    """ค้น File: intitle แล้วโหลดทุกไฟล์ (ผ่าน imageinfo url)"""
    r=commons_api({"action":"query","list":"search","srsearch":f"intitle:{query}","srnamespace":6,"srlimit":limit})
    titles=[s["title"] for s in r["query"]["search"]]
    print(f"  พบ {len(titles)} ไฟล์")
    for i in range(0,len(titles),20):
        batch="|".join(titles[i:i+20])
        info=commons_api({"action":"query","titles":batch,"prop":"imageinfo","iiprop":"url"})
        for p in info["query"]["pages"].values():
            ii=p.get("imageinfo")
            if not ii: continue
            url=ii[0]["url"]; fn=p["title"].replace("File:","").replace("/","_").replace(" ","_")
            dest=f"{BASE}/{destdir}/{fn}"
            if os.path.exists(dest) and os.path.getsize(dest)>50000: print(f"  ⏭ {fn[:30]}"); continue
            n=dl(url,dest)
            if n: print(f"  ✓ {fn[:34]} {n//1048576}MB")

GROUP = sys.argv[1] if len(sys.argv) > 1 else "all"

if GROUP == "commons2":
    print("== 御製曆象考成 (อัลกอริทึม步紫氣 · 55) ==")
    commons_search_dl("御製曆象考成", "07_calendar_algo")
    print("== 增補星平會海 (7) ==")
    commons_search_dl("星平會海", "02_star_encyclopedia/xingping_huihai")
    sys.exit(0)

if GROUP == "fullpdf":
    print("== 果老星宗 PDF เต็ม (8卷·656MB) ==")
    archive_pdf("guolaoxingzong", "01_qizheng_core/guolaoxingzong")
    print("== 星學大成 PDF เต็ม (16) ==")
    for n in range(6054192, 6054208): archive_pdf(f"{n:08d}.cn", "02_star_encyclopedia/xingxue_dacheng")
    print("== 欽定協紀辨方書 PDF เต็ม (26) ==")
    for n in range(6056502, 6056528): archive_pdf(f"{n:08d}.cn", "04_xuanze_decision/qinding_xieji_bianfangshu")
    print("== 禽星易見 + 玉匣記 PDF ==")
    archive_pdf("1781_20260505", "05_supplements/qinxing_yijian")
    archive_pdf("20241205_20241205_0310", "05_supplements/yu_xia_ji")
    sys.exit(0)

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
