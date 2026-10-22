# Recursos compartidos por todas las escuelas: APIs, registro de imágenes, instancia de Cloud SQL,
# secretos de servicios externos y el acceso de GitHub Actions sin claves.

data "google_project" "this" {}

locals {
  services = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com",
    # Las que usa la app con Google (ingreso, Classroom, Forms, Drive)
    "classroom.googleapis.com",
    "forms.googleapis.com",
    "drive.googleapis.com",
    "picker.googleapis.com",
    "generativelanguage.googleapis.com",
  ]
  image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}/fertelligence:${var.image_tag}"
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "app" {
  repository_id = "fertelligence"
  format        = "DOCKER"
  location      = var.region
  cleanup_policies {
    id     = "conservar-las-ultimas-20"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }
  depends_on = [google_project_service.enabled]
}

# Una instancia para todas las escuelas; cada escuela tiene su propia base y su propio usuario.
resource "google_sql_database_instance" "main" {
  name             = "fertelligence"
  database_version = "POSTGRES_16"
  region           = var.region
  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE"
    availability_type = "ZONAL"
    disk_autoresize   = true
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "06:00" # 3 a. m. en Argentina
      backup_retention_settings {
        retained_backups = 14
      }
    }
    ip_configuration {
      ipv4_enabled = true # Cloud Run entra por el conector de Cloud SQL (IAM), no por IP abierta
      ssl_mode     = "ENCRYPTED_ONLY"
    }
    maintenance_window {
      day  = 7
      hour = 7
    }
    insights_config {
      query_insights_enabled = true
    }
  }
  deletion_protection = true
  depends_on          = [google_project_service.enabled]
}

# Secretos de servicios externos, compartidos. Terraform crea el contenedor; el valor se carga a mano
# (gcloud secrets versions add ...) para que nunca quede en el estado ni en el repositorio.
locals {
  shared_secrets = {
    GEMINI_API_KEY        = "gemini-api-key"
    RESEND_API_KEY        = "resend-api-key"
    GOOGLE_CLIENT_ID      = "google-client-id"
    GOOGLE_CLIENT_SECRET  = "google-client-secret"
    GOOGLE_PICKER_API_KEY = "google-picker-api-key"
  }
}

resource "google_secret_manager_secret" "shared" {
  for_each  = local.shared_secrets
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

# ---------- GitHub Actions: despliegue sin claves (Workload Identity Federation) ----------

resource "google_service_account" "deploy" {
  account_id   = "fertelligence-deploy"
  display_name = "Fertelligence (despliegue desde GitHub)"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # Solo la rama main de este repositorio puede desplegar.
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "deploy_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Lo que necesita el despliegue: subir imágenes, actualizar Cloud Run y ejecutar el job de migraciones.
resource "google_project_iam_member" "deploy_roles" {
  for_each = toset(["roles/run.developer", "roles/artifactregistry.writer"])
  project  = var.project_id
  role     = each.value
  member   = google_service_account.deploy.member
}

# ---------- Una instalación por escuela ----------

module "school" {
  source   = "./modules/school"
  for_each = var.schools

  slug             = each.key
  name             = each.value.name
  domain           = each.value.domain
  admin_email      = each.value.admin_email
  admin_first_name = each.value.admin_first_name
  admin_last_name  = each.value.admin_last_name

  project_id            = var.project_id
  project_number        = data.google_project.this.number
  region                = var.region
  image                 = local.image
  sql_instance          = google_sql_database_instance.main
  deploy_sa_member      = google_service_account.deploy.member
  shared_secrets        = { for env, s in google_secret_manager_secret.shared : env => s.secret_id if contains(var.configured_secrets, env) }
  mail_from             = var.mail_from
  ai_monthly_budget_usd = var.ai_monthly_budget_usd
}
