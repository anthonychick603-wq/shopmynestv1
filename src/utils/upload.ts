// v1.0.177 — File upload typing helpers.
//
// React Native's FormData accepts a `{ uri, name, type }` object as a file
// part, but the DOM lib's FormData.append() signature only knows about
// string | Blob. Every screen that uploads a photo needs the same cast.
//
// Consolidate the cast in one place so the app doesn't sprinkle `as any` at
// every FormData.append() call site.

export type ReactNativeFilePart = {
  uri: string;
  name: string;
  type: string;
};

/**
 * Append a React Native file part to a FormData without leaking `any`
 * casts to the caller. TypeScript's FormData signature is DOM-shaped
 * (string | Blob) but the RN runtime accepts an object with uri/name/type.
 */
export function appendFilePart(fd: FormData, field: string, part: ReactNativeFilePart): void {
  // React Native's FormData accepts the {uri,name,type} object at runtime,
  // but the DOM FormData TS signature is (string, string | Blob). Cast to
  // unknown then Blob to satisfy the type-checker without pulling in `any`.
  fd.append(field, part as unknown as Blob);
}
