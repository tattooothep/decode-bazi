# Hourkey BaZi Chart Packet v1.1 Final — Implementation Notes

ใช้ไฟล์ JSON เป็น AI-facing Chart Packet สำหรับ buildChartPacket().

ลำดับ build ที่แนะนำ:
1. Engine คำนวณ pillars / hidden stems / Ten Gods / Na Yin / Hex / Stars.
2. Engine คำนวณ true solar time + timePillarConfidence + alternativePillar.
3. Engine คำนวณ patternConsistency: ห้ามประกาศ 假從財格 แบบลอย ๆ ถ้า effective mode ยังเป็น 調候/扶抑.
4. Engine คำนวณ dayMasterStrength + rootAnalysis + stemRootStatus.
5. Engine ส่ง raw interactions พร้อม strength, distance, affectedTopics, usefulGodImpact.
6. Rule preprocessor ทำ B-lite resolvedInteractions อย่างน้อยเฉพาะ chain สำคัญ.
7. Engine ส่ง annualInteractionsWithNatal และ luckAnnualInteractions สำหรับ forecast.
8. AI ใช้ resolvedInteractions ก่อน raw, เลือกหลักฐาน 3-5 จุด แล้วตอบเป็นภาษาคน.

ห้าม:
- ห้ามส่ง UI dump ยาว ๆ ให้ AI.
- ห้ามให้ AI เดา stem/branch/score เอง.
- ห้ามอ่าน raw interaction เป็นดี/ร้ายโดยตรง.
- ห้ามละเลย timePillarConfidence เมื่อคำถามพึ่งเสาเวลา.
