# Aureo Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir y desplegar el sitio de marketing de Aureo en `aureo.app`, una landing pre-lanzamiento que capta una lista de espera de dueños de negocios con inventario físico (ferretería como cuña, pero abierto a distribuidoras, construcción, repuestos, etc.).

**Architecture:** App Next.js (App Router) en un repo nuevo `aureo-landing`, separado del producto. Landing estática server-rendered con una API route que persiste emails en Supabase (Postgres). UI con shadcn/ui + Tailwind, tematizada con los design tokens reales de Aureo (marfil cálido premium). Deploy en Vercel con dominio `aureo.app`.

**Tech Stack:** Next.js 16.2.x · TypeScript · Tailwind CSS · shadcn/ui · Supabase (`@supabase/supabase-js`) · Vitest (unit) · Playwright (e2e) · Vercel (hosting + Analytics)

## Global Constraints

- Next.js **16.2.x**, App Router, TypeScript, Turbopack (defaults de `create-next-app`). Node **20+**.
- Repo **nuevo e independiente**: `aureo-landing` (NO dentro de `D:\juandiplay\aureo`).
- Idioma de TODO el contenido visible: **español de Colombia**. Sin texto en inglés en la UI.
- Público: negocios con inventario físico + ventas + bodega. Ferretería = ejemplo concreto, NUNCA el único nicho mencionado. El copy no debe excluir distribuidoras, materiales de construcción, repuestos, ferro-eléctricos, agroinsumos, almacenes.
- Paleta de marca (CSS custom properties, exactas):
  - `--bg-base: #F7F3EA` · `--bg-surface: #FFFFFF` · `--bg-subtle: #EFE7D7`
  - `--primary: #2E4A6E` · `--primary-strong: #1E3352` · `--primary-soft: #7BA3D0`
  - `--emerald: #5E7D52` · `--bronze: #A8742B` · `--terracotta: #A8442C`
  - `--text-primary: #241F1A` · `--text-secondary: #6E6354` · `--text-muted: #9C907E`
  - radios: `sm 6px` · `md 12px` · `lg 18px` · `xl 26px`
- Tipografía: **Inter** (400/600/700/800). Titulares del hero pueden usar **Syne** (700/800).
- **Mobile-first** y responsive (muchos dueños navegan en celular).
- Sin secrets en el repo. Supabase URL + anon key vía variables de entorno (`.env.local` local, Vercel env en prod).
- Conversión: un solo CTA primario (captura de email) repetido en hero / mitad / final; formulario de 3 campos máx; WhatsApp visible.
- Commits frecuentes, mensajes en formato convencional (`feat:`, `chore:`, `test:`, `docs:`), terminados con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

```
aureo-landing/
├─ app/
│  ├─ layout.tsx              # root layout, fuentes, metadata, Analytics
│  ├─ page.tsx                # ensambla todas las secciones
│  ├─ globals.css             # tokens de marca + base Tailwind
│  └─ api/waitlist/route.ts   # POST: valida + inserta en Supabase
├─ components/
│  ├─ ui/                     # shadcn (button, input, etc.)
│  ├─ Nav.tsx
│  ├─ Hero.tsx
│  ├─ WaitlistForm.tsx
│  ├─ ProblemSection.tsx
│  ├─ HowItWorks.tsx
│  ├─ ModulesGrid.tsx
│  ├─ ModuleCard.tsx
│  ├─ DemoSection.tsx
│  ├─ FoundersStory.tsx
│  ├─ PricingTable.tsx
│  ├─ PricingCard.tsx
│  ├─ FAQ.tsx
│  ├─ FinalCTA.tsx
│  ├─ Footer.tsx
│  └─ WhatsAppButton.tsx
├─ lib/
│  ├─ supabase.ts             # cliente Supabase (server-side)
│  └─ validation.ts           # validación de email/payload (pura, testeable)
├─ content/
│  └─ site.ts                 # TODO el copy en español (single source)
├─ test/
│  ├─ validation.test.ts      # Vitest
│  └─ waitlist-route.test.ts  # Vitest
├─ e2e/
│  └─ waitlist.spec.ts        # Playwright
├─ supabase/
│  └─ schema.sql              # DDL de la tabla waitlist (documentado)
├─ .env.local.example
├─ vitest.config.ts
├─ playwright.config.ts
└─ (defaults de create-next-app: package.json, tsconfig, etc.)
```

---

### Task 1: Scaffold del repo Next.js

**Files:**
- Create: repo `aureo-landing/` completo (vía `create-next-app`)

**Interfaces:**
- Consumes: nada.
- Produces: proyecto Next.js 16.2.x con App Router, TS, Tailwind, alias `@/*`. Scripts `dev`, `build`, `start`, `lint`.

- [ ] **Step 1: Crear el proyecto**

Desde el directorio padre de los proyectos (por ejemplo `D:\juandiplay`), NO dentro de `aureo`:

```bash
npx create-next-app@latest aureo-landing --ts --tailwind --eslint --app --use-npm --import-alias "@/*" --no-src-dir --turbopack
```

Acepta los defaults restantes. Esto crea Next 16.2.x.

- [ ] **Step 2: Verificar que arranca**

```bash
cd aureo-landing
npm run dev
```

