import { defineMcp } from "@lovable.dev/mcp-js";
import getMovingRates from "./tools/get-moving-rates";
import estimateMoveCost from "./tools/estimate-move-cost";
import getContactInfo from "./tools/get-contact-info";

// Public, no-login server: only intentionally public business info.
export default defineMcp({
  name: "manus-project-migration",
  title: "Manus Project Migration",
  version: "0.1.0",
  instructions:
    "Public info for MoveFlew: hourly moving rates, quick cost estimates, and contact details.",
  tools: [getMovingRates, estimateMoveCost, getContactInfo],
});
