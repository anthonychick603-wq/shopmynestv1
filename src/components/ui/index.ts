// v1.0.224 — Shared UI primitives barrel.
//
// Every refined screen in the app should import primitives from
// `@/src/components/ui` so the design system stays coherent and future
// refinements (spacing, radius, focus rings) can ship in one place.
//
// Rules of the road:
//   • Do not add screen-specific code here.
//   • Do not import from `@/src/screens` here — one-way street.
//   • When a primitive gets a new prop, document it in JSDoc — no
//     silent contracts.
export { Card } from "./Card";
export { Screen } from "./Screen";
export { ScreenHeader } from "./ScreenHeader";
export { Section, SectionAction } from "./Section";
export { KPI } from "./KPI";
export { Chip } from "./Chip";
export { Badge } from "./Badge";
export { ListRow } from "./ListRow";
