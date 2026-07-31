variable "project_name" {
  description = "Short project identifier used in resource names."
  type        = string
  default     = "game-arena"
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "aws_region" {
  description = "AWS Region for the environment."
  type        = string
}

variable "vpc_cidr" {
  description = "IPv4 CIDR for the environment VPC."
  type        = string
}

variable "availability_zone_count" {
  description = "Number of Availability Zones."
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2 && var.availability_zone_count <= 3
    error_message = "availability_zone_count must be between 2 and 3."
  }
}

variable "single_nat_gateway" {
  description = "Use one NAT gateway for all private subnets. Recommended only for staging."
  type        = bool
  default     = true
}

variable "cluster_public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint. Authentication is still required."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "kubernetes_version" {
  description = "Explicit approved EKS Kubernetes major.minor version."
  type        = string

  validation {
    condition     = can(regex("^1\\.[0-9]{2}$", var.kubernetes_version))
    error_message = "kubernetes_version must be an explicit major.minor value such as 1.34."
  }
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_min" {
  type    = number
  default = 2

  validation {
    condition     = var.node_min >= 1
    error_message = "node_min must be at least 1."
  }
}

variable "node_desired" {
  type    = number
  default = 2

  validation {
    condition     = var.node_desired >= var.node_min && var.node_desired <= var.node_max
    error_message = "node_desired must be between node_min and node_max."
  }
}

variable "node_max" {
  type    = number
  default = 4

  validation {
    condition     = var.node_max >= var.node_min
    error_message = "node_max must be greater than or equal to node_min."
  }
}

variable "github_deploy_role_arn" {
  description = "IAM role assumed by GitHub Actions for Kubernetes deployments."
  type        = string
}

variable "database_engine_version" {
  description = "RDS PostgreSQL engine major or full version."
  type        = string
  default     = "16"
}

variable "database_parameter_group_family" {
  type    = string
  default = "postgres16"
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "database_name" {
  type    = string
  default = "game_arena"
}

variable "database_username" {
  type    = string
  default = "game_arena"
}

variable "database_allocated_storage" {
  type    = number
  default = 30
}

variable "database_max_allocated_storage" {
  type    = number
  default = 200
}

variable "database_multi_az" {
  type    = bool
  default = false
}

variable "database_deletion_protection" {
  type    = bool
  default = false
}

variable "database_backup_retention_days" {
  type    = number
  default = 7
}

variable "route53_zone_id" {
  description = "Route 53 public hosted zone containing the player and game hostnames."
  type        = string
}

variable "public_host" {
  description = "Player/API hostname, without scheme."
  type        = string

  validation {
    condition     = length(var.public_host) <= 253 && can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", var.public_host))
    error_message = "public_host must be a lowercase DNS hostname without a scheme."
  }
}

variable "game_host" {
  description = "Controlled game-origin hostname, without scheme."
  type        = string

  validation {
    condition     = length(var.game_host) <= 253 && can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", var.game_host)) && var.game_host != var.public_host
    error_message = "game_host must be a distinct lowercase DNS hostname without a scheme."
  }
}

variable "load_balancer_controller_chart_version" {
  description = "Pinned Helm chart version installed by the deployment workflow."
  type        = string
  default     = "1.17.1"
}

variable "tags" {
  description = "Additional resource tags."
  type        = map(string)
  default     = {}
}
