/**
 * Cleans up a pasted image URL so it is more likely to load on the storefront:
 * - upgrades http:// (blocked as mixed content on an https site) and //host links to https
 * - converts Google Drive and Dropbox share links into direct image links
 */
export function normalizeImageUrl(raw: string | null | undefined): string {
  let url = (raw ?? "").trim();
  if (!url) return "";

  if (url.startsWith("//")) url = `https:${url}`;
  if (url.startsWith("http://")) url = `https://${url.slice("http://".length)}`;

  const drive = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1600`;

  if (/^https:\/\/(www\.)?dropbox\.com\//.test(url)) {
    return url.replace(/([?&])dl=0/, "$1raw=1").replace(/^https:\/\/(www\.)?dropbox\.com/, "https://dl.dropboxusercontent.com");
  }

  return url;
}
