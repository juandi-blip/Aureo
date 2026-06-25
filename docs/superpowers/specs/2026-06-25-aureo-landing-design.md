# Aureo — Landing Page (Marketing Site) · Design Spec

**Fecha:** 2026-06-25
**Autores:** Juan David + Leif (founders) · Claude (Opus 4.8, orquestador)
**Estado:** Draft para revisión

---

## 1. Objetivo

Construir el sitio de marketing de Aureo en `aureo.app` para captar clientela
mediante una **lista de espera** pre-lanzamiento. El sitio educa al prospecto
sobre el dolor que Aureo resuelve, demuestra el diferenciador (logística
empresarial accesible) y convierte el interés en un email registrado.

**Público objetivo:** la ferretería mediana es la **punta de lanza** (origen del
producto, dolor mejor entendido), pero la landing habla a **todo negocio con el
mismo contexto operativo**: inventario físico + ventas/POS + bodega que
gestionar. Esto incluye ferreterías, distribuidoras, depósitos de materiales de
construcción, repuestos automotrices, ferro-eléctricos, agroinsumos y almacenes
con SKUs y rotación. El mensaje principal usa la ferretería como ejemplo
concreto, pero el copy y los planes no excluyen a esos negocios afines.

**Meta primaria:** maximizar registros calificados en la waitlist.
**Meta secundaria:** establecer la marca Aureo y servir de base SEO.

---

## 2. Contexto estratégico

- **Etapa:** producto en desarrollo, **sin clientes ni testimonios todavía**.
- **Mercado:** negocios con inventario físico + ventas + bodega (5–20 empleados,
  500–2000+ SKUs) en Colombia primero; LATAM después. Cuña de entrada:
  ferreterías medianas. Expansión natural: distribuidoras, materiales de
  construcción, repuestos, ferro-eléctricos, agroinsumos, almacenes con rotación.
- **Diferenciador real:** Aureo incluye WMS con mapa de calor de bodega,
  análisis ABC, rotación Pareto y flujo de picking — logística de nivel
  corporativo empaquetada para una PyME. La competencia directa (Alegra,
  GridPOS, Cuenti) solo ofrece POS + inventario básico.
- **Debilidad de la competencia (= nuestra oportunidad):** sin precios visibles,
  sin casos de ferreterías reales, diseño genérico, CTAs repetidos sin foco.

### Enfoque del sitio (aprobado)
Sitio completo estilo narrativo (B) + elementos demo-forward (C). Las secciones
de prueba social quedan con placeholders elegantes ("Próximamente") y se llenan
cuando lleguen los primeros clientes. La estructura ya queda lista.

---

## 3. Decisiones técnicas (cerradas)

| Decisión | Elección |
|----------|----------|
| Framework | **Next.js (App Router) + TypeScript** |
| UI components | **shadcn/ui** + Tailwind CSS |
| Hosting | **Vercel** (dominio `aureo.app`) |
| Waitlist storage | **Supabase** (Postgres) — mismo backend que el futuro app |
| Idioma | **Solo español** (Colombia/LATAM) |
| Identidad visual | **Coherente con el app Aureo** + referencias SaaS (bitsperfoods) |

---

## 4. Identidad visual

Derivada de los design tokens reales del producto (`styles.css`). El app NO es
oscuro: es **marfil cálido premium** con un motivo celestial/"Saturno".

### Paleta
| Token | Valor | Uso |
|-------|-------|-----|
| Base marfil | `#F7F3EA` | Fondo principal (lienzo) |
| Superficie | `#FFFFFF` | Tarjetas |
| Banda sutil | `#EFE7D7` | Secciones alternas |
| Primario (pizarra) | `#2E4A6E` | CTAs, acentos, marca |
| Primario fuerte | `#1E3352` | Hover, gradientes |
| Verde oliva | `#5E7D52` | Éxito, checks, métricas positivas |
| Bronce | `#A8742B` | Detalles cálidos, destacados |
| Terracota | `#A8442C` | Alertas / acentos de contraste |
| Texto primario | `#241F1A` | Café-carbón |
| Texto secundario | `#6E6354` | Topo cálido |

### Tipografía
- Inter (display + UI), pesos 400/600/700/800. Coincide con el app.
- Considerar Syne para titulares grandes del hero (el app la usa puntualmente).

### Tono visual
Premium, cálido, confiable. Mucho espacio en blanco (referencia bitsperfoods),
gradientes pizarra sutiles, sombras suaves, bordes redondeados (`radius-md` 12px,
`radius-lg` 18px). Capturas reales del producto como protagonista.

---

## 5. Arquitectura de información (secciones)

Orden de la página, de arriba hacia abajo:

1. **Nav** — logo Aureo, enlaces ancla (Producto, Cómo funciona, Precios, FAQ),
   CTA "Unirse a la lista".
2. **Hero** — headline de outcome + subhead + CTA primario (captura email inline)
   + visual del producto (dashboard real). Sin jerga.
3. **Problema** — los 3–4 dolores del dueño de negocio con bodega (buscar
   productos a ciegas, no saber qué rota, picking lento, inventario descuadrado).
   Se ilustra con la ferretería como caso concreto pero el dolor es transversal
   a cualquier negocio con inventario físico.