Expected: servidor en `http://localhost:3000`, página default de Next.js carga sin errores. Detener con Ctrl+C.

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 4: Commit inicial**

```bash
git add -A
git commit -m "chore: scaffold aureo-landing with create-next-app (Next 16, TS, Tailwind)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Design tokens de marca + tipografía

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: scaffold de Task 1.
- Produces: variables CSS de marca disponibles globalmente; fuentes Inter + Syne cargadas vía `next/font`; clases utilitarias `.font-display` (Syne) usable en componentes.

- [ ] **Step 1: Definir tokens en globals.css**

Reemplaza el `:root` de `app/globals.css` (deja las directivas `@tailwind`/`@import "tailwindcss"` que generó el scaffold) y añade:

```css
:root {
  --bg-base: #F7F3EA;
  --bg-surface: #FFFFFF;
  --bg-subtle: #EFE7D7;
  --primary: #2E4A6E;
  --primary-strong: #1E3352;
  --primary-soft: #7BA3D0;
  --emerald: #5E7D52;
  --bronze: #A8742B;
  --terracotta: #A8442C;
  --text-primary: #241F1A;
  --text-secondary: #6E6354;
  --text-muted: #9C907E;
  --border-subtle: #E7DCC8;
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 26px;
}

body {
  background-color: var(--bg-base);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

.font-display { font-family: var(--font-syne), Inter, system-ui, sans-serif; }
```

- [ ] **Step 2: Cargar fuentes en layout.tsx**

En `app/layout.tsx`, importar fuentes con `next/font/google` y aplicarlas:

```tsx
import { Inter, Syne } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["400","600","700","800"] });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne", weight: ["700","800"] });

// en <html lang="es"> usar className={`${inter.variable} ${syne.variable}`}
// en <body> usar style/font Inter por defecto: className="font-sans" (Inter via variable)
```

Asegurar `<html lang="es">`. Aplicar `font-family: var(--font-inter)` al body en globals.css (`body { font-family: var(--font-inter), Inter, system-ui, sans-serif; }`).

- [ ] **Step 3: Metadata base**

En `app/layout.tsx`, definir `metadata`:

```tsx
export const metadata = {
  title: "Aureo — Control total de tu inventario, ventas y bodega",
  description: "El sistema que le da a tu negocio el control logístico que antes solo tenían las grandes empresas. Inventario, ventas y bodega en un solo lugar.",
};
```

- [ ] **Step 4: Verificar**

Run: `npm run dev` y abrir `http://localhost:3000`.
Expected: fondo marfil `#F7F3EA`, texto café-carbón, sin errores de consola. (La página default se ve, la reemplazamos luego.)

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add Aureo brand tokens, Inter+Syne fonts, base metadata

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Inicializar shadcn/ui + componentes base

**Files:**
- Create: `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/accordion.tsx`, `components/ui/card.tsx` (vía CLI)
- Modify: config de shadcn (`components.json`)

**Interfaces:**
- Consumes: Task 1, 2.
- Produces: componentes `Button`, `Input`, `Accordion`, `Card` importables desde `@/components/ui/*`.

- [ ] **Step 1: Inicializar shadcn**

```bash
npx shadcn@latest init
```

Elegir: base color Neutral, CSS variables sí. (Mantener nuestros tokens de marca; shadcn agrega sus propias variables sin romper las nuestras.)

- [ ] **Step 2: Agregar componentes**

```bash
npx shadcn@latest add button input accordion card
```

- [ ] **Step 3: Verificar import**

Crear temporalmente en `app/page.tsx` un `import { Button } from "@/components/ui/button";` y usarlo. Run `npm run build`.
Expected: compila sin errores. Revertir el cambio temporal de `page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: init shadcn/ui and add button, input, accordion, card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Contenido del sitio (copy en español)

**Files:**
- Create: `content/site.ts`

**Interfaces:**
- Consumes: nada.
- Produces: objeto `site` exportado con todo el copy. Tipos exportados: `Module`, `Plan`, `FaqItem`. Consumido por casi todos los componentes de sección.

- [ ] **Step 1: Escribir content/site.ts**

```ts
export type Module = { id: string; titulo: string; beneficio: string; icono: string };
export type Plan = {
  nombre: string; precio: string; periodo: string; resumen: string;
  destacado: boolean; features: string[]; cta: string;
};
export type FaqItem = { pregunta: string; respuesta: string };

