import {
  Banknote,
  FileText,
  Palette,
  Route as RouteIcon,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

export type ComparisonRow = {
  capability: string;
  Icon: LucideIcon;
  moveflew: string;
  smartmoving: string;
};

/**
 * Side-by-side capability data shared by /smartmoving-alternative and /pricing.
 * MoveFlew values describe this product; competitor values come from publicly
 * available information and are not independently verified.
 */
export const comparisonRows: ComparisonRow[] = [
  {
    capability: "Mobile Field App",
    Icon: Smartphone,
    moveflew: "100% offline-first PWA (IndexedDB)",
    smartmoving: "Requires active cellular connection",
  },
  {
    capability: "Pricing Structure",
    Icon: Banknote,
    moveflew: "Free during beta · flat monthly rate, unlimited users",
    smartmoving: "Tiered plans with annual contract lock-ins",
  },
  {
    capability: "Document & BOL Generation",
    Icon: FileText,
    moveflew: "Automated instant PDF/BOL with rolling secure links & photo attachments",
    smartmoving: "Standard basic document export",
  },
  {
    capability: "Custom Branding",
    Icon: Palette,
    moveflew: "Full white-labeling (5 theme presets, 8 accent colors, glassmorphic wallpapers)",
    smartmoving: "Fixed standard branding",
  },
  {
    capability: "Route & Cost Calculation",
    Icon: RouteIcon,
    moveflew: "Automated Google Maps Routes API mileage & fuel computation",
    smartmoving: "Manual distance entry",
  },
  {
    capability: "Enterprise Security",
    Icon: ShieldCheck,
    moveflew: "PostgreSQL Row-Level Security (RLS) + CSV formula injection protection",
    smartmoving: "Standard application-level security",
  },
];

export const comparisonFooter =
  "SmartMoving® is a registered trademark of SmartMoving Software, Inc. MoveFlew is an independent software platform and is not affiliated with, endorsed by, or sponsored by SmartMoving. Competitor features and plan terms are drawn from publicly available information and are not independently verified; confirm current terms with the vendor.";
