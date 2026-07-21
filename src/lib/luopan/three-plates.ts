import { findMountain24, normalizeDeg, type Mountain24 } from "./mountains";

export type LuopanPlate = "earth" | "human" | "heaven";

const PLATE_SHIFT: Record<LuopanPlate,number> = {earth:0,human:7.5,heaven:-7.5};

export function mountainForPlate(degree:number,plate:LuopanPlate):Mountain24 {
  return findMountain24(normalizeDeg(degree+PLATE_SHIFT[plate]));
}

export function threePlateReading(degree:number) {
  const normalized=normalizeDeg(degree);
  return {
    degree:normalized,
    earth:mountainForPlate(normalized,"earth"),
    human:mountainForPlate(normalized,"human"),
    heaven:mountainForPlate(normalized,"heaven"),
  };
}