export const site = {
  marca: "Aureo",
  whatsapp: "https://wa.me/57XXXXXXXXXX", // TODO real number antes de prod
  hero: {
    titulo: "El control de tu inventario, ventas y bodega en un solo lugar.",
    subtitulo: "Aureo le da a tu negocio la inteligencia logística que antes solo tenían las grandes empresas — sin su complejidad ni su precio.",
    cta: "Unirme a la lista de espera",
    nota: "Acceso anticipado y precio de fundador para los primeros negocios.",
  },
  problema: {
    titulo: "Si tienes inventario y bodega, conoces estos dolores.",
    intro: "Le pasa a ferreterías, distribuidoras, depósitos de construcción, repuestos y cualquier negocio con productos que mover.",
    items: [
      { titulo: "Buscas productos a ciegas", texto: "Tu gente pierde horas caminando la bodega sin saber dónde está cada cosa." },
      { titulo: "No sabes qué rota y qué acumula polvo", texto: "Compras de más lo que no se vende y te quedas corto en lo que sí." },
      { titulo: "El despacho es lento", texto: "Preparar un pedido toma demasiado y el cliente espera." },
      { titulo: "El inventario nunca cuadra", texto: "Lo que dice el sistema y lo que hay en la bodega no coinciden." },
    ],
  },
  comoFunciona: {
    titulo: "Aureo lo resuelve en tres pasos.",
    pasos: [
      { titulo: "Carga tu inventario", texto: "Sube tus productos y ubicaciones. Aureo organiza tu bodega por ti." },
      { titulo: "Vende y despacha", texto: "POS rápido, facturación y picking guiado para preparar pedidos sin errores." },
      { titulo: "Decide con datos", texto: "Análisis ABC y mapa de calor te dicen qué mover, qué comprar y dónde ubicarlo." },
    ],
  },
  modulos: [
    { id: "pos", titulo: "Punto de venta", beneficio: "Vende y factura en segundos, con o sin conexión.", icono: "shopping-cart" },
    { id: "inventario", titulo: "Inventario inteligente", beneficio: "Control en tiempo real, alertas de stock y conteos físicos.", icono: "boxes" },
    { id: "wms", titulo: "Mapa de calor de bodega", beneficio: "Ve tu bodega como un plano vivo y ubica lo que más rota cerca del despacho.", icono: "map" },
    { id: "abc", titulo: "Análisis ABC / Pareto", beneficio: "Descubre el 20% de productos que generan el 80% de tus ventas.", icono: "bar-chart" },
    { id: "picking", titulo: "Preparación de pedidos", beneficio: "Recorridos optimizados para despachar más rápido y sin errores.", icono: "route" },
  ] as Module[],
  demo: {
    titulo: "Mira la inteligencia logística en acción.",
    texto: "El mapa de calor y el análisis ABC son lo que separa a Aureo de un POS común.",
    placeholder: "Demo en video — próximamente.",
  },
  fundadores: {
    titulo: "Hecho por gente que vivió el problema.",
    texto: "Aureo nació de una ferretería real. Lo construimos Juan y Leif porque vimos de cerca lo que cuesta manejar un negocio con inventario sin las herramientas adecuadas. No somos una corporación: somos dos emprendedores que quieren que tu negocio crezca.",
    socialProofPlaceholder: "Primeros negocios usando Aureo — muy pronto.",
  },
  planes: [
    {
      nombre: "Starter", precio: "Por definir", periodo: "/mes", destacado: false,
      resumen: "Para el negocio que necesita vender y controlar su stock.",
      features: ["Punto de venta y facturación", "Inventario en tiempo real", "Alertas de stock", "Reportes básicos"],
      cta: "Quiero el plan Starter",
    },
    {
      nombre: "Pro", precio: "Por definir", periodo: "/mes", destacado: true,
      resumen: "Para el negocio con bodega que necesita logística de verdad.",
      features: ["Todo lo de Starter", "Mapa de calor de bodega (WMS)", "Análisis ABC / Pareto", "Preparación de pedidos (picking)", "Reubicación inteligente"],
      cta: "Quiero el plan Pro",
    },
  ] as Plan[],
  preciosNota: "Precio de fundador garantizado para quienes entren por la lista de espera.",
  faq: [
    { pregunta: "¿Necesito conocimientos técnicos?", respuesta: "No. Aureo está pensado para que cualquier persona del negocio lo use desde el primer día." },
    { pregunta: "¿Funciona en la nube?", respuesta: "Sí. Accedes desde cualquier dispositivo, sin instalar nada, con tus datos siempre respaldados." },
    { pregunta: "¿Sirve solo para ferreterías?", respuesta: "No. Aureo es para cualquier negocio con inventario físico, ventas y bodega: distribuidoras, materiales de construcción, repuestos, agroinsumos y más." },
    { pregunta: "¿Qué pasa con mis datos?", respuesta: "Tus datos son tuyos. Los protegemos y nunca los compartimos." },
    { pregunta: "¿Cuándo estará disponible?", respuesta: "Estamos en desarrollo. Únete a la lista de espera para tener acceso anticipado y precio de fundador." },
  ] as FaqItem[],
  finalCta: {
    titulo: "Sé de los primeros en tener el control.",
    texto: "Únete a la lista de espera y asegura tu precio de fundador.",
    cta: "Unirme ahora",
  },
  footer: {
    tagline: "Inteligencia logística para tu negocio.",
    derechos: "© 2026 Aureo. Todos los derechos reservados.",
  },
};
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add content/site.ts
git commit -m "feat: add Spanish site copy (single source of truth)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Configurar Vitest + utilidad de validación

**Files:**
- Create: `lib/validation.ts`
- Create: `test/validation.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: nada.
- Produces: `isValidEmail(email: string): boolean` y `parseWaitlistPayload(body: unknown): { ok: true; data: WaitlistInput } | { ok: false; error: string }` donde `WaitlistInput = { email: string; nombre?: string; negocio?: string; ciudad?: string; origen?: string }`. Consumido por la API route (Task 7).

- [ ] **Step 1: Instalar Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Crear vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

Añadir a `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Escribir el test (falla primero)**

