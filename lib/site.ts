// Absolute site origin for sitemap / robots / share URLs.
// Set NEXT_PUBLIC_SITE_URL in Vercel to your final domain; otherwise it falls
// back to the per-deployment Vercel URL, then localhost for dev.
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return raw.replace(/\/$/, "");
}
