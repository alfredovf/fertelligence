variable "slug" {
  description = "Identificador corto de la escuela (minúsculas y guiones)."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}[a-z0-9]$", var.slug))
    error_message = "Usá entre 3 y 20 caracteres: minúsculas, números y guiones."
  }
}

variable "name" { type = string }
variable "domain" {
  type    = string
  default = null
}
variable "admin_email" { type = string }
variable "admin_first_name" { type = string }
variable "admin_last_name" { type = string }

variable "project_id" { type = string }
variable "project_number" { type = string }
variable "region" { type = string }
variable "image" { type = string }

variable "sql_instance" {
  description = "Instancia de Cloud SQL compartida."
  type        = object({ name = string, connection_name = string })
}

variable "deploy_sa_member" {
  description = "Cuenta de despliegue (GitHub), que tiene que poder usar la cuenta de la escuela."
  type        = string
}

variable "shared_secrets" {
  description = "Secretos compartidos ya cargados: variable de entorno => id del secreto."
  type        = map(string)
}

variable "mail_from" { type = string }
variable "ai_monthly_budget_usd" { type = number }
