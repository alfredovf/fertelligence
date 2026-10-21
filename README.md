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
