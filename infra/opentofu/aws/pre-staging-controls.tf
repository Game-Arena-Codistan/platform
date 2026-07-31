variable "expected_aws_account_id" {
  description = "Twelve-digit AWS account ID that this environment is allowed to manage."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.expected_aws_account_id))
    error_message = "expected_aws_account_id must be a twelve-digit AWS account ID."
  }
}

variable "monthly_budget_usd" {
  description = "Monthly AWS cost budget for this environment in US dollars."
  type        = number

  validation {
    condition     = var.monthly_budget_usd >= 25 && var.monthly_budget_usd <= 100000
    error_message = "monthly_budget_usd must be between 25 and 100000."
  }
}

check "aws_account_matches_environment" {
  assert {
    condition     = data.aws_caller_identity.current.account_id == var.expected_aws_account_id
    error_message = "The authenticated AWS account does not match expected_aws_account_id."
  }
}

check "explicit_eks_version" {
  assert {
    condition     = var.kubernetes_version != null && try(can(regex("^1\\.[0-9]{2}$", var.kubernetes_version)), false)
    error_message = "kubernetes_version must be explicitly set to an approved EKS major.minor version."
  }
}

check "operated_alert_destination" {
  assert {
    condition     = var.operations_alert_email != null
    error_message = "Staging and production require an operated alert email destination."
  }
}

resource "aws_budgets_budget" "monthly" {
  count = var.operations_alert_email == null ? 0 : 1

  name         = "${local.name}-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.operations_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.operations_alert_email]
  }
}
