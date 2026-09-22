# anythink site

Static company website for [anythink.cz](https://anythink.cz)  -  Czech primary, English at `/en/`.

Works on **GitHub Pages**, Cloudflare Pages, Netlify, or any static host.

## Preview locally

```bash
npx --yes serve .
```

Then open `http://localhost:3000` (CS) and `/en/` (EN).

## Deploy

### GitHub Pages

1. Push to GitHub.
2. Settings → Pages → branch `master` / `main`, folder `/` (root).
3. `CNAME` is set to `anythink.cz`. Point DNS to GitHub Pages and enable HTTPS.

### Other hosts (Cloudflare / Netlify / Vercel)

Connect the repo, publish the root directory, set custom domain `anythink.cz`. No build step required.

## SEO / GEO

- Semantic HTML with answer-first section copy and FAQ
- JSON-LD: Organization, ProfessionalService, WebSite, FAQPage
- `robots.txt` (AI crawlers allowed), `sitemap.xml`, `llms.txt`
- Open Graph / Twitter cards, `hreflang` CS ↔ EN
- Canonical URLs on both locales
