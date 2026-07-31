data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  name = "${var.project_name}-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)
  tags = merge(var.tags, {
    Application = "Game Arena"
    Environment = var.environment
    ManagedBy   = "OpenTofu"
    Repository  = "Game-Arena-Codistan/platform"
  })
  public_subnets = {
    for index, az in local.azs : tostring(index) => {
      az   = az
      cidr = cidrsubnet(var.vpc_cidr, 4, index)
    }
  }
  private_subnets = {
    for index, az in local.azs : tostring(index) => {
      az   = az
      cidr = cidrsubnet(var.vpc_cidr, 4, index + 8)
    }
  }
  nat_gateway_keys = var.single_nat_gateway ? ["0"] : keys(local.public_subnets)
  config_prefix    = "/${var.project_name}/${var.environment}"
}

resource "aws_kms_key" "platform" {
  description             = "Game Arena ${var.environment} platform encryption"
  deletion_window_in_days = var.environment == "production" ? 30 : 7
  enable_key_rotation     = true
}

resource "aws_kms_alias" "platform" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.platform.key_id
}

resource "aws_vpc" "platform" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${local.name}-vpc"
  }
}

resource "aws_internet_gateway" "platform" {
  vpc_id = aws_vpc.platform.id

  tags = {
    Name = "${local.name}-igw"
  }
}

resource "aws_subnet" "public" {
  for_each = local.public_subnets

  vpc_id                  = aws_vpc.platform.id
  availability_zone       = each.value.az
  cidr_block              = each.value.cidr
  map_public_ip_on_launch = true

  tags = {
    Name                                      = "${local.name}-public-${each.value.az}"
    "kubernetes.io/role/elb"                  = "1"
    "kubernetes.io/cluster/${local.name}-eks" = "shared"
  }
}

resource "aws_subnet" "private" {
  for_each = local.private_subnets

  vpc_id            = aws_vpc.platform.id
  availability_zone = each.value.az
  cidr_block        = each.value.cidr

  tags = {
    Name                                      = "${local.name}-private-${each.value.az}"
    "kubernetes.io/role/internal-elb"          = "1"
    "kubernetes.io/cluster/${local.name}-eks" = "shared"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.platform.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.platform.id
  }

  tags = {
    Name = "${local.name}-public"
  }
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  for_each = toset(local.nat_gateway_keys)
  domain   = "vpc"

  depends_on = [aws_internet_gateway.platform]

  tags = {
    Name = "${local.name}-nat-${each.key}"
  }
}

resource "aws_nat_gateway" "platform" {
  for_each = toset(local.nat_gateway_keys)

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  depends_on = [aws_internet_gateway.platform]

  tags = {
    Name = "${local.name}-nat-${each.key}"
  }
}

resource "aws_route_table" "private" {
  for_each = aws_subnet.private

  vpc_id = aws_vpc.platform.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.platform[var.single_nat_gateway ? "0" : each.key].id
  }

  tags = {
    Name = "${local.name}-private-${each.value.availability_zone}"
  }
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}

resource "aws_iam_role" "eks_cluster" {
  name = "${local.name}-eks-cluster"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_iam_role_policy_attachment" "eks_vpc_resource_controller" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSVPCResourceController"
}

resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${local.name}-eks/cluster"
  retention_in_days = var.environment == "production" ? 90 : 30
}

resource "aws_eks_cluster" "platform" {
  name     = "${local.name}-eks"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.kubernetes_version

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = false
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.platform.arn
    }
    resources = ["secrets"]
  }

  vpc_config {
    subnet_ids              = values(aws_subnet.private)[*].id
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.cluster_public_access_cidrs
  }

  depends_on = [
    aws_cloudwatch_log_group.eks,
    aws_iam_role_policy_attachment.eks_cluster,
    aws_iam_role_policy_attachment.eks_vpc_resource_controller
  ]
}

resource "aws_iam_role" "eks_nodes" {
  name = "${local.name}-eks-nodes"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_nodes_worker" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_nodes_cni" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "eks_nodes_ecr" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_eks_node_group" "platform" {
  cluster_name    = aws_eks_cluster.platform.name
  node_group_name = "platform"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = values(aws_subnet.private)[*].id
  instance_types  = var.node_instance_types
  capacity_type   = "ON_DEMAND"

  scaling_config {
    min_size     = var.node_min
    desired_size = var.node_desired
    max_size     = var.node_max
  }

  update_config {
    max_unavailable = 1
  }

  labels = {
    application = "game-arena"
    environment = var.environment
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_nodes_worker,
    aws_iam_role_policy_attachment.eks_nodes_cni,
    aws_iam_role_policy_attachment.eks_nodes_ecr
  ]
}

resource "aws_eks_access_entry" "github_deploy" {
  cluster_name  = aws_eks_cluster.platform.name
  principal_arn = var.github_deploy_role_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_deploy_admin" {
  cluster_name  = aws_eks_cluster.platform.name
  principal_arn = var.github_deploy_role_arn
  policy_arn    = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.github_deploy]
}

resource "aws_eks_addon" "vpc_cni" {
  cluster_name                = aws_eks_cluster.platform.name
  addon_name                  = "vpc-cni"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.platform]
}

resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.platform.name
  addon_name                  = "coredns"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.platform]
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name                = aws_eks_cluster.platform.name
  addon_name                  = "kube-proxy"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.platform]
}

data "tls_certificate" "eks_oidc" {
  url = aws_eks_cluster.platform.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  url             = aws_eks_cluster.platform.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks_oidc.certificates[0].sha1_fingerprint]
}

locals {
  eks_oidc_provider = replace(aws_iam_openid_connect_provider.eks.url, "https://", "")
}

