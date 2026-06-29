# รายงานวิจัย #4: ยืนยันแหล่งตำรา (manifest)
> เตรียมข้อมูล 29 มิ.ย. 2026 · เช็คผ่าน metadata API ล้วน (ไม่โหลดไฟล์จริง) · ทุกชิ้น verified · JSON เต็ม → ../source_manifest.json

## archive.org (มี OCR _djvu.txt ทุกไฟล์)
| เล่ม | identifier | 卷/冊 | หน้า | ขนาด | layer |
|---|---|---|---|---|---|
| 果老星宗、鄭氏星案 | `guolaoxingzong` | 卷1-10/8PDF | — | 688MB (text PDF · item รวม 5.3GB มี EPUB/JP2 ไม่ต้องใช้) | qizheng_core |
| 果老星宗卷一 | `glxz1` | 卷1 | 50 | 92MB | qizheng_core (ซ้ำ—ตัดได้) |
| 星學大成 | `06054192.cn`–`06054207.cn`(16) | 30卷/16冊 | 2307 | 478MB | star_rule (tag星命/擇日) |
| 禽星易見 | `1781_20260505` | 1卷 | — | 16MB | star_rule/supplement |
| 欽定協紀辨方書 | `06056502.cn`–`06056527.cn`(26) | 36卷/26冊 | 3522 | 676MB | official_crosscheck |
| 繪圖增廣玉匣記 | `20241205_20241205_0310` | full | — | 321MB | supplement |

## Wikimedia Commons (ยืนยัน imageinfo API)
| เล่ม | ไฟล์ | 冊 | หน้า | OCR | ขนาด | layer |
|---|---|---|---|---|---|---|
| 選擇宗鏡 | NCL-06639 | 1 | 57 | ❌ ภาพล้วน ต้อง OCR | 14MB | xuanze_rule |
| 天元歌 | Shanghai_天元歌 | 1卷 | 58 | ❌ ต้อง OCR | 4MB | zaoming_rule |
| 造命宗鏡集 | CADAL 02094350–61 (12) | 12冊 | 763 | ✅ OCR ฝัง djvu | 37MB | zaoming_rule |
| 增補星平會海 | CADAL 02055515–21 (7) | 7冊 | — | ✅ OCR ฝัง | 22MB | supplement(แท้คือ七政四餘 · tag) |

## สรุป
- **10 ชุด / 65 ไฟล์ verified ครบ · public-domain ตามอายุทั้งหมด**
- โหลด PDF/djvu ทั้งหมด ≈ **2.3GB** · ถ้าเอา OCR-text (archive _djvu.txt + Commons djvu) ≈ **~60MB**
- ⚠️ wget Wikimedia ต้องใส่ `-U "TianxingPack/1.0 (email)"` กัน 403
- 天元選擇辨正 = ไม่มี open scan (backlog V2)

## map layer ที่กำกวม (รอเจ้านาย/ซินแสยืนยัน)
禽星易見 (star_rule หรือ xuanze) · 星平會海 (supplement หรือ core七政四餘) · 星學大成 (ต้อง tag 星命 vs 擇日 รายส่วน)
