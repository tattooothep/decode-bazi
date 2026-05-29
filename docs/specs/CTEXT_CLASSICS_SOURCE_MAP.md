# CTEXT Classics Source Map (hourkey)

อัปเดตล่าสุด: 2026-05-28  
วัตถุประสงค์: map แหล่งตำราคลาสสิกจาก ctext (`res`/`chapter`) สำหรับใช้กับ judgment engine, rule-table encode และ golden fixtures

## Canonical Sources

| ตำรา | res | chapter ที่พบจากหน้า res | ใช้ทำ |
|---|---:|---|---|
| 滴天髓闡微 (任鐵樵) | 221357 | 126492, 826601, 703472, 257437, 530386, 827688 | verify 化氣格 engine + 病藥 + balance logic |
| 三命通會 | 532360 | พบหลาย chapter (ตัวอย่างที่เจอ: 212352, 17423, ...) | verify 10神/納音/神煞/格局 cross-check |
| 淵海子平 | 727782 | 296619, 524726, 901791 | verify 六親/格局 baseline 子平 |
| 神峰通考 (張楠) | 627586 | 739505, 552406, 938428, 472359, 153898, 109247, 545846 | 病藥說 (primary) |
| 奇門遁甲元靈經 | 148390 | 159947, 118579, 312868, 875731, 116473, 495165, 214852, 237860, 958139, 424578, 636397, 877522, 706534, 51982, 631725, 404789, 669066, 97793 | ฉีเหมิน 年/月/日家 |
| 葬書 (郭璞) | 404104 | 592339, 346403, 369335, 242782 | ฮวงจุ้ย classical |
| 黃帝宅經 | 908557 | 182804, 565009 | ฮวงจุ้ย宅經 |

## Fetch Endpoints

- หน้า resource: `https://ctext.org/wiki.pl?if=gb&res=<RES_ID>`
- หน้า chapter: `https://ctext.org/wiki.pl?if=gb&chapter=<CHAPTER_ID>`

## Integration Notes

1. ใช้ `res` เป็น entrypoint เพื่อไล่ chapter links
2. ชั้น encode rule ให้ pin ที่ chapter id + section title เพื่อ trace ที่มาได้
3. สำหรับ `三命通會`/`黃帝宅經` มี chapter ซ้ำใน index ควร de-dup ตอน ingestion
4. หลีกเลี่ยง bulk scraping; ดึงเฉพาะบทที่ต้องใช้ต่อ phase