`test/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isValidEmail, parseWaitlistPayload } from "@/lib/validation";

describe("isValidEmail", () => {
  it("acepta un email válido", () => {
    expect(isValidEmail("juan@aureo.app")).toBe(true);
  });
  it("rechaza un email sin @", () => {
    expect(isValidEmail("juanaureo.app")).toBe(false);
  });
  it("rechaza vacío", () => {
    expect(isValidEmail("")).toBe(false);
  });
});

describe("parseWaitlistPayload", () => {
  it("acepta payload con email válido", () => {
    const r = parseWaitlistPayload({ email: "a@b.com", negocio: "Ferre Sur" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email).toBe("a@b.com");
  });
  it("normaliza email a minúsculas y recorta espacios", () => {
    const r = parseWaitlistPayload({ email: "  A@B.COM " });
    expect(r.ok && r.data.email).toBe("a@b.com");
  });
  it("rechaza payload sin email", () => {
    const r = parseWaitlistPayload({ negocio: "x" });
    expect(r.ok).toBe(false);
  });
  it("rechaza email inválido", () => {
    const r = parseWaitlistPayload({ email: "no-email" });
    expect(r.ok).toBe(false);
  });
  it("rechaza body no-objeto", () => {
    expect(parseWaitlistPayload(null).ok).toBe(false);
    expect(parseWaitlistPayload("texto").ok).toBe(false);
  });
});
```

- [ ] **Step 4: Verificar que falla**

Run: `npm test`
Expected: FAIL (módulo `@/lib/validation` no existe). Si `@/` no resuelve en Vitest, instala `vite-tsconfig-paths` (`npm i -D vite-tsconfig-paths`) y agrégalo a `plugins` en `vitest.config.ts`.

- [ ] **Step 5: Implementar lib/validation.ts**

```ts
export type WaitlistInput = {
  email: string;
  nombre?: string;
  negocio?: string;
  ciudad?: string;
  origen?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

export function parseWaitlistPayload(
  body: unknown
): { ok: true; data: WaitlistInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Solicitud inválida." };
  }
  const b = body as Record<string, unknown>;
  const emailRaw = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!isValidEmail(emailRaw)) {
    return { ok: false, error: "Ingresa un correo válido." };
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    ok: true,
    data: {
      email: emailRaw,
      nombre: str(b.nombre),
      negocio: str(b.negocio),
      ciudad: str(b.ciudad),
      origen: str(b.origen),
    },
  };
}
```

- [ ] **Step 6: Verificar que pasa**

Run: `npm test`
Expected: PASS (todos los tests verdes).

- [ ] **Step 7: Commit**

```bash
git add lib/validation.ts test/validation.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: add waitlist payload validation with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Cliente Supabase + esquema de la tabla

**Files:**
- Create: `lib/supabase.ts`
- Create: `supabase/schema.sql`
- Create: `.env.local.example`

**Interfaces:**
- Consumes: nada.
- Produces: `getSupabaseAdmin(): SupabaseClient` (cliente server-side usando service role o anon con policy de insert). Consumido por la API route (Task 7).

- [ ] **Step 1: Instalar cliente**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Crear supabase/schema.sql (documentación del DDL)**

```sql
-- Ejecutar en el SQL Editor de Supabase
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nombre text,
  negocio text,
  ciudad text,
  origen text,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Sin policies de select públicas: nadie lee la lista desde el cliente.
-- La inserción se hace server-side con la service role key (bypassa RLS),
-- así que NO se necesita policy de insert pública.
```

- [ ] **Step 3: Crear .env.local.example**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

Nota para el implementador: crear `.env.local` real (NO commiteado) con los valores del proyecto Supabase. Confirmar que `.env.local` está en `.gitignore` (lo añade create-next-app por defecto).

- [ ] **Step 4: Implementar lib/supabase.ts**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase.ts supabase/schema.sql .env.local.example package.json package-lock.json
git commit -m "feat: add Supabase server client and waitlist schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: API route de la waitlist

**Files:**
- Create: `app/api/waitlist/route.ts`
- Create: `test/waitlist-route.test.ts`

**Interfaces:**
- Consumes: `parseWaitlistPayload` (Task 5), `getSupabaseAdmin` (Task 6).
- Produces: endpoint `POST /api/waitlist`. Respuestas JSON: `200 { ok: true, duplicate?: boolean }`, `400 { ok: false, error }`, `500 { ok: false, error }`. Consumido por `WaitlistForm` (Task 8).

- [ ] **Step 1: Escribir el test (falla primero)**

`test/waitlist-route.test.ts`. Mockear Supabase para no tocar la red:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: insertMock }),
  }),
}));

import { POST } from "@/app/api/waitlist/route";

function req(body: unknown) {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => insertMock.mockReset());

describe("POST /api/waitlist", () => {
  it("inserta y responde 200 con email válido", async () => {
    insertMock.mockResolvedValue({ error: null });
    const res = await POST(req({ email: "a@b.com", negocio: "Ferre Sur" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledOnce();
  });

  it("responde 400 con email inválido", async () => {
    const res = await POST(req({ email: "malo" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("trata duplicado (código 23505) como éxito suave", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505" } });
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.duplicate).toBe(true);
  });

  it("responde 500 si Supabase falla con otro error", async () => {
    insertMock.mockResolvedValue({ error: { code: "XXXXX", message: "boom" } });
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test test/waitlist-route.test.ts`
Expected: FAIL (route no existe).

