// V1 uses upstream URLs. The publication layer can inject a proxy/cache later.
export interface ImageService {
  url(source: string | null): string | null;
}
export const directImages: ImageService = {
  url(source) {
    if (!source) return null;
    try {
      const host = new URL(source).hostname.toLowerCase();
      // Drive belongs to the sync layer even when an upstream image points to it.
      if (
        [
          "drive.google.com",
          "docs.google.com",
          "drive.usercontent.google.com",
        ].includes(host) ||
        host.endsWith(".googleusercontent.com")
      )
        return null;
      return source;
    } catch {
      return null;
    }
  },
};
