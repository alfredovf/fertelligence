variable "project_id" {
  description = "Proyecto de Google Cloud."
  type        = string
}

variable "region" {
  description = "Región. southamerica-east1 (San Pablo) es la más cercana a Argentina."
  type        = string
  default     = "southamerica-east1"
}

variable "github_repository" {
  description = "Repositorio que despliega, como owner/nombre."
  type        = string
  default     = "alfredovf/fertelligence"
}

variable "image_tag" {
  description = "Etiqueta de la imagen a desplegar. La CI la pasa con el SHA del commit."
  type        = string
  default     = "latest"
}

variable "db_tier" {
  description = "Tamaño de la instancia de Cloud SQL compartida por todas las escuelas."
  type        = string
  default     = "db-g1-small"
}

variable "mail_from" {
  description = "Remitente de los emails (dominio verificado en Resend)."
  type        = string
  default     = "Fertelligence <avisos@fertelligence.app>"
}

variable "ai_monthly_budget_usd" {
  description = "Tope mensual de gasto en IA por escuela."
  type        = number
  default     = 50
}

variable "configured_secrets" {
  description = "Secretos compartidos que ya tienen valor cargado (los demás no se montan y esa función queda apagada)."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for s in var.configured_secrets : contains(["GEMINI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_PICKER_API_KEY"], s)])
    error_message = "Valores posibles: GEMINI_API_KEY, RESEND_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_PICKER_API_KEY."
  }
}

# Una entrada por escuela. La clave es el identificador corto (minúsculas y guiones).
variable "schools" {
  description = "Escuelas: cada una tiene su base, su bucket y sus servicios."
  type = map(object({
    name             = string           # Nombre visible de la escuela
    domain           = optional(string) # Dominio propio (opcional); si no, la URL de Cloud Run
    admin_email      = string           # Primer administrador
    admin_first_name = optional(string, "Administración")
    admin_last_name  = optional(string, "")
  }))
  default = {}
}