- [ ] **Step 3: Implementar app/api/waitlist/route.ts**

```ts
import { NextResponse } from "next/server";
import { parseWaitlistPayload } from "@/lib/validation";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const parsed = parseWaitlistPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("waitlist").insert(parsed.data);
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
      }
      console.error("waitlist insert error:", error);
      return NextResponse.json({ ok: false, error: "No pudimos registrarte. Intenta de nuevo." }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("waitlist route error:", e);
    return NextResponse.json({ ok: false, error: "Error del servidor." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test`
Expected: PASS (todos verdes).

- [ ] **Step 5: Commit**

```bash
git add app/api/waitlist/route.ts test/waitlist-route.test.ts
git commit -m "feat: add waitlist POST API route with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Componente WaitlistForm

**Files:**
- Create: `components/WaitlistForm.tsx`

**Interfaces:**
- Consumes: `POST /api/waitlist` (Task 7), `Button`/`Input` (Task 3).
- Produces: `<WaitlistForm origen="hero" />` — client component con prop `origen: string`. Maneja estados idle/loading/success/error. Reusado por Hero (Task 9) y FinalCTA (Task 15).

- [ ] **Step 1: Implementar el componente**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type State = "idle" | "loading" | "success" | "error";

export function WaitlistForm({ origen }: { origen: string }) {
  const [email, setEmail] = useState("");
  const [negocio, setNegocio] = useState("");
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, negocio, origen }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setState("success");
        setMsg(json.duplicate ? "¡Ya estás en la lista! Te avisaremos." : "¡Listo! Te avisaremos del lanzamiento.");
      } else {
        setState("error");
        setMsg(json.error ?? "No pudimos registrarte. Intenta de nuevo.");
      }
    } catch {
      setState("error");
      setMsg("Revisa tu conexión e intenta de nuevo.");
    }
  }

  if (state === "success") {
    return <p role="status" className="text-[var(--emerald)] font-semibold">{msg}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row" noValidate>
      <Input
        type="email"
        required
        placeholder="Tu correo"
        aria-label="Correo electrónico"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" disabled={state === "loading"} aria-busy={state === "loading"}>
        {state === "loading" ? "Enviando…" : "Unirme"}
      </Button>
      {state === "error" && (
        <p role="alert" className="text-[var(--terracotta)] text-sm sm:absolute sm:mt-12">{msg}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Verificar tipos/build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/WaitlistForm.tsx
git commit -m "feat: add WaitlistForm client component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Nav + Hero

**Files:**
- Create: `components/Nav.tsx`
- Create: `components/Hero.tsx`

**Interfaces:**
- Consumes: `site` (Task 4), `WaitlistForm` (Task 8).
- Produces: `<Nav />` y `<Hero />`. Usados por `app/page.tsx` (Task 16).

- [ ] **Step 1: Implementar Nav.tsx**

```tsx
import { site } from "@/content/site";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <span className="font-display text-2xl font-extrabold text-[var(--primary)]">{site.marca}</span>
        <div className="hidden gap-7 text-sm font-semibold text-[var(--text-secondary)] md:flex">
          <a href="#producto" className="hover:text-[var(--primary)]">Producto</a>
          <a href="#como" className="hover:text-[var(--primary)]">Cómo funciona</a>
          <a href="#precios" className="hover:text-[var(--primary)]">Precios</a>
          <a href="#faq" className="hover:text-[var(--primary)]">Preguntas</a>
        </div>
        <a href="#waitlist" className="rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]">
          Unirme
        </a>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Implementar Hero.tsx**

```tsx
import { site } from "@/content/site";
import { WaitlistForm } from "@/components/WaitlistForm";

export function Hero() {
  return (
    <section id="waitlist" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-tight text-[var(--text-primary)] md:text-5xl">
            {site.hero.titulo}
          </h1>
          <p className="mt-6 text-lg text-[var(--text-secondary)]">{site.hero.subtitulo}</p>
          <div className="mt-8">
            <WaitlistForm origen="hero" />
            <p className="mt-3 text-sm text-[var(--text-muted)]">{site.hero.nota}</p>
          </div>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-sm">
          {/* Captura real del dashboard de Aureo — reemplazar src en Task 17 */}
          <div className="flex aspect-[4/3] items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-subtle)] text-[var(--text-muted)]">
            Captura del producto
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/Nav.tsx components/Hero.tsx
git commit -m "feat: add Nav and Hero sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: ProblemSection + HowItWorks

**Files:**
- Create: `components/ProblemSection.tsx`
- Create: `components/HowItWorks.tsx`

**Interfaces:**
- Consumes: `site` (Task 4).
- Produces: `<ProblemSection />`, `<HowItWorks />`. Usados por `app/page.tsx`.

- [ ] **Step 1: Implementar ProblemSection.tsx**

```tsx
import { site } from "@/content/site";

