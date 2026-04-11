const STYLE_DIRECTORY_INDEX = 3;
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|bmp|gif|heic|jpe?g|png|webp)$/i;
const STYLE_CODE_PATTERN = /^(?:\d+\.)?([A-Za-z0-9-]*\d[A-Za-z0-9-]*)@/u;

function normalizePathSegments(path: string): string[] {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function stripImageExtension(segment: string): string {
  return segment.replace(IMAGE_EXTENSION_PATTERN, '');
}

function extractCodeFromSegment(segment: string): string | null {
  const normalizedSegment = stripImageExtension(segment);
  const matched = normalizedSegment.match(STYLE_CODE_PATTERN);
  return matched?.[1] || null;
}

export function extractProductCodesFromPath(path: string): string[] {
  const segments = normalizePathSegments(path);
  if (segments.length === 0) {
    return [];
  }

  const codes = new Set<string>();
  const styleDirectorySegment = segments[STYLE_DIRECTORY_INDEX];

  if (styleDirectorySegment) {
    const styleCode = extractCodeFromSegment(styleDirectorySegment);
    if (styleCode) {
      codes.add(styleCode);
    }
  }

  if (codes.size > 0) {
    return Array.from(codes);
  }

  for (const segment of segments) {
    const code = extractCodeFromSegment(segment);
    if (code) {
      codes.add(code);
    }
  }

  return Array.from(codes);
}

export function collectProductCodesFromPaths(paths: string[]): string[] {
  const codes = new Set<string>();

  for (const path of paths) {
    for (const code of extractProductCodesFromPath(path)) {
      codes.add(code);
    }
  }

  return Array.from(codes);
}
