output "summary" {
  value = {
    url      = local.app_url
    web      = google_cloud_run_v2_service.web.name
    worker   = google_cloud_run_v2_service.worker.name
    migrate  = google_cloud_run_v2_job.migrate.name
    database = google_sql_database.school.name
    bucket   = google_storage_bucket.files.name
  }
}
