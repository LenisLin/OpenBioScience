/**
 * Build a valid src for the PDF <webview>.
 *
 * On Windows, file paths use backslashes (e.g. `C:\Users\me\a.pdf`). Feeding such a
 * path straight into `file://${encodeURI(path)}` yields `file://C:%5CUsers%5C...`,
 * a malformed URL that fails to load (ERR_FAILED) and renders a blank preview.
 *
 * Normalize backslashes to forward slashes, guarantee the leading slash so the result
 * is a proper `file:///` URL on every platform, and encode segments (spaces / CJK) via
 * encodeURI (which preserves `/` and `:`).
 */
export const buildLocalFileSrc = (filePath: string): string => {
  if (filePath.startsWith('file://')) {
    return encodeURI(filePath);
  }

  const normalized = filePath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash)}`;
};

export const buildLocalFileDirectorySrc = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const directory = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : '/';
  return buildLocalFileSrc(directory.endsWith('/') ? directory : `${directory}/`);
};

export const buildPdfSrc = (file_path?: string, content?: string): string => {
  if (file_path) {
    return buildLocalFileSrc(file_path);
  }
  return content || '';
};
