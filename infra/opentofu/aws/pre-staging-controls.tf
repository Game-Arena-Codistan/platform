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

resource "terraform_data" "deployment_guards" {
  input = {
    account_id  = var.expected_aws_account_id
    environment = var.environment
  }

  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.expected_aws_account_id
      error_message = "The authenticated AWS account does not match expected_aws_account_id."
    }

    precondition {
      condition     = var.environment != "production" || !contains(var.cluster_public_access_cidrs, "0.0.0.0/0")
      error_message = "Production EKS API access must be restricted to approved runner or egress CIDRs."
    }
  }
}

resource "aws_budgets_budget" "monthly" {
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
