import { ComingSoon } from "@/components/coming-soon";
import { redirect } from "next/navigation";

export default async function YongshenLegacyPage({ searchParams }: { searchParams: Promise<{ teamv?: string }> }) {
  const sp = await searchParams;
  if (sp.teamv) {
    redirect(`/yongsennetwork?teamv=${encodeURIComponent(sp.teamv)}`);
  }
  return (
    <ComingSoon
      titleTh="ใบสั่งยาดวง"
      titleZh="用神"
      titleEn="Useful God Prescription"
      description="ธาตุที่หล่อเลี้ยงดวงคุณ + ทิศ คน อาชีพ สี ที่ตรงกับตัวคุณ กำลังต่อกับดวงจริง · ระหว่างนี้ดู Yongshen ในหน้าดวงของคุณได้"
    />
  );
}
