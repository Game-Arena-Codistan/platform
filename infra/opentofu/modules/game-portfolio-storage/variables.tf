variable "name_prefix" {
  description = "Lowercase prefix used for globally unique portfolio resources."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{2,30}$", var.name_prefix))
    error_message = "name_prefix must be 3-31 lowercase letters, digits or hyphens."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "source_archive_role_arn" {
  description = "OIDC role allowed to archive and verify complete source packages."
  type        = string
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:role/", var.source_archive_role_arn))
    error_message = "source_archive_role_arn must be an IAM role ARN."
  }
}

variable "artifact_publish_role_arn" {
  description = "OIDC role allowed to publish scanner-approved immutable game artifacts."
  type        = string
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:role/", var.artifact_publish_role_arn))
    error_message = "artifact_publish_role_arn must be an IAM role ARN."
  }
}

variable "metadata_read_role_arns" {
  description = "Runtime or reconciliation roles allowed to read non-source artifact metadata."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for arn in var.metadata_read_role_arns : can(regex("^arn:aws:iam::[0-9]{12}:role/", arn))])
    error_message = "metadata_read_role_arns must contain IAM role ARNs."
  }
}

variable "cloudfront_aliases" {
  description = "Optional controlled game-origin aliases."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "us-east-1 ACM certificate for cloudfront_aliases."
  type        = string
  default     = ""
  validation {
    condition     = length(var.cloudfront_aliases) == 0 || can(regex("^arn:aws:acm:us-east-1:[0-9]{12}:certificate/", var.acm_certificate_arn))
    error_message = "An ACM us-east-1 certificate is required when aliases are configured."
  }
}

variable "source_retention_days" {
  description = "Default governance retention for source packages."
  type        = number
  default     = 3650
  validation {
    condition     = var.source_retention_days >= 365
    error_message = "Source retention must be at least 365 days."
  }
}

variable "artifact_retention_days" {
  description = "Default governance retention for immutable artifacts."
  type        = number
  default     = 365
  validation {
    condition     = var.artifact_retention_days >= 30
    error_message = "Artifact retention must be at least 30 days."
  }
}

variable "noncurrent_glacier_days" {
  description = "Days before noncurrent versions transition to Glacier Instant Retrieval."
  type        = number
  default     = 30
  validation {
    condition     = var.noncurrent_glacier_days >= 1
    error_message = "noncurrent_glacier_days must be positive."
  }
}

variable "tags" {
  description = "Additional resource tags."
  type        = map(string)
  default     = {}
}
