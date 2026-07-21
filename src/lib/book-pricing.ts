import { DISCIPLINES, type ScienceId } from "@/lib/fusion5/disciplines";
import {
  BOOK_SCIENCE_YAM,
  BOOK_SYNTHESIS_YAM,
} from "@/lib/product-entitlement";

export { BOOK_SCIENCE_YAM, BOOK_SYNTHESIS_YAM };

export function computeBookYam(sciences: ScienceId[], includeSynthesis: boolean): number {
  const valid = sciences.filter((science) => DISCIPLINES[science]?.available);
  return valid.length * BOOK_SCIENCE_YAM +
    (includeSynthesis && valid.length >= 2 ? BOOK_SYNTHESIS_YAM : 0);
}