export function ProblemSection() {
  return (
    <section className="bg-[var(--bg-subtle)] py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-3xl font-bold text-[var(--text-primary)]">{site.problema.titulo}</h2>
        <p className="mt-3 max-w-2xl text-[var(--text-secondary)]">{site.problema.intro}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {site.problema.items.map((it) => (
            <div key={it.titulo} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
              <h3 className="font-semibold text-[var(--terracotta)]">{it.titulo}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{it.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implementar HowItWorks.tsx**

```tsx
import { site } from "@/content/site";

export function HowItWorks() {
  return (
    <section id="como" className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-3xl font-bold text-[var(--text-primary)]">{site.comoFunciona.titulo}</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {site.comoFunciona.pasos.map((p, i) => (
            <div key={p.titulo}>
              <span className="font-display text-4xl font-extrabold text-[var(--primary-soft)]">{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{p.titulo}</h3>
              <p className="mt-2 text-[var(--text-secondary)]">{p.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/ProblemSection.tsx components/HowItWorks.tsx
git commit -m "feat: add Problem and HowItWorks sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: ModuleCard + ModulesGrid

**Files:**
- Create: `components/ModuleCard.tsx`
- Create: `components/ModulesGrid.tsx`

**Interfaces:**
- Consumes: `site.modulos` y tipo `Module` (Task 4).
- Produces: `<ModuleCard module={m} />` (prop `module: Module`) y `<ModulesGrid />`. Usados por `app/page.tsx`.

- [ ] **Step 1: Implementar ModuleCard.tsx**

```tsx
import type { Module } from "@/content/site";

export function ModuleCard({ module }: { module: Module }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 transition hover:shadow-md">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)]/10 text-[var(--primary)]" aria-hidden>
        {/* icono simple por ahora; reemplazable por lucide en pulido */}
        <span className="font-display text-lg font-bold">{module.titulo.charAt(0)}</span>
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{module.titulo}</h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{module.beneficio}</p>
    </div>
  );
}
```

- [ ] **Step 2: Implementar ModulesGrid.tsx**

```tsx
import { site } from "@/content/site";
import { ModuleCard } from "@/components/ModuleCard";

export function ModulesGrid() {
  return (
    <section id="producto" className="bg-[var(--bg-subtle)] py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-3xl font-bold text-[var(--text-primary)]">
          Todo lo que tu negocio necesita, en un solo sistema.
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {site.modulos.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/ModuleCard.tsx components/ModulesGrid.tsx
git commit -m "feat: add ModulesGrid and ModuleCard sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: DemoSection + FoundersStory

**Files:**
- Create: `components/DemoSection.tsx`
- Create: `components/FoundersStory.tsx`

**Interfaces:**
- Consumes: `site` (Task 4).
- Produces: `<DemoSection />`, `<FoundersStory />`. Usados por `app/page.tsx`.

- [ ] **Step 1: Implementar DemoSection.tsx**

```tsx
import { site } from "@/content/site";

export function DemoSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <h2 className="font-display text-3xl font-bold text-[var(--text-primary)]">{site.demo.titulo}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-[var(--text-secondary)]">{site.demo.texto}</p>
        <div className="mx-auto mt-10 flex aspect-video max-w-4xl items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]">
          {site.demo.placeholder}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implementar FoundersStory.tsx**

```tsx
import { site } from "@/content/site";

export function FoundersStory() {
  return (
    <section className="bg-[var(--primary)] py-20 text-white">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <h2 className="font-display text-3xl font-bold">{site.fundadores.titulo}</h2>
        <p className="mt-5 text-lg leading-relaxed text-white/85">{site.fundadores.texto}</p>
        <p className="mt-8 text-sm uppercase tracking-wide text-white/60">{site.fundadores.socialProofPlaceholder}</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/DemoSection.tsx components/FoundersStory.tsx
git commit -m "feat: add Demo and FoundersStory sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: PricingCard + PricingTable

**Files:**
- Create: `components/PricingCard.tsx`
- Create: `components/PricingTable.tsx`

**Interfaces:**
- Consumes: `site.planes`, tipo `Plan`, `site.preciosNota` (Task 4).
- Produces: `<PricingCard plan={p} />` (prop `plan: Plan`) y `<PricingTable />`. Usados por `app/page.tsx`.

- [ ] **Step 1: Implementar PricingCard.tsx**

```tsx
import type { Plan } from "@/content/site";

export function PricingCard({ plan }: { plan: Plan }) {
  return (
    <div className={`rounded-[var(--radius-lg)] border p-8 ${plan.destacado ? "border-[var(--primary)] bg-[var(--bg-surface)] shadow-md" : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"}`}>
      {plan.destacado && (
        <span className="mb-3 inline-block rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white">Recomendado</span>
      )}
      <h3 className="font-display text-2xl font-bold text-[var(--text-primary)]">{plan.nombre}</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{plan.resumen}</p>
      <p className="mt-4">
        <span className="font-display text-3xl font-extrabold text-[var(--primary)]">{plan.precio}</span>
        <span className="text-[var(--text-muted)]">{plan.periodo}</span>
      </p>
      <ul className="mt-6 space-y-2 text-sm text-[var(--text-secondary)]">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-[var(--emerald)]" aria-hidden>✓</span>{f}
          </li>
        ))}
      </ul>
      <a href="#waitlist" className="mt-8 block rounded-[var(--radius-md)] bg-[var(--primary)] py-3 text-center font-semibold text-white hover:bg-[var(--primary-strong)]">
        {plan.cta}
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Implementar PricingTable.tsx**

```tsx
import { site } from "@/content/site";
import { PricingCard } from "@/components/PricingCard";

export function PricingTable() {
  return (
    <section id="precios" className="py-20">
      <div className="mx-auto max-w-5xl px-5">
        <h2 className="text-center font-display text-3xl font-bold text-[var(--text-primary)]">
          Un plan para cada etapa de tu negocio.
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {site.planes.map((p) => (
            <PricingCard key={p.nombre} plan={p} />
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">{site.preciosNota}</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/PricingCard.tsx components/PricingTable.tsx
git commit -m "feat: add PricingTable and PricingCard sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: FAQ (con shadcn Accordion)

**Files:**
- Create: `components/FAQ.tsx`

**Interfaces:**
- Consumes: `site.faq`, tipo `FaqItem` (Task 4), `Accordion` (Task 3).
- Produces: `<FAQ />`. Usado por `app/page.tsx`.

- [ ] **Step 1: Implementar FAQ.tsx**

```tsx
import { site } from "@/content/site";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function FAQ() {
  return (
    <section id="faq" className="bg-[var(--bg-subtle)] py-20">
      <div className="mx-auto max-w-3xl px-5">
        <h2 className="text-center font-display text-3xl font-bold text-[var(--text-primary)]">Preguntas frecuentes</h2>
        <Accordion type="single" collapsible className="mt-8">
          {site.faq.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-[var(--text-primary)]">{item.pregunta}</AccordionTrigger>
              <AccordionContent className="text-[var(--text-secondary)]">{item.respuesta}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/FAQ.tsx
git commit -m "feat: add FAQ section with accordion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 15: FinalCTA + Footer + WhatsAppButton

**Files:**
- Create: `components/FinalCTA.tsx`
- Create: `components/Footer.tsx`
- Create: `components/WhatsAppButton.tsx`

**Interfaces:**
- Consumes: `site` (Task 4), `WaitlistForm` (Task 8).
- Produces: `<FinalCTA />`, `<Footer />`, `<WhatsAppButton />`. Usados por `app/page.tsx`.

- [ ] **Step 1: Implementar FinalCTA.tsx**

```tsx
import { site } from "@/content/site";
import { WaitlistForm } from "@/components/WaitlistForm";

export function FinalCTA() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <h2 className="font-display text-3xl font-bold text-[var(--text-primary)]">{site.finalCta.titulo}</h2>
        <p className="mt-3 text-[var(--text-secondary)]">{site.finalCta.texto}</p>
        <div className="mt-8 flex justify-center">
          <WaitlistForm origen="final" />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implementar Footer.tsx**

```tsx
import { site } from "@/content/site";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)] py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-center">
        <span className="font-display text-xl font-extrabold text-[var(--primary)]">{site.marca}</span>
        <p className="text-sm text-[var(--text-secondary)]">{site.footer.tagline}</p>
        <p className="text-xs text-[var(--text-muted)]">{site.footer.derechos}</p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Implementar WhatsAppButton.tsx**

```tsx
import { site } from "@/content/site";

export function WhatsAppButton() {
  return (
    <a
      href={site.whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--emerald)] text-white shadow-lg hover:opacity-90"
    >
      <span className="font-bold">WA</span>
    </a>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/FinalCTA.tsx components/Footer.tsx components/WhatsAppButton.tsx
git commit -m "feat: add FinalCTA, Footer and WhatsApp button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 16: Ensamblar la página (app/page.tsx)

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: todos los componentes de sección (Tasks 9–15).
- Produces: la landing completa renderizada en `/`.

- [ ] **Step 1: Reemplazar app/page.tsx**

```tsx
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { ProblemSection } from "@/components/ProblemSection";
import { HowItWorks } from "@/components/HowItWorks";
import { ModulesGrid } from "@/components/ModulesGrid";
import { DemoSection } from "@/components/DemoSection";
import { FoundersStory } from "@/components/FoundersStory";
import { PricingTable } from "@/components/PricingTable";
import { FAQ } from "@/components/FAQ";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ProblemSection />
        <HowItWorks />
        <ModulesGrid />
        <DemoSection />
        <FoundersStory />
        <PricingTable />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
```

- [ ] **Step 2: Verificar build y vista**

Run: `npm run build` luego `npm run dev`.
Expected: build sin errores; `http://localhost:3000` muestra todas las secciones en orden, fondo marfil, sin errores de consola.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: assemble landing page from all sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 17: Vercel Analytics

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: scaffold (Task 1).
- Produces: tracking de tráfico activo en prod.

- [ ] **Step 1: Instalar**

```bash
npm install @vercel/analytics
```

- [ ] **Step 2: Añadir `<Analytics />` al layout**

En `app/layout.tsx`, importar `import { Analytics } from "@vercel/analytics/next";` y renderizar `<Analytics />` justo antes de cerrar `</body>`.

- [ ] **Step 3: Verificar**

Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx package.json package-lock.json
git commit -m "feat: add Vercel Analytics

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 18: Test E2E del flujo de waitlist (Playwright)

**Files:**
- Create: `e2e/waitlist.spec.ts`
- Create: `playwright.config.ts`
- Modify: `package.json` (script `e2e`)

**Interfaces:**
- Consumes: la página ensamblada (Task 16) y la API route (Task 7).
- Produces: prueba de extremo a extremo del envío del formulario (con la respuesta de red mockeada para no tocar Supabase).

- [ ] **Step 1: Instalar Playwright**

```bash
npm init playwright@latest
```

Aceptar TypeScript, carpeta `e2e`, NO agregar GitHub Actions por ahora. Editar `playwright.config.ts` para `webServer`:

```ts
// dentro de defineConfig:
webServer: {
  command: "npm run dev",
  url: "http://localhost:3000",
  reuseExistingServer: true,
},
use: { baseURL: "http://localhost:3000" },
```

Añadir a `package.json`: `"e2e": "playwright test"`.

- [ ] **Step 2: Escribir el test**

`e2e/waitlist.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("usuario se une a la waitlist desde el hero", async ({ page }) => {
  // Interceptar la API para no tocar Supabase
  await page.route("**/api/waitlist", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );

  await page.goto("/");
  const hero = page.locator("#waitlist");
  await hero.getByLabel("Correo electrónico").fill("prueba@aureo.app");
  await hero.getByRole("button", { name: /unirme/i }).click();

  await expect(page.getByRole("status")).toContainText(/te avisaremos/i);
});

test("muestra error con email inválido devuelto por la API", async ({ page }) => {
  await page.route("**/api/waitlist", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Ingresa un correo válido." }) })
  );
  await page.goto("/");
  const hero = page.locator("#waitlist");
  await hero.getByLabel("Correo electrónico").fill("x@y.com");
  await hero.getByRole("button", { name: /unirme/i }).click();
  await expect(page.getByRole("alert")).toContainText(/correo válido/i);
});
```

- [ ] **Step 3: Ejecutar**

Run: `npm run e2e`
Expected: 2 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/ playwright.config.ts package.json package-lock.json
git commit -m "test: add Playwright e2e for waitlist flow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 19: Auditoría de calidad (UI guidelines + build limpio)

**Files:**
- (sin cambios de código nuevos salvo fixes que surjan)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: confirmación de que la landing pasa revisión básica antes de desplegar.

- [ ] **Step 1: Lint y typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 2: Suite completa**

Run: `npm test && npm run e2e`
Expected: todo verde.

- [ ] **Step 3: Revisión de UI**

Usar la skill `web-design-guidelines` sobre los componentes (contraste, foco visible en inputs/botones, `lang="es"`, alt/aria, jerarquía de headings). Corregir hallazgos críticos inline. Verificar responsive en viewport móvil (375px) con Playwright o el navegador.

- [ ] **Step 4: Commit (si hubo fixes)**

```bash
git add -A
git commit -m "fix: address UI guideline findings before deploy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 20: Deploy a Vercel + dominio aureo.app

**Files:**
- (configuración en Vercel, sin cambios de repo salvo `README.md` opcional)

**Interfaces:**
- Consumes: repo completo y verificado.
- Produces: sitio en producción en `aureo.app`.

- [ ] **Step 1: Crear el proyecto Supabase real**

En supabase.com: crear proyecto, ejecutar `supabase/schema.sql` en el SQL Editor, copiar `Project URL` y `service_role key`.

- [ ] **Step 2: Push del repo a GitHub**

Crear repo remoto `aureo-landing` y:

```bash
git remote add origin https://github.com/<usuario>/aureo-landing.git
git push -u origin main
```

- [ ] **Step 3: Importar en Vercel**

En vercel.com: New Project → importar `aureo-landing`. Framework: Next.js (autodetectado).

- [ ] **Step 4: Variables de entorno en Vercel**

Agregar en Project Settings → Environment Variables (Production + Preview):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 5: Deploy y prueba real**

Deploy. Abrir la URL `*.vercel.app`, enviar un email real por el formulario, confirmar que aparece la fila en la tabla `waitlist` de Supabase.

- [ ] **Step 6: Conectar el dominio**

En Vercel → Domains → agregar `aureo.app`. Configurar los registros DNS según indique Vercel. Esperar verificación.

- [ ] **Step 7: Verificación final en producción**

Abrir `https://aureo.app`, enviar un email de prueba, confirmar la fila en Supabase y que Vercel Analytics registra la visita.

- [ ] **Step 8: Commit (README opcional)**

```bash
git add README.md
git commit -m "docs: add project README

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Notas de orquestación (modelos por tarea)

- **Opus 4.8 (orquestador):** decisiones de arquitectura, copy de conversión (Task 4), revisión entre tareas, Task 19.
- **Sonnet 4.6:** implementación de Tasks 1–3, 5–18 (scaffolding, lógica, componentes, tests).
- **Skills/MCP a aprovechar:** `frontend-design` y `ui-ux-pro-max` (Tasks 9–16), `vercel:shadcn` (Task 3), `context7` (docs Next/Supabase si surge duda de API), `webapp-testing` (Task 18), `web-design-guidelines` (Task 19), `vercel:deploy`/`vercel-cli` (Task 20).
- Capturas reales del producto (Hero Task 9, Demo Task 12): exportar del app Aureo actual y reemplazar los placeholders en un pase de pulido tras Task 16.
