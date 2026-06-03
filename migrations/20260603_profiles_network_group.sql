-- Persistent UI/network grouping for birth profiles.
-- This is intentionally separate from relationship_type:
-- relationship_type is still the role text used by Sifu identity context.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS network_group text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS network_group_label text;

UPDATE profiles
SET network_group = CASE
  WHEN relationship_type IS NULL OR btrim(relationship_type) = '' THEN 'self'
  WHEN relationship_type ~* '(แฟน|คู่รัก|คนรัก|girlfriend|boyfriend|lover|情|愛|恋)' THEN 'love'
  WHEN relationship_type ~* '(งาน|ที่ทำงาน|ลูกค้า|หัวหน้า|เจ้านาย|ลูกน้อง|ทีม|พาร์ทเนอร์ธุรกิจ|หุ้นส่วน|co-?founder|coworker|colleague|boss|client|customer|work|team|業)' THEN 'work'
  WHEN relationship_type ~* '(คู่แข่ง|ศัตรู|rival|competitor|enemy|競)' THEN 'rival'
  WHEN relationship_type ~* '(ภรรยา|สามี|คู่สมรส|พ่อ|แม่|ป๊า|ม๊า|บิดา|มารดา|ลูก|ลูกชาย|ลูกสาว|พี่|น้อง|พี่ชาย|พี่สาว|น้องชาย|น้องสาว|ปู่|ย่า|ตา|ยาย|ลุง|ป้า|น้า|อา|หลาน|โกว|กู๋|เจ๊|เฮีย|ญาติ|ครอบครัว|wife|husband|spouse|配偶|family|father|mother|parent|son|daughter|child|brother|sister|sibling|uncle|aunt|cousin|家)' THEN 'family'
  WHEN relationship_type ~* '(เพื่อน|เพื่อนเรียน|เพื่อนสนิท|friend|classmate|友)' THEN 'friend'
  ELSE 'general'
END
WHERE network_group IS NULL OR btrim(network_group) = '';

CREATE INDEX IF NOT EXISTS idx_profiles_org_network_group
  ON profiles (org_id, network_group)
  WHERE is_archived = false;
