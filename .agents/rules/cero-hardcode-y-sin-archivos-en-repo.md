---
description: Regla obligatoria de cero hardcode, código genérico para cualquier negocio y prohibición estricta de almacenar imágenes o archivos dentro del repositorio.
globs: 'src/**/*.ts'
alwaysApply: true
---

# Regla de Oro Backend: Cero Valores en Duro y Cero Imágenes en el Repositorio

Todo código desarrollado en este backend (especialmente en `automanual/`, servicios de IA y almacenamiento) debe cumplir estrictamente con las siguientes directrices:

---

## 1. Cero Valores en Duro (Zero Hardcoding)

- **Lógica 100% genérica y escalable para cualquier negocio:**
  - **Prohibido** escribir selectores específicos de un cliente particular, textos fijos de una app concreta, rutas hardcodeadas de negocio, credenciales, tokens o nombres de clientes dentro del código fuente.
  - Playwright y la IA deben operar de manera **genérica** analizando el DOM real en vivo, textos visibles, roles accesibles, URLs dinámicas y capturas completas de pantalla.
- **Configuración externa obligatoria:**
  - URLs de servicios, buckets, llaves API y secretos (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_BUCKET_AUTOMANUAL`, `GEMINI_API_KEY`, `API_BEARER_TOKEN`) deben leerse siempre desde `ConfigService` / `.env` o desde headers/payloads autorizados, jamás literales en código.
  - Datos de negocio (clientes, pantallas, URLs, casos de prueba, indicaciones de IA) deben residir en **PostgreSQL**, nunca en archivos JSON locales.

---

## 2. Prohibido Guardar Imágenes o Archivos en el Repositorio

- **Cero media/evidencias dentro del proyecto:**
  - Queda **terminantemente prohibido** guardar capturas de pantalla (`.png`, `.jpg`, `.webp`), evidencias QA, manuales estáticos, logos o archivos de sesión (`session.json`) dentro de carpetas del repositorio (ej. prohibido escribir en `datos/`, `public/` o carpetas locales del proyecto).
- **Uso exclusivo de `os.tmpdir()` para runtime efímero:**
  - Durante una ejecución activa de Playwright, cualquier imagen temporal requerida para análisis de Gemini Vision o subida a Storage debe escribirse únicamente en el directorio temporal del sistema operativo (`os.tmpdir()`).
  - **Limpieza inmediata obligatoria:** Todo archivo temporal en `os.tmpdir()` debe eliminarse (`fs.remove(...)`) inmediatamente después de subirlo a Supabase Storage o de descartar/finalizar la operación.
- **Persistencia exclusiva en Supabase Storage (con clasificación ordenada):**
  - Todas las imágenes y evidencias persistentes deben almacenarse únicamente en **Supabase Storage** siguiendo la jerarquía:
    - Capturas de exploración de pantalla: `clientes/<cliente>/pantallas/<pantalla>/exploracion/<archivo>.png`
    - Evidencias por caso de prueba: `clientes/<cliente>/pantallas/<pantalla>/casos/<codigo-caso>/<archivo>.png`
  - En base de datos (`PostgreSQL`) solo se persiste la URL pública devuelta por Supabase Storage (sin fallbacks a rutas locales del proyecto).

---

## 3. Arquitectura Stateless y Principios SOLID

- El backend debe ser **stateless** entre ejecuciones (sin depender de archivos de sesión locales en disco; las credenciales de login llegan en el `POST` y Playwright inicia sesión limpia).
- Mantener separación estricta de responsabilidades (**SOLID**): contratos/interfaces desacoplados, explorador con control anti-loop, orquestador del flujo y ejecutor de casos de prueba independientes.
