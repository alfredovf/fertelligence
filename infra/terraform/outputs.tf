output "image_repository" {
  description = "Dónde sube la CI la imagen."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}/fertelligence"
}

output "workload_identity_provider" {
  description = "Para el secreto GCP_WORKLOAD_IDENTITY_PROVIDER de GitHub."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account" {
  description = "Para el secreto GCP_DEPLOY_SERVICE_ACCOUNT de GitHub."
  value       = google_service_account.deploy.email
}

output "schools" {
  description = "URL y recursos de cada escuela."
  value       = { for slug, s in module.school : slug => s.summary }
}
