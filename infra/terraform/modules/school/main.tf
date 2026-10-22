# Una escuela: su base de datos, su bucket, sus secretos y tres piezas de Cloud Run
# (web pública, worker interno y job de migraciones). Cada escuela tiene su propia cuenta de servicio,
# así su clave de archivos y sus secretos no sirven para leer los de otra escuela.

terraform {
  required_providers {
    google = { source = "hashicorp/google" }
    random = { source = "hashicorp/random" }
  }
}

locals {
  name_prefix = "fert-${var.slug}"
  app_url     = var.domain != null ? "https://${var.domain}" : "https://${local.name_prefix}-web-${var.project_number}.${var.region}.run.app"
  db_name     = "fert_${replace(var.slug, "-", "_")}"
}

resource "google_service_account" "school" {
  account_id   = "${local.name_prefix}-run"
  display_name = "Fertelligence · ${var.name}"
}

resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.school.member
}

resource "google_service_account_iam_member" "deploy_act_as" {
  service_account_id = google_service_account.school.name
  role               = "roles/iam.serviceAccountUser"
  member             = var.deploy_sa_member
}

# ---------- Base de datos ----------

resource "random_password" "db" {
  length  = 32
  special = false # va dentro de DATABASE_URL; sin caracteres que haya que escapar
}

resource "google_sql_database" "school" {
  name     = local.db_name
  instance = var.sql_instance.name
}

resource "google_sql_user" "school" {
  name     = local.db_name
  instance = var.sql_instance.name
  password = random_password.db.result
}

# ---------- Archivos (GCS con la API compatible con S3) ----------

resource "google_storage_bucket" "files" {
  name                        = "${var.project_id}-${local.name_prefix}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning {
    enabled = true
  }
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "files" {
  for_each = toset(["roles/storage.objectAdmin", "roles/storage.legacyBucketReader"])
  bucket   = google_storage_bucket.files.name
  role     = each.value
  member   = google_service_account.school.member
}

resource "google_storage_hmac_key" "files" {
  service_account_email = google_service_account.school.email
}

# ---------- Secretos de la escuela ----------

resource "random_bytes" "token_key" {
  length = 32
}

locals {
  school_secrets = {
    DATABASE_URL         = "postgresql://${google_sql_user.school.name}:${random_password.db.result}@localhost/${google_sql_database.school.name}?host=/cloudsql/${var.sql_instance.connection_name}&connection_limit=5"
    S3_ACCESS_KEY_ID     = google_storage_hmac_key.files.access_id
    S3_SECRET_ACCESS_KEY = google_storage_hmac_key.files.secret
    TOKEN_ENCRYPTION_KEY = random_bytes.token_key.base64
  }
}

resource "google_secret_manager_secret" "school" {
  for_each  = nonsensitive(toset(keys(local.school_secrets)))
  secret_id = "${local.name_prefix}-${lower(replace(each.value, "_", "-"))}"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "school" {
  for_each    = google_secret_manager_secret.school
  secret      = each.value.id
  secret_data = local.school_secrets[each.key]
}

resource "google_secret_manager_secret_iam_member" "school" {
  for_each  = merge({ for k, s in google_secret_manager_secret.school : k => s.secret_id }, var.shared_secrets)
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.school.member
}

locals {
  plain_env = {
    SCHOOL_NAME           = var.name
    APP_URL               = local.app_url
    S3_ENDPOINT           = "https://storage.googleapis.com"
    S3_REGION             = "auto"
    S3_BUCKET             = google_storage_bucket.files.name
    MAIL_FROM             = var.mail_from
    AI_MONTHLY_BUDGET_USD = tostring(var.ai_monthly_budget_usd)
    GOOGLE_PROJECT_NUMBER = var.project_number
  }
  secret_env = merge({ for k, s in google_secret_manager_secret.school : k => s.secret_id }, var.shared_secrets)
}

# ---------- Web (pública) ----------

resource "google_cloud_run_v2_service" "web" {
  name                = "${local.name_prefix}-web"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.school.email
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.sql_instance.connection_name]
      }
    }
    containers {
      image = var.image
      ports {
        container_port = 3000
      }
      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      startup_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds    = 5
        failure_threshold = 12
      }
    }
  }

  # La CI despliega imágenes nuevas con gcloud; Terraform no las vuelve atrás.
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_version.school, google_secret_manager_secret_iam_member.school]
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  name     = google_cloud_run_v2_service.web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------- Worker (cola de trabajos, siempre encendido, sin acceso desde internet) ----------

resource "google_cloud_run_v2_service" "worker" {
  name                = "${local.name_prefix}-worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false

  template {
    service_account = google_service_account.school.email
    scaling {
      min_instance_count = 1
      max_instance_count = 1 # una sola instancia: los trabajos programados no se duplican
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.sql_instance.connection_name]
      }
    }
    containers {
      image   = var.image
      command = ["npm", "run", "start", "-w", "@fertelligence/worker"]
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = false # la CPU tiene que seguir activa sin pedidos HTTP
      }
      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_version.school, google_secret_manager_secret_iam_member.school]
}

# ---------- Migraciones (se ejecuta en cada despliegue, antes de actualizar web y worker) ----------

resource "google_cloud_run_v2_job" "migrate" {
  name                = "${local.name_prefix}-migrate"
  location            = var.region
  deletion_protection = false

  template {
    task_count = 1
    template {
      service_account = google_service_account.school.email
      max_retries     = 1
      timeout         = "600s"
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.sql_instance.connection_name]
        }
      }
      containers {
        image   = var.image
        command = ["sh", "-c", "npm run db:deploy && npm run db:seed"]
        dynamic "env" {
          for_each = merge(local.plain_env, {
            SEED_MODE        = "school"
            ADMIN_EMAIL      = var.admin_email
            ADMIN_FIRST_NAME = var.admin_first_name
            ADMIN_LAST_NAME  = var.admin_last_name
          })
          content {
            name  = env.key
            value = env.value
          }
        }
        dynamic "env" {
          for_each = { for k, s in google_secret_manager_secret.school : k => s.secret_id }
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_version.school, google_secret_manager_secret_iam_member.school]
}
