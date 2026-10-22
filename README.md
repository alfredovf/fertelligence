# Fertelligence

Plataforma donde los docentes crean tareas cortas y estructuradas para alumnos con dificultades de atención, y los alumnos las resuelven desde el celular, la tablet o la computadora.

- Alcance y mockups: `fertelligence-alcance.html`
- Documento técnico y plan del MVP: Claude Docs, "Fertelligence · Documento técnico"

## Levantarlo en Docker Desktop

```bash
cp .env.example .env
docker compose up -d --build
```

Abrí http://localhost:3000. La primera vez, el servicio `migrate` crea las tablas y carga una escuela de prueba.

Usuarios de la escuela de prueba: `admin@escuela.test` (administración), `mlopez@escuela.test` y `aferreyra@escuela.test` (docentes), y cinco alumnos `nombre.apellido@escuela.test`. Todos usan la contraseña de `SEED_DEMO_PASSWORD` en `.env`.

Sin `RESEND_API_KEY`, los emails (bienvenida, consentimiento, recuperación) no se envían: se escriben en el log del worker con su enlace (`docker compose logs worker`).

| Servicio | Dirección |
| --- | --- |
| Aplicación | http://localhost:3000 |
| Estado (JSON) | http://localhost:3000/api/health |
| Archivos (RustFS, consola) | http://localhost:9001 |
| PostgreSQL | localhost:5432 (usuario y contraseña: `fertelligence`) |

Para empezar de cero (borra los datos): `docker compose down -v`.

## Desarrollo sin Docker para la app

Con `db` y `storage` corriendo en Docker (`docker compose up -d db storage`):

```bash
npm install
npm run db:deploy
npm run db:seed
npm run dev          # web en http://localhost:3000
npm run dev:worker   # worker
```

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `apps/web` | Next.js: pantallas y API |
| `apps/worker` | Cola de trabajos (pg-boss) |
| `packages/core` | Esquema de la base (Prisma), reglas de negocio, tipos de tarea, cálculo de notas |

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm test` | Pruebas |
| `npm run typecheck` | Revisión de tipos |
| `npm run db:migrate` | Crea una migración nueva a partir del esquema |
| `npm run db:deploy` | Aplica las migraciones |
| `npm run db:seed` | Carga la escuela de prueba (si no existe) |

## Servicios externos

| Servicio | Variables del `.env` | Para qué |
| --- | --- | --- |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Crear tareas desde una foto o un texto. Usar una clave de un proyecto con facturación (nivel pago). |
| Google (OAuth) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Ingreso con Google y conexión con Classroom. URI de retorno: `http://localhost:3000/api/auth/google/callback` |
| Google Picker | `GOOGLE_PICKER_API_KEY`, `GOOGLE_PROJECT_NUMBER` | Elegir archivos de Drive al importar desde Classroom |
| Tokens de Google | `TOKEN_ENCRYPTION_KEY` | Cifra los permisos de Classroom guardados en la base |
| Resend | `RESEND_API_KEY`, `MAIL_FROM` | Emails |

Después de cambiar el `.env`: `docker compose up -d --force-recreate web worker`.
