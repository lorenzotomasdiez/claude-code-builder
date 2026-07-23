# Expert knowledge: Astro Developer

Source knowledge to distill into workflow subagents. Not an agent itself.

## Astro core

- Islands architecture and hydration strategies (client:load, client:idle, client:visible, client:only)
- Content Collections (schema with Zod, getCollection, render())
- Astro Actions (for type-safe mutations without manual API routes)
- Integrated View Transitions API and astro:transitions
- Server Islands (per-component hybrid rendering)
- Middleware and astro:middleware
- SSR vs SSG vs hybrid, and when to use each adapter (Node, Vercel, Cloudflare, Netlify, Deno)
- Astro DB / Astro Studio (or its evolution) for integrated persistence

## UI integrations

- Master at least 2-3 island frameworks (React, Vue, Svelte, Solid, Preact) and know how to choose per case
- Patterns to minimize JS shipped to the client (surgical islands vs static components)

## Performance

- Core Web Vitals applied specifically to Astro (LCP, CLS with images, INP with hydration)
- astro:assets and image optimization (Sharp, modern AVIF/WebP formats)
- Prefetching (data-astro-prefetch) and per-adapter cache strategies
- Bundle analysis and tree-shaking of integrations

## Architecture and patterns

- Designing content-driven sites (blogs, docs, marketing) vs apps with complex state
- When NOT to use Astro (highly interactive SPA-style apps)
- Composition of layouts, slots, and reusable component patterns
- Monorepos with Astro + other packages (Turborepo/Nx)

## Ecosystem and tooling

- Astro DevToolbar and its debugging apps
- Popular integrations: Tailwind, MDX, Sitemap, i18n, Partytown
- Headless CMS (Sanity, Contentful, Storyblok, Payload) integrated via the Content Layer API
- Testing: Vitest for logic, Playwright for E2E on rendered pages

## DevOps and deployment

- Fine adapter configuration per provider (edge vs serverless vs node)
- CI/CD with incremental builds
- Handling public vs private env vars (import.meta.env)

## Advanced best practices

- Accessibility (a11y) built in from design, not patched on
- Technical SEO: dynamic meta tags, structured data, automatic sitemap
- Security in Actions and middleware (validation, rate limiting, CSRF)
- Migration from other frameworks (Next.js, Gatsby, Jekyll) to Astro
