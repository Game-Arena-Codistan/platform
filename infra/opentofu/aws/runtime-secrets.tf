resource "random_password" "database_application" {
  length  = 40
  special = false
}

resource "random_password" "admin_proxy_runtime" {
  length  = 64
  special = false
}

resource "random_password" "support_delivery_runtime" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "database_application" {
  name                    = "${local.name}/database-application"
  description             = "Least-privilege Game Arena application database credential"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 7
}

resource "aws_secretsmanager_secret_version" "database_application" {
  secret_id = aws_secretsmanager_secret.database_application.id
  secret_string = jsonencode({
    username = "game_arena_app"
    password = random_password.database_application.result
  })
}

resource "aws_secretsmanager_secret" "runtime_controls" {
  name                    = "${local.name}/runtime-controls"
  description             = "Administrator identity, support delivery and retention configuration"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 7
}

resource "aws_secretsmanager_secret_version" "runtime_controls_bootstrap" {
  secret_id = aws_secretsmanager_secret.runtime_controls.id
  secret_string = jsonencode({
    admin_proxy_secret        = random_password.admin_proxy_runtime.result
    admin_identity_roles_json = "{}"
    support_delivery_endpoint = ""
    support_delivery_secret   = random_password.support_delivery_runtime.result
    legal_hold_user_ids        = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_ssm_parameter" "database_application_secret_arn" {
  name  = "${local.config_prefix}/rds-application-secret-arn"
  type  = "String"
  value = aws_secretsmanager_secret.database_application.arn
}

resource "aws_ssm_parameter" "runtime_controls_secret_arn" {
  name  = "${local.config_prefix}/runtime-controls-secret-arn"
  type  = "String"
  value = aws_secretsmanager_secret.runtime_controls.arn
}

output "database_application_secret_arn" {
  value     = aws_secretsmanager_secret.database_application.arn
  sensitive = true
}

output "runtime_controls_secret_arn" {
  value     = aws_secretsmanager_secret.runtime_controls.arn
  sensitive = true
}
