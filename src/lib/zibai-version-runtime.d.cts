declare const runtime: Readonly<{
  ACTIVE_CALCULATION_VERSION: "zibai-zaoming-true-solar-v2";
  LEGACY_CALCULATION_VERSION: "zibai-zaoming-true-solar-v2";
  READABLE_CALCULATION_VERSIONS: readonly [
    "zibai-zaoming-true-solar-v2",
    "zibai-zaoming-true-solar-v3",
  ];
  isReadableCalculationVersion(value: unknown): value is "zibai-zaoming-true-solar-v2" | "zibai-zaoming-true-solar-v3";
  parseReferenceId(value: unknown): Readonly<{
    apparentSolarDate: string;
    slot: string;
    calculationVersion: "zibai-zaoming-true-solar-v2" | "zibai-zaoming-true-solar-v3";
  }> | null;
  isMatchedReference(referenceId: unknown, calculationVersion: unknown): boolean;
  supportsCalculationVersion(capability: unknown, calculationVersion: unknown): boolean;
}>;

export = runtime;
