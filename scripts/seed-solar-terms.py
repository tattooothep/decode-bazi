#!/usr/bin/env python3
"""Seed ref_solar_terms · 4,824 entries · 1900-2100 × 24 terms"""
import sys, os
sys.path.insert(0, '/root/qimen-api/_reference/qimen-v2-multilevel')
from qimen_v2.solar_terms_full import SOLAR_TERMS_FULL
import psycopg2
from datetime import datetime, timedelta, timezone

DB = dict(host='127.0.0.1', port=5433, dbname='decode_db', user='decode_user', password=os.environ.get('PGPASSWORD'))

# 24 terms in classical order (starting 立春 as month 1)
TERM_ORDER = ['立春','雨水','驚蟄','春分','清明','穀雨','立夏','小滿','芒種','夏至','小暑','大暑','立秋','處暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒']
PINYIN = {'立春':'Li Chun','雨水':'Yu Shui','驚蟄':'Jing Zhe','春分':'Chun Fen','清明':'Qing Ming','穀雨':'Gu Yu','立夏':'Li Xia','小滿':'Xiao Man','芒種':'Mang Zhong','夏至':'Xia Zhi','小暑':'Xiao Shu','大暑':'Da Shu','立秋':'Li Qiu','處暑':'Chu Shu','白露':'Bai Lu','秋分':'Qiu Fen','寒露':'Han Lu','霜降':'Shuang Jiang','立冬':'Li Dong','小雪':'Xiao Xue','大雪':'Da Xue','冬至':'Dong Zhi','小寒':'Xiao Han','大寒':'Da Han'}
ENGLISH = {'立春':'Start of Spring','雨水':'Rain Water','驚蟄':'Awakening of Insects','春分':'Spring Equinox','清明':'Pure Brightness','穀雨':'Grain Rain','立夏':'Start of Summer','小滿':'Lesser Fullness','芒種':'Grain in Ear','夏至':'Summer Solstice','小暑':'Lesser Heat','大暑':'Greater Heat','立秋':'Start of Autumn','處暑':'End of Heat','白露':'White Dew','秋分':'Autumn Equinox','寒露':'Cold Dew','霜降':'Frost Descent','立冬':'Start of Winter','小雪':'Lesser Snow','大雪':'Greater Snow','冬至':'Winter Solstice','小寒':'Lesser Cold','大寒':'Greater Cold'}
THAI = {'立春':'ลี่ชุน · เริ่มฤดูใบไม้ผลิ','雨水':'อวี่สุ่ย · ฝน','驚蟄':'จิงเจ๋อ · แมลงตื่น','春分':'ชุนเฟิน · วสันตวิษุวัต','清明':'ชิงหมิง · สว่างใส','穀雨':'กู่อวี่ · ฝนข้าว','立夏':'ลี่เซี่ย · เริ่มฤดูร้อน','小滿':'เสี่ยวหมั่น · เริ่มอิ่ม','芒種':'หมางจ้ง · ข้าวออกรวง','夏至':'เซี่ยจื้อ · ครีษมายัน','小暑':'เสี่ยวสู่ · ร้อนน้อย','大暑':'ต้าสู่ · ร้อนใหญ่','立秋':'ลี่ชิว · เริ่มฤดูใบไม้ร่วง','處暑':'ฉู่สู่ · สิ้นร้อน','白露':'ไป๋ลู่ · น้ำค้างขาว','秋分':'ชิวเฟิน · ศารทวิษุวัต','寒露':'หานลู่ · น้ำค้างเย็น','霜降':'ซวงเจี้ยง · น้ำค้างแข็ง','立冬':'ลี่ตง · เริ่มฤดูหนาว','小雪':'เสี่ยวเสฺวี่ย · หิมะน้อย','大雪':'ต้าเสฺวี่ย · หิมะใหญ่','冬至':'ตงจื้อ · เหมายัน','小寒':'เสี่ยวหาน · หนาวน้อย','大寒':'ต้าหาน · หนาวใหญ่'}
# odd-numbered = jie (節 · month-starter), even = qi (氣 · mid-month)
TYPE = {t: 'jie' if (i % 2 == 0) else 'qi' for i, t in enumerate(TERM_ORDER)}

def main():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    cur.execute("DELETE FROM ref_solar_terms")
    print(f'cleaned · seeding 1900-2100...')
    n = 0
    bj_offset = timedelta(hours=8)  # Beijing UTC+8
    for year in sorted(SOLAR_TERMS_FULL.keys()):
        for term, ts_str in SOLAR_TERMS_FULL[year].items():
            utc = datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            bj = utc + bj_offset
            order_num = TERM_ORDER.index(term) + 1 if term in TERM_ORDER else None
            cur.execute(
                """INSERT INTO ref_solar_terms (year, order_num, chinese, pinyin, english, thai, beijing_datetime, utc_datetime, type)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (year, order_num, term, PINYIN.get(term), ENGLISH.get(term), THAI.get(term),
                 bj.isoformat(), utc.isoformat(), TYPE.get(term, 'jie'))
            )
            n += 1
        if year % 50 == 0:
            print(f'  {year} ({n} rows)')
    conn.commit()
    cur.close()
    conn.close()
    print(f'\n✅ ref_solar_terms: {n} rows seeded')

if __name__ == '__main__':
    main()