resource "aws_iam_role" "load_balancer_controller" {
  name = "${local.name}-aws-load-balancer-controller"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.eks_oidc_provider}:aud" = "sts.amazonaws.com"
          "${local.eks_oidc_provider}:sub" = "system:serviceaccount:kube-system:aws-load-balancer-controller"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "load_balancer_controller" {
  name   = "${local.name}-aws-load-balancer-controller"
  policy = file("${path.module}/policies/aws-load-balancer-controller-v2.17.1.json")
}

resource "aws_iam_role_policy_attachment" "load_balancer_controller" {
  role       = aws_iam_role.load_balancer_controller.name
  policy_arn = aws_iam_policy.load_balancer_controller.arn
}

resource "aws_db_subnet_group" "platform" {
  name       = "${local.name}-postgres"
  subnet_ids = values(aws_subnet.private)[*].id
}

resource "aws_security_group" "postgres" {
  name        = "${local.name}-postgres"
  description = "PostgreSQL access from the EKS cluster security group"
  vpc_id      = aws_vpc.platform.id

  ingress {
    description     = "PostgreSQL from EKS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_eks_cluster.platform.vpc_config[0].cluster_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_parameter_group" "platform" {
  name   = "${local.name}-postgres"
  family = var.database_parameter_group_family

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }
}

resource "aws_db_instance" "platform" {
  identifier = "${local.name}-postgres"

  engine         = "postgres"
  engine_version = var.database_engine_version
  instance_class = var.database_instance_class

  db_name                       = var.database_name
  username                      = var.database_username
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.platform.arn

  allocated_storage     = var.database_allocated_storage
  max_allocated_storage = var.database_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.platform.arn

  db_subnet_group_name   = aws_db_subnet_group.platform.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  parameter_group_name   = aws_db_parameter_group.platform.name
  publicly_accessible    = false
  multi_az               = var.database_multi_az

  backup_retention_period = var.database_backup_retention_days
  backup_window           = "01:00-02:00"
  maintenance_window      = "sun:03:00-sun:04:00"

  auto_minor_version_upgrade = true
  deletion_protection        = var.database_deletion_protection
  skip_final_snapshot        = var.environment != "production"
  final_snapshot_identifier  = var.environment == "production" ? "${local.name}-final" : null
  copy_tags_to_snapshot      = true
  apply_immediately          = var.environment == "staging"

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.platform.arn
  performance_insights_retention_period = var.environment == "production" ? 31 : 7

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
}

resource "random_password" "admin_api_key" {
  length  = 48
  special = false
}

resource "random_password" "jazzcash_webhook_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "application" {
  name                    = "${local.name}/application"
  description             = "Game Arena ${var.environment} application and provider configuration"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 7
}

resource "aws_secretsmanager_secret_version" "application_bootstrap" {
  secret_id = aws_secretsmanager_secret.application.id
  secret_string = jsonencode({
    admin_api_keys          = random_password.admin_api_key.result
    otp_primary_name        = "primary"
    otp_primary_endpoint    = ""
    otp_primary_api_key     = ""
    otp_secondary_name      = "secondary"
    otp_secondary_endpoint  = ""
    otp_secondary_api_key   = ""
    jazzcash_webhook_secret = random_password.jazzcash_webhook_secret.result
    jazzcash_merchant_id    = ""
    jazzcash_password       = ""
    jazzcash_integrity_salt = ""
    jazzcash_action_url     = ""
    topup_offers_json       = "[]"
    voucher_codes_json      = "{}"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_acm_certificate" "platform" {
  domain_name               = var.public_host
  subject_alternative_names = [var.game_host]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.platform.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "platform" {
  certificate_arn         = aws_acm_certificate.platform.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

resource "aws_ecr_repository" "platform" {
  for_each = toset(["api", "web", "admin", "games"])

  name                 = "${var.project_name}/${var.environment}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.environment == "staging"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.platform.arn
  }
}

resource "aws_ecr_lifecycle_policy" "platform" {
  for_each = aws_ecr_repository.platform

  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the most recent 40 immutable images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 40
      }
      action = {
        type = "expire"
      }
    }]
  })
}

resource "aws_s3_bucket" "deployment_evidence" {
  bucket = "${local.name}-${data.aws_caller_identity.current.account_id}-deployment-evidence"
}

resource "aws_s3_bucket_versioning" "deployment_evidence" {
  bucket = aws_s3_bucket.deployment_evidence.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "deployment_evidence" {
  bucket = aws_s3_bucket.deployment_evidence.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.platform.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "deployment_evidence" {
  bucket                  = aws_s3_bucket.deployment_evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_ssm_parameter" "configuration" {
  for_each = {
    eks-cluster-name                   = aws_eks_cluster.platform.name
    aws-load-balancer-controller-role  = aws_iam_role.load_balancer_controller.arn
    aws-load-balancer-controller-chart = var.load_balancer_controller_chart_version
    rds-instance-id                    = aws_db_instance.platform.identifier
    rds-endpoint                       = aws_db_instance.platform.address
    rds-port                           = tostring(aws_db_instance.platform.port)
    rds-database                       = var.database_name
    rds-master-secret-arn              = aws_db_instance.platform.master_user_secret[0].secret_arn
    application-secret-arn             = aws_secretsmanager_secret.application.arn
    certificate-arn                    = aws_acm_certificate_validation.platform.certificate_arn
    route53-zone-id                    = var.route53_zone_id
    public-host                        = var.public_host
    game-host                          = var.game_host
    deployment-evidence-bucket         = aws_s3_bucket.deployment_evidence.id
    ecr-prefix                         = "${var.project_name}/${var.environment}"
  }

  name  = "${local.config_prefix}/${each.key}"
  type  = "String"
  value = each.value
}
