# Dataset de fine-tuning — Melyor

`melyor-finetune.jsonl` — 46 ejemplos sintéticos en formato de fine-tuning de
OpenAI (chat), pensados para arrancar el fine-tuning de `gpt-4o-mini` antes de
tener conversaciones reales de clientes.

## Qué es y qué no es

- **Es** un dataset semilla: cubre los módulos de Aureo (Inventario,
  Clientes, Facturación, Compras, Logística/WMS, Alertas, Reportes), el tono
  de Melyor (directo, ejecutivo, sin relleno, acción concreta), los casos de
  "no tengo ese dato → te redirijo al módulo correcto", los casos fuera de
  alcance, y los intentos de prompt injection para revelar el system prompt.
- **No es** un reemplazo de datos reales. OpenAI recomienda arrancar con un
  mínimo de 10 ejemplos (funciona técnicamente), pero para que el
  fine-tuning mejore de verdad el comportamiento sobre el base model hacen
  falta decenas a cientos de ejemplos reales — idealmente extraídos de
  conversaciones reales de Melyor una vez que haya uso real. Este archivo es
  el punto de partida, no el dataset final.

## Formato

Cada línea es un objeto JSON independiente con la forma:

```json
{"messages": [
  {"role": "system", "content": "<system prompt de Melyor>"},
  {"role": "user", "content": "Contexto actual del sistema:\n<contexto>\n\nPregunta: <pregunta>"},
  {"role": "assistant", "content": "<respuesta ideal>"}
]}
```

El `system` y el formato del mensaje de usuario (`Contexto actual del
sistema:\n...\n\nPregunta: ...`) son exactamente los que arma
`api/melyor-chat.js` en producción — así el modelo fine-tuneado ve en
entrenamiento la misma forma de input que va a recibir en producción.

## Cómo correr el fine-tuning

Requiere la CLI/SDK de OpenAI y una `OPENAI_API_KEY` con acceso a
fine-tuning (variable de entorno o `openai auth login`).

```bash
# 1. Subir el archivo de entrenamiento
openai api files.create -f training/melyor-finetune.jsonl -p fine-tune

# 2. Lanzar el job (guarda el file id que devolvió el paso anterior)
openai api fine_tuning.jobs.create -t <file-id> -m gpt-4o-mini

# 3. Seguir el estado del job
openai api fine_tuning.jobs.retrieve -i <job-id>
```

Cuando el job termine, la respuesta trae un `fine_tuned_model` con el id
(`ft:gpt-4o-mini:...:...`). Ese id va en `api/melyor-chat.js`, reemplazando
la constante `MODEL = "gpt-4o-mini"`.

## Cómo ampliarlo con datos reales

Una vez que Melyor tenga uso real en producción, la fuente correcta de
nuevos ejemplos es el propio log de `recordUsage`/consultas — tomar pares
pregunta+contexto+respuesta donde la respuesta real haya sido buena (o
corregirla a mano si no lo fue) y agregarlos como una línea más al mismo
JSONL, respetando el formato de arriba. Evitar mezclar ejemplos con tonos
distintos al de Melyor — el fine-tuning aprende el estilo, no solo el
contenido.
