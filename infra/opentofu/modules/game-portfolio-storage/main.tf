data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_cloudfront_cache_policy" "optimized" { name = "Managed-CachingOptimized" }

locals {
  source_bucket_name    = "${var.name_prefix}-${var.environment}-game-source"
  artifact_bucket_name  = "${var.name_prefix}-${var.environment}-game-artifacts"
  inventory_bucket_name = "${var.name_prefix}-${var.environment}-game-inventory"
  common_tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "OpenTofu"
    System      = "GameArenaPortfolio"
  })
  artifact_read_roles = setunion(var.metadata_read_role_arns, toset([var.artifact_publish_role_arn]))
}

resource "aws_kms_key" "source" {
  description             = "Game Arena ${var.environment} source-vault encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.source_kms.json
  tags                    = merge(local.common_tags, { DataClass = "PrivateGameSource" })
}
resource "aws_kms_alias" "source" { name = "alias/${var.name_prefix}-${var.environment}-game-source"; target_key_id = aws_kms_key.source.key_id }

data "aws_iam_policy_document" "source_kms" {
  statement {
    sid       = "AccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]
    principals { type = "AWS"; identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"] }
  }
  statement {
    sid       = "SourceArchiveUse"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = ["*"]
    principals { type = "AWS"; identifiers = [var.source_archive_role_arn] }
  }
}

resource "aws_kms_key" "artifact" {
  description             = "Game Arena ${var.environment} immutable artifact encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.artifact_kms.json
  tags                    = merge(local.common_tags, { DataClass = "PublishedGameArtifact" })
}
resource "aws_kms_alias" "artifact" { name = "alias/${var.name_prefix}-${var.environment}-game-artifacts"; target_key_id = aws_kms_key.artifact.key_id }

data "aws_iam_policy_document" "artifact_kms" {
  statement {
    sid       = "AccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]
    principals { type = "AWS"; identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"] }
  }
  statement {
    sid       = "ArtifactRoles"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = ["*"]
    principals { type = "AWS"; identifiers = tolist(local.artifact_read_roles) }
  }
  statement {
    sid       = "CloudFrontArtifactDecrypt"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]
    principals { type = "Service"; identifiers = ["cloudfront.amazonaws.com"] }
    condition {
      test     = "StringLike"
      variable = "AWS:SourceArn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/*"]
    }
  }
}

resource "aws_s3_bucket" "source" {
  bucket              = local.source_bucket_name
  object_lock_enabled = true
  tags                = merge(local.common_tags, { DataClass = "PrivateGameSource" })
}
resource "aws_s3_bucket" "artifact" {
  bucket              = local.artifact_bucket_name
  object_lock_enabled = true
  tags                = merge(local.common_tags, { DataClass = "PublishedGameArtifact" })
}
resource "aws_s3_bucket" "inventory" {
  bucket = local.inventory_bucket_name
  tags   = merge(local.common_tags, { DataClass = "PortfolioInventory" })
}

