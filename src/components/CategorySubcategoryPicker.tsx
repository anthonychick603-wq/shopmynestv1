// v1.0.187 — Native chained dropdown category picker.
//
// Public API is stable — every existing seller call site (apply.tsx,
// product-form.tsx, seller/[id].tsx) keeps working unchanged. This is
// a shim over `NativeCategoryDropdown` that presents two chained
// native OS-style dropdowns: category, then sub-category once a
// category is picked. Previous chip-grid rendering (v1.0.179) has
// been retired.
import React from "react";

import {
  NativeCategoryDropdown,
} from "@/src/components/NativeCategoryDropdown";
import type { HierarchicalCategory } from "@/src/utils/categories";

type Props = {
  categories: HierarchicalCategory[];
  categoryId: string | null;
  subcategoryId: string | null;
  onChange: (categoryId: string | null, subcategoryId: string | null) => void;
  categoryLabel?: string;
  subcategoryLabel?: string;
  categoryPlaceholder?: string;
  subcategoryPlaceholder?: string;
  /** When true, the top row of both pickers is "All" (null selection). */
  allowAll?: boolean;
  disabled?: boolean;
  testIDPrefix?: string;
};

export function CategorySubcategoryPicker(props: Props) {
  return <NativeCategoryDropdown {...props} />;
}
