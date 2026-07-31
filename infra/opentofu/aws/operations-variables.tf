variable "operations_alert_email" {
  description = "Operated email endpoint subscribed to the encrypted operations SNS topic. The subscription must be confirmed outside OpenTofu."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.operations_alert_email))
    error_message = "operations_alert_email must be a valid email address."
  }
}

variable "github_runtime_role_arn" {
  description = "GitHub OIDC role used for namespace-scoped post-deployment controls."
  type        = string

  validation {
    condition     = can(regex("^arn:[^:]+:iam::[0-9]{12}:role/.+$", var.github_runtime_role_arn))
    error_message = "github_runtime_role_arn must be a valid IAM role ARN."
  }
}

variable "waf_rate_limit_per_five_minutes" {
  description = "Maximum requests from one source IP in a five-minute WAF evaluation window."
  type        = number
  default     = 2000

  validation {
    condition     = var.waf_rate_limit_per_five_minutes >= 100 && var.waf_rate_limit_per_five_minutes <= 20000
    error_message = "waf_rate_limit_per_five_minutes must be between 100 and 20000."
  }
}

variable "waf_block_alarm_threshold" {
  description = "Blocked requests in five minutes that trigger the WAF operations alarm."
  type        = number
  default     = 500
}

variable "database_connection_alarm_threshold" {
  description = "RDS connection count that triggers the reviewed launch alarm."
  type        = number
  default     = 200
}
