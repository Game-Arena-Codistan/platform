data "aws_elb_service_account" "current" {}

resource "aws_s3_bucket" "access_logs" {
  bucket = "${local.name}-${data.aws_caller_identity.current.account_id}-access-logs"
}

resource "aws_s3_bucket_ownership_controls" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket                  = aws_s3_bucket.access_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    expiration {
      days = var.environment == "production" ? 365 : 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "access_logs" {
  statement {
    sid       = "AllowRegionalELBLogDelivery"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.access_logs.arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]

    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.current.arn]
    }
  }

  statement {
    sid       = "AllowModernLogDelivery"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.access_logs.arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }

  statement {
    sid       = "AllowLogDeliveryAclRead"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.access_logs.arn]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
  }
}

resource "aws_s3_bucket_policy" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  policy = data.aws_iam_policy_document.access_logs.json
}

resource "aws_wafv2_web_acl" "public" {
  name  = "${local.name}-public"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-public-waf"
    sampled_requests_enabled   = true
  }

  rule {
    name     = "AWSManagedCommon"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedKnownBadInputs"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "PerIpRateLimit"
    priority = 30

    action {
      block {}
    }

    statement {
      rate_based_statement {
        aggregate_key_type = "IP"
        limit              = var.waf_rate_limit_per_five_minutes
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }
}

resource "aws_sns_topic" "operations" {
  name              = "${local.name}-operations"
  kms_master_key_id = aws_kms_key.platform.arn
}

resource "aws_sns_topic_subscription" "operations_email" {
  count     = var.operations_alert_email == null ? 0 : 1
  topic_arn = aws_sns_topic.operations.arn
  protocol  = "email"
  endpoint  = var.operations_alert_email
}

resource "aws_cloudwatch_log_group" "application" {
  name              = "/game-arena/${var.environment}/application"
  retention_in_days = var.environment == "production" ? 90 : 30
  kms_key_id        = aws_kms_key.platform.arn
}

resource "aws_iam_role" "cloudwatch_observability" {
  name = "${local.name}-cloudwatch-observability"

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
          "${local.eks_oidc_provider}:sub" = "system:serviceaccount:amazon-cloudwatch:cloudwatch-agent"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.cloudwatch_observability.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_eks_addon" "cloudwatch_observability" {
  cluster_name             = aws_eks_cluster.platform.name
  addon_name               = "amazon-cloudwatch-observability"
  service_account_role_arn = aws_iam_role.cloudwatch_observability.arn

  configuration_values = jsonencode({
    containerLogs = {
      enabled = true
    }
  })

  depends_on = [
    aws_eks_node_group.platform,
    aws_iam_role_policy_attachment.cloudwatch_agent
  ]
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name}-rds-high-cpu"
  alarm_description   = "RDS CPU has remained above 80 percent."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.platform.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${local.name}-rds-low-storage"
  alarm_description   = "RDS free storage is below 5 GiB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.platform.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 5368709120
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.name}-rds-high-connections"
  alarm_description   = "RDS database connections exceed the reviewed launch threshold."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.platform.identifier }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.database_connection_alarm_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}

resource "aws_cloudwatch_metric_alarm" "waf_blocks" {
  alarm_name          = "${local.name}-waf-block-spike"
  alarm_description   = "WAF blocked request volume is above the reviewed threshold."
  namespace           = "AWS/WAFV2"
  metric_name         = "BlockedRequests"
  dimensions          = { WebACL = aws_wafv2_web_acl.public.name, Region = var.aws_region, Rule = "ALL" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.waf_block_alarm_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
}

resource "aws_ssm_parameter" "public_waf_arn" {
  name  = "${local.config_prefix}/public-waf-arn"
  type  = "String"
  value = aws_wafv2_web_acl.public.arn
}

resource "aws_ssm_parameter" "access_log_bucket" {
  name  = "${local.config_prefix}/access-log-bucket"
  type  = "String"
  value = aws_s3_bucket.access_logs.id
}

resource "aws_ssm_parameter" "operations_topic_arn" {
  name  = "${local.config_prefix}/operations-topic-arn"
  type  = "String"
  value = aws_sns_topic.operations.arn
}

output "public_waf_arn" {
  value = aws_wafv2_web_acl.public.arn
}

output "access_log_bucket" {
  value = aws_s3_bucket.access_logs.id
}

output "operations_topic_arn" {
  value = aws_sns_topic.operations.arn
}