4. **Solución / Cómo funciona** — 3 pasos simples de cómo Aureo lo resuelve.
5. **Módulos / Features** — grid con los diferenciadores: POS, Inventario, WMS
   (mapa de calor), ABC/Pareto, Picking. Cada uno con captura real + beneficio.
6. **Demo** — sección demo-forward: GIF/video corto del WMS y ABC en acción
   (el diferenciador). Placeholder hasta grabarlo.
7. **Prueba social** — placeholder elegante "Primeros clientes próximamente" +
   historia de fundadores (autenticidad reemplaza testimonios al inicio).
8. **Precios** — 2 planes: **Starter** (POS+inventario+facturación → negocio
   pequeño) y **Pro** (+ WMS+ABC+picking+heatmap → mediano). Precios placeholder
   marcados como "Precio de fundador" para los primeros en la waitlist.
9. **FAQ** — objeciones preventivas (¿necesito conocimientos técnicos?, ¿corre
   en la nube?, ¿factura DIAN?, ¿qué pasa con mis datos?).
10. **CTA final** — repetición de captura de email + refuerzo de urgencia
    ("precio de fundador para los primeros N").
11. **Footer** — marca, contacto (WhatsApp), enlaces, aviso legal.

### Principios de conversión (de la investigación)
- Headline con outcome cuantificable, no features.
- Formulario corto (email + opcional: nombre/negocio/ciudad). 3 campos máx.
- Un solo CTA primario claro, repetido en hero / mitad / final.
- WhatsApp visible (canal clave en LATAM).
- Carga rápida (cada 1s de delay ≈ -7% conversión).

---

## 6. Modelo de datos (Supabase)

Tabla `waitlist`:

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid (pk) | default `gen_random_uuid()` |
| `email` | text | not null, único |
| `nombre` | text | opcional |
| `negocio` | text | opcional (nombre de la ferretería) |
| `ciudad` | text | opcional |
| `origen` | text | de qué CTA vino (hero/final/etc) |
| `created_at` | timestamptz | default `now()` |

- **RLS activado.** Insert público permitido solo vía la API route (clave
  anon con policy de insert), nunca select público.
- Validación de email en cliente y servidor. Anti-duplicado por `email` único
  (mostrar "ya estás en la lista" sin error feo).

---

## 7. Componentes (unidades aisladas)

Cada uno con propósito único, props claras, testeable solo:

- `WaitlistForm` — captura + validación + estado (idle/loading/success/error/dup).
- `Hero`, `ProblemSection`, `HowItWorks`, `ModulesGrid`, `ModuleCard`,
  `DemoSection`, `FoundersStory`, `PricingTable`, `PricingCard`, `FAQ`,
  `FinalCTA`, `Nav`, `Footer`, `WhatsAppButton`.
- `app/api/waitlist/route.ts` — endpoint POST: valida, inserta en Supabase,
  maneja duplicados, devuelve JSON.

Capa de datos aislada en `lib/supabase.ts` (cliente) para que la UI no conozca
los detalles del backend.

---

## 8. Manejo de errores

- Form: validación inline, mensajes en español claros, sin tecnicismos.
- API: try/catch, nunca exponer errores de DB al cliente; loggear server-side.
- Duplicado: tratado como éxito suave ("ya estás registrado").
- Red caída: estado de error con retry, el botón no se queda colgado.

---

## 9. Analítica

- Vercel Analytics (gratis) para tráfico y conversión.
- Evento custom en submit exitoso de waitlist (para medir conversión por CTA vía
  campo `origen`).

---

## 10. Deployment

- Repo separado del producto (`aureo-landing`) o carpeta dedicada. **Decisión
  pendiente menor:** repo nuevo vs subcarpeta. Recomendado: **repo nuevo** para
  deploy y dominio independientes.
- Vercel conectado al repo → deploy automático en push.
- Dominio `aureo.app` apuntado a Vercel.
- Variables de entorno (Supabase URL + anon key) en Vercel.

---

## 11. Orquestación de desarrollo (agentes + modelos)

Opus 4.8 orquesta. Trabajo dividido en tareas asignadas a subagentes con el
modelo adecuado (definición fina va en el plan de implementación):

- **Arquitectura/scaffolding** — Opus (decisiones estructurales).
- **Componentes UI** — Sonnet (implementación con skills frontend-design,
  ui-ux-pro-max, shadcn).
- **Copy en español** — Opus/Sonnet (mensajería de conversión).
- **Backend waitlist (Supabase + API route)** — Sonnet.
- **Review/QA** — code-reviewer + webapp-testing (Playwright) + web-design-guidelines.

Skills/MCP a usar: frontend-design, ui-ux-pro-max, theme-factory, shadcn,
vercel:*, webapp-testing, web-design-guidelines, mcp magic (componentes),
context7 (docs Next/Supabase).

---

## 12. Fuera de alcance (YAGNI por ahora)

- Login / dashboard de cliente en la landing (eso es el producto).
- Pasarela de pagos (la waitlist no cobra todavía).
- Blog / CMS.
- Multi-idioma (solo español por ahora).
- Testimonios reales (no existen aún — placeholders).

---

## 13. Criterios de éxito

- Landing desplegada en `aureo.app`, carga < 2s.
- Formulario de waitlist funcional end-to-end (email llega a Supabase).
- Responsive (móvil primero — muchos dueños navegan en celular).
- Coherente visualmente con la marca Aureo.
- Sin errores de consola; aprueba web-design-guidelines básico.