resource "aws_s3_bucket_public_access_block" "source" {
  bucket                  = aws_s3_bucket.source.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_public_access_block" "artifact" {
  bucket                  = aws_s3_bucket.artifact.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_public_access_block" "inventory" {
  bucket                  = aws_s3_bucket.inventory.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "source" { bucket = aws_s3_bucket.source.id; rule { object_ownership = "BucketOwnerEnforced" } }
resource "aws_s3_bucket_ownership_controls" "artifact" { bucket = aws_s3_bucket.artifact.id; rule { object_ownership = "BucketOwnerEnforced" } }
resource "aws_s3_bucket_ownership_controls" "inventory" { bucket = aws_s3_bucket.inventory.id; rule { object_ownership = "BucketOwnerEnforced" } }

resource "aws_s3_bucket_versioning" "source" { bucket = aws_s3_bucket.source.id; versioning_configuration { status = "Enabled" } }
resource "aws_s3_bucket_versioning" "artifact" { bucket = aws_s3_bucket.artifact.id; versioning_configuration { status = "Enabled" } }
resource "aws_s3_bucket_versioning" "inventory" { bucket = aws_s3_bucket.inventory.id; versioning_configuration { status = "Enabled" } }

resource "aws_s3_bucket_server_side_encryption_configuration" "source" {
  bucket = aws_s3_bucket.source.id
  rule { bucket_key_enabled = true; apply_server_side_encryption_by_default { kms_master_key_id = aws_kms_key.source.arn; sse_algorithm = "aws:kms" } }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "artifact" {
  bucket = aws_s3_bucket.artifact.id
  rule { bucket_key_enabled = true; apply_server_side_encryption_by_default { kms_master_key_id = aws_kms_key.artifact.arn; sse_algorithm = "aws:kms" } }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "inventory" {
  bucket = aws_s3_bucket.inventory.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}

resource "aws_s3_bucket_object_lock_configuration" "source" {
  bucket = aws_s3_bucket.source.id
  rule { default_retention { mode = "GOVERNANCE"; days = var.source_retention_days } }
  depends_on = [aws_s3_bucket_versioning.source]
}
resource "aws_s3_bucket_object_lock_configuration" "artifact" {
  bucket = aws_s3_bucket.artifact.id
  rule { default_retention { mode = "GOVERNANCE"; days = var.artifact_retention_days } }
  depends_on = [aws_s3_bucket_versioning.artifact]
}

resource "aws_s3_bucket_lifecycle_configuration" "source" {
  bucket = aws_s3_bucket.source.id
  rule {
    id     = "retain-source-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_transition { noncurrent_days = var.noncurrent_glacier_days; storage_class = "GLACIER_IR" }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  depends_on = [aws_s3_bucket_versioning.source]
}
resource "aws_s3_bucket_lifecycle_configuration" "artifact" {
  bucket = aws_s3_bucket.artifact.id
  rule {
    id     = "retain-artifact-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_transition { noncurrent_days = var.noncurrent_glacier_days; storage_class = "GLACIER_IR" }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  depends_on = [aws_s3_bucket_versioning.artifact]
}
resource "aws_s3_bucket_lifecycle_configuration" "inventory" {
  bucket = aws_s3_bucket.inventory.id
  rule {
    id     = "expire-inventory"
    status = "Enabled"
    filter {}
    expiration { days = 730 }
    noncurrent_version_expiration { noncurrent_days = 90 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  depends_on = [aws_s3_bucket_versioning.inventory]
}

resource "aws_s3_bucket_inventory" "source" {
  bucket                   = aws_s3_bucket.source.id
  name                     = "source-inventory"
  included_object_versions = "All"
  schedule { frequency = "Daily" }
  destination {
    bucket { format = "Parquet"; bucket_arn = aws_s3_bucket.inventory.arn; prefix = "source"; encryption { sse_s3 {} } }
  }
  optional_fields = ["Size", "LastModifiedDate", "ETag", "StorageClass", "ObjectLockRetainUntilDate", "ObjectLockMode", "ChecksumAlgorithm"]
}
resource "aws_s3_bucket_inventory" "artifact" {
  bucket                   = aws_s3_bucket.artifact.id
  name                     = "artifact-inventory"
  included_object_versions = "All"
  schedule { frequency = "Daily" }
  destination {
    bucket { format = "Parquet"; bucket_arn = aws_s3_bucket.inventory.arn; prefix = "artifact"; encryption { sse_s3 {} } }
  }
  optional_fields = ["Size", "LastModifiedDate", "ETag", "StorageClass", "ObjectLockRetainUntilDate", "ObjectLockMode", "ChecksumAlgorithm"]
}

resource "aws_cloudfront_origin_access_control" "artifact" {
  name                              = "${var.name_prefix}-${var.environment}-game-artifacts"
  description                       = "Private Game Arena artifact origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "games" {
  name = "${var.name_prefix}-${var.environment}-game-security"
  security_headers_config {
    content_type_options { override = true }
    frame_options { frame_option = "SAMEORIGIN"; override = true }
    referrer_policy { referrer_policy = "strict-origin-when-cross-origin"; override = true }
    strict_transport_security { access_control_max_age_sec = 31536000; include_subdomains = true; preload = true; override = true }
    xss_protection { mode_block = true; protection = true; override = true }
  }
  custom_headers_config {
    items { header = "Cross-Origin-Resource-Policy"; value = "same-site"; override = true }
    items { header = "Permissions-Policy"; value = "camera=(), microphone=(), geolocation=(), payment=()"; override = true }
  }
}

resource "aws_cloudfront_distribution" "artifact" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Game Arena ${var.environment} immutable artifact delivery"
  aliases         = var.cloudfront_aliases
  price_class     = "PriceClass_200"
  http_version    = "http2and3"

  origin {
    domain_name              = aws_s3_bucket.artifact.bucket_regional_domain_name
    origin_id                = "game-artifact-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.artifact.id
  }
  default_cache_behavior {
    target_origin_id           = "game-artifact-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.games.id
  }
  restrictions { geo_restriction { restriction_type = "none" } }
  viewer_certificate {
    acm_certificate_arn            = length(var.cloudfront_aliases) > 0 ? var.acm_certificate_arn : null
    cloudfront_default_certificate = length(var.cloudfront_aliases) == 0
    ssl_support_method             = length(var.cloudfront_aliases) > 0 ? "sni-only" : null
    minimum_protocol_version       = length(var.cloudfront_aliases) > 0 ? "TLSv1.2_2021" : "TLSv1"
  }
  tags = local.common_tags
}

data "aws_iam_policy_document" "source_bucket" {
  statement {
    sid = "DenyInsecureTransport"; effect = "Deny"; actions = ["s3:*"]; resources = [aws_s3_bucket.source.arn, "${aws_s3_bucket.source.arn}/*"]
    principals { type = "*"; identifiers = ["*"] }
    condition { test = "Bool"; variable = "aws:SecureTransport"; values = ["false"] }
  }
  statement {
    sid = "ArchiveRoleBucket"; actions = ["s3:GetBucketVersioning", "s3:ListBucket", "s3:ListBucketVersions"]; resources = [aws_s3_bucket.source.arn]
    principals { type = "AWS"; identifiers = [var.source_archive_role_arn] }
  }
  statement {
    sid = "ArchiveRoleObjects"; actions = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:PutObjectRetention", "s3:GetObjectRetention", "s3:GetObjectAttributes"]; resources = ["${aws_s3_bucket.source.arn}/sources/*"]
    principals { type = "AWS"; identifiers = [var.source_archive_role_arn] }
  }
}
resource "aws_s3_bucket_policy" "source" { bucket = aws_s3_bucket.source.id; policy = data.aws_iam_policy_document.source_bucket.json }

data "aws_iam_policy_document" "artifact_bucket" {
  statement {
    sid = "DenyInsecureTransport"; effect = "Deny"; actions = ["s3:*"]; resources = [aws_s3_bucket.artifact.arn, "${aws_s3_bucket.artifact.arn}/*"]
    principals { type = "*"; identifiers = ["*"] }
    condition { test = "Bool"; variable = "aws:SecureTransport"; values = ["false"] }
  }
  statement {
    sid = "PublishRoleBucket"; actions = ["s3:GetBucketVersioning", "s3:ListBucket", "s3:ListBucketVersions"]; resources = [aws_s3_bucket.artifact.arn]
    principals { type = "AWS"; identifiers = [var.artifact_publish_role_arn] }
  }
  statement {
    sid = "PublishRoleObjects"; actions = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:PutObjectRetention", "s3:GetObjectAttributes"]; resources = ["${aws_s3_bucket.artifact.arn}/games/*"]
    principals { type = "AWS"; identifiers = [var.artifact_publish_role_arn] }
  }
  dynamic "statement" {
    for_each = length(local.artifact_read_roles) > 0 ? [1] : []
    content {
      sid = "MetadataReadRoles"; actions = ["s3:ListBucket"]; resources = [aws_s3_bucket.artifact.arn]
      principals { type = "AWS"; identifiers = tolist(local.artifact_read_roles) }
    }
  }
  dynamic "statement" {
    for_each = length(local.artifact_read_roles) > 0 ? [1] : []
    content {
      sid = "MetadataReadObjects"; actions = ["s3:GetObject", "s3:GetObjectVersion", "s3:GetObjectAttributes"]; resources = ["${aws_s3_bucket.artifact.arn}/games/*"]
      principals { type = "AWS"; identifiers = tolist(local.artifact_read_roles) }
    }
  }
  statement {
    sid = "CloudFrontRead"; actions = ["s3:GetObject"]; resources = ["${aws_s3_bucket.artifact.arn}/games/*"]
    principals { type = "Service"; identifiers = ["cloudfront.amazonaws.com"] }
    condition { test = "StringEquals"; variable = "AWS:SourceArn"; values = [aws_cloudfront_distribution.artifact.arn] }
  }
}
resource "aws_s3_bucket_policy" "artifact" { bucket = aws_s3_bucket.artifact.id; policy = data.aws_iam_policy_document.artifact_bucket.json }

data "aws_iam_policy_document" "inventory_bucket" {
  statement {
    sid = "DenyInsecureTransport"; effect = "Deny"; actions = ["s3:*"]; resources = [aws_s3_bucket.inventory.arn, "${aws_s3_bucket.inventory.arn}/*"]
    principals { type = "*"; identifiers = ["*"] }
    condition { test = "Bool"; variable = "aws:SecureTransport"; values = ["false"] }
  }
  statement {
    sid = "AllowS3Inventory"; actions = ["s3:PutObject"]; resources = ["${aws_s3_bucket.inventory.arn}/*"]
    principals { type = "Service"; identifiers = ["s3.amazonaws.com"] }
    condition { test = "StringEquals"; variable = "aws:SourceAccount"; values = [data.aws_caller_identity.current.account_id] }
    condition { test = "ArnLike"; variable = "aws:SourceArn"; values = [aws_s3_bucket.source.arn, aws_s3_bucket.artifact.arn] }
  }
}
resource "aws_s3_bucket_policy" "inventory" { bucket = aws_s3_bucket.inventory.id; policy = data.aws_iam_policy_document.inventory_bucket.json }
