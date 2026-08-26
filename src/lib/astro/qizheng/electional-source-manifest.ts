export const QIZHENG_ELECTIONAL_SOURCE_VERSION = "yangzhai-dacheng-xuanshi-xiufang-v7-v16-artifacts-v4" as const;
export const QIZHENG_ELECTIONAL_SOURCE_DIGEST = "af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2" as const;

export type QizhengElectionalSourceArtifact = Readonly<{
  volume: 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
  sectionGroup: "xuanshi_zaoming" | "xuanshi_corrections" | "xiufang";
  title: string;
  commonsFile: string;
  canonicalUrl: string;
  pdfSha256: string;
  pages: number;
  byteSize: number;
  license: "Public domain";
  transcriptionStatus: "pending_double_verification";
}>;

export const QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS = Object.freeze([
  Object.freeze({
    volume: 7,
    sectionGroup: "xuanshi_zaoming",
    title: "陽宅大成·選時造命一",
    commonsFile: "CNTS-00047978004_7_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_7_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "f990dc239cac11883b3dcf8544ec9dfdfed0d0285fc04d8b824ef4d3f9a29d03",
    pages: 97,
    byteSize: 43_940_124,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 8,
    sectionGroup: "xuanshi_zaoming",
    title: "陽宅大成·選時造命二",
    commonsFile: "CNTS-00047978004_8_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_8_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "f856b2057996d7d9c3d4d63475df94cbafe161703e8960a0b806ba873e77cdf5",
    pages: 92,
    byteSize: 44_218_912,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 9,
    sectionGroup: "xuanshi_zaoming",
    title: "陽宅大成·選時造命三",
    commonsFile: "CNTS-00047978004_9_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_9_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "be17cbb1263c6bb6f0f4d3dbb7aaf432b89c9c149bf1c8e4f70ff29a2bfab0c3",
    pages: 183,
    byteSize: 76_847_235,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 10,
    sectionGroup: "xuanshi_zaoming",
    title: "陽宅大成·選時造命四",
    commonsFile: "CNTS-00047978004_10_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_10_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "df6a2ac390baf57ab409bfbd4ee89617b26fd1565cca06df0ca9c4f85a73c1d4",
    pages: 92,
    byteSize: 41_841_196,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 11,
    sectionGroup: "xuanshi_zaoming",
    title: "陽宅大成·選時造命五",
    commonsFile: "CNTS-00047978004_11_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_11_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "bb2558763ccc44a8bdc9b30a3d0f4f2eafd5196699562bfafd63ac6a37475fec",
    pages: 90,
    byteSize: 40_178_910,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 12,
    sectionGroup: "xuanshi_corrections",
    title: "陽宅大成·選時辨訛",
    commonsFile: "CNTS-00047978004_12_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_12_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "c95ed759c87004d3b8fa4c80fd7a9957b9debd737573e6f2f17ba61b89ac0388",
    pages: 151,
    byteSize: 67_968_552,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 13,
    sectionGroup: "xiufang",
    title: "陽宅大成·青江修方案證",
    commonsFile: "CNTS-00047978004_13_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_13_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "4f5c703065998ec11e83497f64653f737c235de4ea46b531c65cef574cc0906a",
    pages: 91,
    byteSize: 45_510_993,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 14,
    sectionGroup: "xiufang",
    title: "陽宅大成·修方催生二／救貧／催貴",
    commonsFile: "CNTS-00047978004_14_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_14_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "2a123251bb7e15fb894e811ae438f86a9a77465db5b36be1aac87753d72254cd",
    pages: 82,
    byteSize: 43_102_656,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 15,
    sectionGroup: "xiufang",
    title: "陽宅大成·修方卻病一",
    commonsFile: "CNTS-00047978004_15_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_15_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "0d5f085fe66c962b27db76481c8bac76b23cddb12521453645ea9dd375c61d93",
    pages: 112,
    byteSize: 57_434_555,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
  Object.freeze({
    volume: 16,
    sectionGroup: "xiufang",
    title: "陽宅大成·修方卻病二",
    commonsFile: "CNTS-00047978004_16_陽宅大成._1-16-_魏靑江_著.pdf",
    canonicalUrl: "https://commons.wikimedia.org/wiki/File:CNTS-00047978004_16_%E9%99%BD%E5%AE%85%E5%A4%A7%E6%88%90._1-16-_%E9%AD%8F%E9%9D%91%E6%B1%9F_%E8%91%97.pdf",
    pdfSha256: "bf63dc5d3483ee59cbf4dcec24f45a666757d15bad16a26ffce0dfb181fcb3d9",
    pages: 89,
    byteSize: 41_348_343,
    license: "Public domain",
    transcriptionStatus: "pending_double_verification",
  }),
] as const satisfies readonly QizhengElectionalSourceArtifact[]);
