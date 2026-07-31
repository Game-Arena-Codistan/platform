output "eks_cluster_name" {
  value = aws_eks_cluster.platform.name
}

output "aws_region" {
  value = var.aws_region
}

output "configuration_prefix" {
  value = local.config_prefix
}

output "load_balancer_controller_role_arn" {
  value = aws_iam_role.load_balancer_controller.arn
}

output "rds_instance_id" {
  value = aws_db_instance.platform.identifier
}

output "rds_endpoint" {
  value = aws_db_instance.platform.address
}

output "rds_master_secret_arn" {
  value     = aws_db_instance.platform.master_user_secret[0].secret_arn
  sensitive = true
}

output "application_secret_arn" {
  value     = aws_secretsmanager_secret.application.arn
  sensitive = true
}

output "certificate_arn" {
  value = aws_acm_certificate_validation.platform.certificate_arn
}

output "ecr_repositories" {
  value = { for name, repository in aws_ecr_repository.platform : name => repository.repository_url }
}

output "deployment_evidence_bucket" {
  value = aws_s3_bucket.deployment_evidence.id
}
