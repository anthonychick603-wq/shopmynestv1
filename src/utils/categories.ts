import type { NestCategoryRaw } from "@/src/api/nest";
import type { Category } from "@/src/types";
import { decodeEntities } from "@/src/utils/html";

export type HierarchicalCategory = Category & {
  parent: string | null;
  count?: number;
  image?: string;
};

export type CategorySelection = {
  categoryId: string | null;
  subcategoryId: string | null;
};

export function toHierarchicalCategory(category: NestCategoryRaw): HierarchicalCategory {
  return {
    id: String(category.id),
    name: decodeEntities(category.name),
    slug: category.slug,
    icon: undefined,
    parent: category.parent && Number(category.parent) > 0 ? String(category.parent) : null,
    count: category.count,
    image: category.image,
  };
}

export function rootCategories(categories: HierarchicalCategory[]): HierarchicalCategory[] {
  const ids = new Set(categories.map((category) => category.id));
  return categories
    .filter((category) => !category.parent || !ids.has(category.parent))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function subcategoriesFor(
  categories: HierarchicalCategory[],
  categoryId: string | null | undefined,
): HierarchicalCategory[] {
  if (!categoryId) return [];
  return categories
    .filter((category) => category.parent === categoryId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function selectionFromProductSlugs(
  categories: HierarchicalCategory[],
  slugs: string[],
): CategorySelection {
  const selected = categories.filter((category) => slugs.includes(category.slug));
  const selectedChild = selected.find((category) => !!category.parent);

  if (selectedChild?.parent) {
    return { categoryId: selectedChild.parent, subcategoryId: selectedChild.id };
  }

  const selectedRoot = selected.find((category) => !category.parent);
  if (selectedRoot) {
    return { categoryId: selectedRoot.id, subcategoryId: null };
  }

  return { categoryId: null, subcategoryId: null };
}

export function categoryIdsForSelection(
  categories: HierarchicalCategory[],
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
): number[] {
  const ids = [categoryId, subcategoryId]
    .filter((value): value is string => !!value)
    .filter((value, index, all) => all.indexOf(value) === index)
    .filter((value) => categories.some((category) => category.id === value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  return ids;
}

export function isCategorySelectionComplete(
  categories: HierarchicalCategory[],
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
): boolean {
  if (!categoryId) return false;
  const children = subcategoriesFor(categories, categoryId);
  return children.length === 0 || !!subcategoryId;
}

export function categoryPathLabel(
  categories: HierarchicalCategory[],
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
): string {
  const category = categories.find((item) => item.id === categoryId);
  const subcategory = categories.find((item) => item.id === subcategoryId);
  if (!category) return "";
  return subcategory ? `${category.name} > ${subcategory.name}` : category.name;
}
