# Despliegue en Google Cloud

Un proyecto de Google Cloud aloja todas las escuelas. Lo compartido: una instancia de Cloud SQL (PostgreSQL 16), el registro de imágenes y los secretos de servicios externos. Lo propio de cada escuela: su **base de datos**, su **bucket** de archivos, su **cuenta de servicio** y tres piezas de Cloud Run (web pública, worker interno y job de migraciones).

```
                    ┌──────────── Proyecto de Google Cloud ────────────┐
 Navegador ──HTTPS──▶ fert-<escuela>-web  (Cloud Run, 0–3 instancias)  │
                    │ fert-<escuela>-worker (Cloud Run, 1 instancia)   │
                    │ fert-<escuela>-migrate (Cloud Run job)           │
                    │        │ socket de Cloud SQL       │ API S3      │
                    │        ▼                           ▼             │
                    │ Cloud SQL "fertelligence"     GCS <proyecto>-fert-<escuela>
                    │   └ base fert_<escuela>                          │
                    │ Secret Manager: claves de la escuela + compartidas│
                    └──────────────────────────────────────────────────┘
 GitHub Actions ──(Workload Identity, sin claves)──▶ Artifact Registry + Cloud Run
```

## Requisitos

- Proyecto de Google Cloud con facturación activa, y `gcloud` y `terraform` (1.9 o superior) instalados.
- Las claves de los servicios externos: Gemini (en un proyecto con facturación, para que Google no use los datos), Resend (con el dominio verificado), y el cliente OAuth y la clave del Picker de Google (ver la guía de console.cloud.google.com).

## Primera vez

1. **Bucket para el estado de Terraform** (una sola vez):

   ```bash
   gcloud storage buckets create gs://<proyecto>-tfstate --location=southamerica-east1 --uniform-bucket-level-access
   ```

2. **Variables**: copiá `terraform/terraform.tfvars.example` como `terraform/terraform.tfvars` y completalo. Al principio dejá `configured_secrets = []`.

3. **Base compartida** (APIs, registro de imágenes, Cloud SQL, contenedores de secretos y acceso de GitHub):

   ```bash
   cd infra/terraform
   terraform init -backend-config="bucket=<proyecto>-tfstate"
   terraform apply -target=google_project_service.enabled -target=google_artifact_registry_repository.app -target=google_sql_database_instance.main -target=google_secret_manager_secret.shared -target=google_iam_workload_identity_pool_provider.github -target=google_service_account_iam_member.deploy_wif -target=google_project_iam_member.deploy_roles
   ```

4. **Cargar los secretos compartidos**. Cada valor se escribe en la terminal, nunca en un archivo del repositorio:

   ```bash
   printf '%s' 'VALOR' | gcloud secrets versions add gemini-api-key --data-file=-
   ```

   Repetí con `resend-api-key`, `google-client-id`, `google-client-secret` y `google-picker-api-key`. Después agregá a `configured_secrets` los que cargaste.

5. **GitHub**: en el repositorio, *Settings → Secrets and variables → Actions*:
   - Secretos: `GCP_WORKLOAD_IDENTITY_PROVIDER` y `GCP_DEPLOY_SERVICE_ACCOUNT` (salen de `terraform output`).
   - Variables: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_DEPLOY_ENABLED=true` y `GCP_SCHOOLS` vacía por ahora.

   Ejecutá el workflow **Deploy** a mano (*Actions → Deploy → Run workflow*): con `GCP_SCHOOLS` vacía solo sube la primera imagen.

6. **Escuelas**: `terraform apply` (sin `-target`) crea la base, el bucket, los secretos y los servicios de cada escuela.

7. Poné en `GCP_SCHOOLS` los identificadores separados por espacios (por ejemplo `escuela-piloto`) y volvé a ejecutar **Deploy**. Corre las migraciones, crea la escuela con su primer administrador (sin datos de ejemplo) y actualiza web y worker.

8. **Google OAuth**: en el cliente OAuth agregá la URL de cada escuela (`terraform output schools`) como origen autorizado, y `<url>/api/auth/google/callback` como URI de redirección.

El administrador entra con Google (si su cuenta coincide con `admin_email`) o con "Olvidé mi contraseña".

## Día a día

- **Desplegar**: cada push a `main` que pasa la CI se despliega solo, escuela por escuela: migraciones primero, después worker y web. Si las migraciones fallan, esa escuela queda como estaba.
- **Sumar una escuela**: agregala en `schools`, corré `terraform apply`, sumala a `GCP_SCHOOLS` y ejecutá **Deploy**.
- **Cambiar una clave compartida**: cargá una versión nueva con `gcloud secrets versions add …` y reiniciá los servicios (`gcloud run services update fert-<escuela>-web --region … --update-labels=rev=$(date +%s)`).
- **Copias de seguridad**: Cloud SQL guarda 14 días con recuperación a un momento puntual. Los archivos tienen versionado, y las versiones viejas se borran a los 30 días.
- **Dominio propio**: completá `domain` en la escuela (eso cambia `APP_URL`). Apuntalo con un balanceador HTTPS o con el mapeo de dominios de Cloud Run, donde la región lo permita.

## Costos aproximados (por mes)

| Pieza | Estimado |
|---|---|
| Cloud SQL `db-g1-small` (compartida) | USD 25–30 |
| Worker por escuela (1 instancia siempre encendida, 1 vCPU, 512 MB) | USD 35–45 |
| Web por escuela (escala a cero) | USD 0–10 |
| Almacenamiento, secretos, registro | USD 1–3 |
| Gemini (tope configurable por escuela) | hasta USD 50 |

Si el worker siempre encendido pesa en el costo, se puede pasar a Cloud Run *worker pools* o a una VM e2-small compartida.

## Seguridad

- Cada escuela usa su propia cuenta de servicio, que solo accede a su base, su bucket y sus secretos.
- La contraseña de la base, la clave HMAC del bucket y la clave de cifrado de tokens las genera Terraform y quedan en Secret Manager y en el estado de Terraform. Por eso el bucket del estado tiene que ser privado.
- GitHub despliega sin claves guardadas (Workload Identity Federation), y solo desde la rama `main` de este repositorio.
- El worker no recibe tráfico de internet.
