output "project_id" {
  value = digitalocean_project.platform.id
}

output "vpc_id" {
  value = digitalocean_vpc.platform.id
}

output "doks_cluster_id" {
  value = digitalocean_kubernetes_cluster.platform.id
}

output "doks_cluster_name" {
  value = digitalocean_kubernetes_cluster.platform.name
}

output "doks_endpoint" {
  value     = digitalocean_kubernetes_cluster.platform.endpoint
  sensitive = true
}

output "database_cluster_id" {
  value = digitalocean_database_cluster.postgres.id
}

output "database_private_uri" {
  value       = replace(digitalocean_database_cluster.postgres.private_uri, "/defaultdb", "/${digitalocean_database_db.platform.name}")
  sensitive   = true
  description = "Store this directly as the GitHub Environment DATABASE_URL secret; never commit it."
}

output "github_environment_variables" {
  value = {
    DOKS_CLUSTER_NAME = digitalocean_kubernetes_cluster.platform.name
    DATABASE_SSL      = "true"
  }
}
