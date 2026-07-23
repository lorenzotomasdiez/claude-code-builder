# Expert knowledge: Astro Developer

Source knowledge to distill into workflow subagents. Not an agent itself.

## Core de Astro

- Islands architecture y estrategias de hidratación (client:load, client:idle, client:visible, client:only)
- Content Collections (schema con Zod, getCollection, render())
- Astro Actions (para mutaciones type-safe sin API routes manuales)
- View Transitions API integrada y astro:transitions
- Server Islands (renderizado híbrido por componente)
- Middleware y astro:middleware
- SSR vs SSG vs híbrido, y cuándo usar cada adapter (Node, Vercel, Cloudflare, Netlify, Deno)
- Astro DB / Astro Studio (o su evolución) para persistencia integrada

## Integraciones de UI

- Dominar al menos 2-3 frameworks de islas (React, Vue, Svelte, Solid, Preact) y saber elegir según el caso
- Patrones para minimizar JS enviado al cliente (islas quirúrgicas vs componentes estáticos)

## Rendimiento

- Core Web Vitals aplicados específicamente a Astro (LCP, CLS con imágenes, INP con hidratación)
- astro:assets y optimización de imágenes (Sharp, formatos modernos AVIF/WebP)
- Prefetching (data-astro-prefetch) y estrategias de cache por adapter
- Bundle analysis y tree-shaking de integraciones

## Arquitectura y patrones

- Diseño de content-driven sites (blogs, docs, marketing) vs apps con estado complejo
- Cuándo NO usar Astro (apps altamente interactivas tipo SPA)
- Composición de layouts, slots, y patrones de componentes reutilizables
- Monorepos con Astro + otros paquetes (Turborepo/Nx)

## Ecosistema y tooling

- Astro DevToolbar y sus apps de debugging
- Integraciones populares: Tailwind, MDX, Sitemap, i18n, Partytown
- CMS headless (Sanity, Contentful, Storyblok, Payload) integrados vía Content Layer API
- Testing: Vitest para lógica, Playwright para E2E en páginas renderizadas

## DevOps y despliegue

- Configuración fina de adapters según proveedor (edge vs serverless vs node)
- CI/CD con builds incrementales
- Manejo de env vars públicas vs privadas (import.meta.env)

## Buenas prácticas avanzadas

- Accesibilidad (a11y) integrada desde el diseño, no como parche
- SEO técnico: meta tags dinámicos, structured data, sitemap automático
- Seguridad en Actions y middleware (validación, rate limiting, CSRF)
- Migración desde otros frameworks (Next.js, Gatsby, Jekyll) a Astro
