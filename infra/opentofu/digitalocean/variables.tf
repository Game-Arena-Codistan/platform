variable "project_name" {
  type        = string
  description = "DigitalOcean project and resource-name prefix."
  default     = "game-arena"
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$", var.project_name))
    error_message = "project_name must be a lowercase DNS-style name between 3 and 40 characters."
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  type        = string
  description = "DigitalOcean region slug selected after checking current DOKS and database availability."
}

variable "vpc_ip_range" {
  type        = string
  description = "Private VPC CIDR."
  default     = "10.40.0.0/20"
}

variable "kubernetes_version_prefix" {
  type        = string
  description = "Kubernetes minor version prefix, for example 1.36."
  default     = "1.36."
}

variable "node_size" {
  type        = string
  description = "DOKS worker Droplet slug."
  default     = "s-2vcpu-4gb"
}

variable "node_min" {
  type        = number
  default     = 2
  validation {
    condition     = var.node_min >= 1
    error_message = "DOKS autoscaling requires at least one node."
  }
}

variable "node_max" {
  type        = number
  default     = 4
  validation {
    condition     = var.node_max >= var.node_min
    error_message = "node_max must be greater than or equal to node_min."
  }
}

variable "database_version" {
  type        = string
  description = "PostgreSQL major version supported in the selected region."
  default     = "16"
}

variable "database_size" {
  type        = string
  default     = "db-s-1vcpu-1gb"
}

variable "database_nodes" {
  type        = number
  default     = 1
  validation {
    condition     = var.database_nodes >= 1
    error_message = "database_nodes must be at least one."
  }
}

variable "database_storage_autoscale" {
  type        = bool
  default     = true
}

variable "maintenance_day" {
  type        = string
  default     = "sunday"
}

variable "maintenance_start_utc" {
  type        = string
  default     = "02:00"
}

variable "tags" {
  type        = list(string)
  default     = ["game-arena", "managed-by-opentofu"]
}
