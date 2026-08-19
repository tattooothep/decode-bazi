type ZibaiSolarSectionCode = "xiaohan" | "lichun" | "jingzhe" | "qingming" | "lixia" | "mangzhong" | "xiaoshu" | "liqiu" | "bailu" | "hanlu" | "lidong" | "daxue";
type ZibaiSolarTermReference = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}>;
type ZibaiSolarTermMonthWindow = Readonly<{
  startAt: string;
  endAt: string;
  startTermCode: ZibaiSolarSectionCode;
  endTermCode: ZibaiSolarSectionCode;
}>;
declare const api: Readonly<{
  SOLAR_SECTION_CODES: readonly ZibaiSolarSectionCode[];
  globalTermReferenceAt(at: Date): ZibaiSolarTermReference;
  solarTermMonthWindowFromReference(reference: ZibaiSolarTermReference): ZibaiSolarTermMonthWindow;
  solarTermMonthWindow(at: Date): ZibaiSolarTermMonthWindow;
  canonicalSolarTermMonthWindow(year: number, startTermCode: string): ZibaiSolarTermMonthWindow | null;
  isCanonicalSolarTermMonthWindow(value: Readonly<{
    startAt: string;
    endAt: string;
    startTermCode: unknown;
    endTermCode: unknown;
  }>): boolean;
}>;
export = api;
