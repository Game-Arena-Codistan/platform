locals {
  name = "${var.project_name}-${var.environment}"
  tags = distinct(concat(var.tags, [var.environment]))
}

data "digitalocean_kubernetes_versions" "selected" {
  version_prefix = var.kubernetes_version_prefix
}

resource "digitalocean_project" "platform" {
  name        = local.name
  description = "Game Arena ${var.environment} platform"
  purpose     = "Web Application"
  environment = title(var.environment)
}

resource "digitalocean_vpc" "platform" {
  name     = "${local.name}-vpc"
  region   = var.region
  ip_range = var.vpc_ip_range
}

resource "digitalocean_kubernetes_cluster" "platform" {
  name          = "${local.name}-doks"
  region        = var.region
  version       = data.digitalocean_kubernetes_versions.selected.latest_version
  vpc_uuid      = digitalocean_vpc.platform.id
  auto_upgrade  = true
  surge_upgrade = true
  ha            = var.environment == "production"
  tags          = local.tags

  maintenance_policy {
    day        = var.maintenance_day
    start_time = var.maintenance_start_utc
  }

  node_pool {
    name       = "platform"
    size       = var.node_size
    auto_scale = true
    min_nodes  = var.node_min
    max_nodes  = var.node_max
    tags       = local.tags
    labels = {
      application = "game-arena"
      environment = var.environment
    }
  }
}

resource "digitalocean_database_cluster" "postgres" {
  name                 = "${local.name}-postgres"
  engine               = "pg"
  version              = var.database_version
  size                 = var.database_size
  region               = var.region
  node_count           = var.database_nodes
  private_network_uuid = digitalocean_vpc.platform.id
  project_id           = digitalocean_project.platform.id
  tags                 = local.tags

  maintenance_window {
    day  = var.maintenance_day
    hour = var.maintenance_start_utc
  }

  storage_autoscale {
    enabled           = var.database_storage_autoscale
    threshold_percent = 80
    increment_gib     = 10
  }
}

resource "digitalocean_database_db" "platform" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "game_arena"
}

resource "digitalocean_database_firewall" "cluster_only" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "k8s"
    value = digitalocean_kubernetes_cluster.platform.id
  }
}

resource "digitalocean_project_resources" "platform" {
  project = digitalocean_project.platform.id
  resources = [
    digitalocean_kubernetes_cluster.platform.urn,
    digitalocean_database_cluster.postgres.urn
  ]
}
