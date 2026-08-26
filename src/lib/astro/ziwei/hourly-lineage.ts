export const ZIWEI_HOURLY_LINEAGE = "iztro_2_5_8_normal_forward_zi_v1" as const;

export const ZIWEI_HOURLY_LINEAGE_MANIFEST = Object.freeze({
  lineageId: ZIWEI_HOURLY_LINEAGE,
  adapterVersion: "hourkey-forward-zi-adapter-v1",
  referenceRuntime: "iztro",
  referenceOnly: true,
  claim: "named_software_lineage_not_classical_consensus",
  artifact: Object.freeze({
    package: "iztro",
    version: "2.5.8",
    integrity: "sha512-kgyyvxdSEvgJxi6zvHpvzGbXZLGXCdhTHYK2Pe/sRdBIQ7RfCArvupmg2ChUMQCSQGomW7XCI0gWwUuKJwPENg==",
    license: "MIT",
  }),
  dependencySnapshot: Object.freeze([
    Object.freeze({ package: "@babel/runtime", version: "7.29.2", integrity: "sha512-JiDShH45zKHWyGe4ZNVRrCjBz8Nh9TMmZG1kh4QTK8hCBTWBi8Da+i7s1fJw7/lYpM4ccepSNfqzZ/QvABBi5g==" }),
    Object.freeze({ package: "dayjs", version: "1.11.21", integrity: "sha512-98IT+HOahAisibz/yjKbzuOBwYcjJ7BCLPzARyHiyEBmRz4fatF+KPJszEHXsGYjUG234aH/cOjW1wwTbKUZlA==" }),
    Object.freeze({ package: "i18next", version: "23.16.8", integrity: "sha512-06r/TitrM88Mg5FdUXAKL96dJMzgqLE5dv3ryBAra4KCwD9mJ4ndOTS95ZuymIGoE+2hzfdaMak2X11/es7ZWg==" }),
    Object.freeze({ package: "lunar-lite", version: "0.2.8", integrity: "sha512-Y4tba4RaIFI0ikImJhgoEsyqtDE64lJIM3yFwRX01dbmagCDq7rNmpDQFrSFFy4WXeuywdRVFpIBoT1GGCEizw==" }),
    Object.freeze({ package: "lunar-typescript", version: "1.8.6", integrity: "sha512-5Eo4T/cnuXfrgO4k5LCpOGHIUOuz5hCF/IfNv0T29WY2shR36Hiz+ecN9WjnUuxUKhql9gbOkPaQoqLFKtPRNA==" }),
  ]),
  calculationRuntime: Object.freeze({
    package: "tyme4ts",
    version: "1.4.6",
    integrity: "sha512-6uiAlUxS4BNu2FGsKg0KdUr329jJjhnEURhURR8v5GKXnv1B7Z4kAZHjOByhGcCJ+jhuQskR5kmGSvZJ7fE/VA==",
    sources: Object.freeze([
      Object.freeze({ path: "src/lib/astro/ziwei/engine.ts", sha256: "d861f4baabce4c6547d7d6b92ebce6324d3fa8c66254bb6213b7b2e2fd4835bc" }),
      Object.freeze({ path: "src/lib/astro/ziwei/tables.ts", sha256: "b77d14dea17ac91b646c5711515dcff4a72179540f3162098d3ebb8b8e4e4c8c" }),
      Object.freeze({ path: "src/lib/astro/ziwei/hourly-preview.ts", sha256: "ba0c9ff67a60f079c905a1cfe58e12a113c91f632dc31aefb1f0d99e99fc36c0" }),
      Object.freeze({ path: "src/lib/birth-timezone.ts", sha256: "fbe1ac54f179a575c088d1d9e6722dda4b414b7fdf85b842c681f296474398c1" }),
    ]),
  }),
  config: Object.freeze({
    yearDivide: "normal",
    horoscopeDivide: "normal",
    ageDivide: "normal",
    dayDivide: "forward",
    algorithm: "default",
    fixLeap: true,
    astroType: "heaven",
    locale: "zh-CN",
    customMutagens: false,
    customBrightness: false,
  }),
  timeBoundary: Object.freeze({
    policy: "forward_zi",
    lateZi: "23:00-24:00 maps to next effective flow date at index 0",
    ziOccurrence: "[previous local date 23:00,current local date 01:00)",
  }),
  supportedCalendarRange: Object.freeze({ from: "1900-01-31", through: "2100-12-31" }),
});
