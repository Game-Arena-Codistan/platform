resource "aws_s3_bucket" "game_artifacts" {
  bucket = "${local.name}-${data.aws_caller_identity.current.account_id}-game-artifacts"
}

resource "aws_s3_bucket_versioning" "game_artifacts" {
  bucket = aws_s3_bucket.game_artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "game_artifacts" {
  bucket = aws_s3_bucket.game_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.platform.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "game_artifacts" {
  bucket                  = aws_s3_bucket.game_artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "game_artifacts" {
  bucket = aws_s3_bucket.game_artifacts.id

  rule {
    id     = "retain-noncurrent-certified-builds"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = var.environment == "production" ? 365 : 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_cloudfront_origin_access_control" "game_artifacts" {
  name                              = "${local.name}-game-artifacts"
  description                       = "Private Game Arena game artifact access"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "cors_s3" {
  name = "Managed-CORS-S3Origin"
}

resource "aws_cloudfront_response_headers_policy" "game_artifacts" {
  name = "${local.name}-game-artifacts"

  security_headers_config {
    content_type_options {
      override = true
    }

    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Content-Security-Policy"
      override = true
      value    = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; child-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors https://${var.public_host}"
    }

    items {
      header   = "Cross-Origin-Resource-Policy"
      value    = "cross-origin"
      override = true
    }

    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=(), display-capture=()"
      override = true
    }
  }

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }

    access_control_allow_origins {
      items = ["https://${var.public_host}"]
    }

    access_control_expose_headers {
      items = ["ETag", "Content-Length"]
    }

    access_control_max_age_sec = 600
    origin_override            = true
  }
}

resource "aws_cloudfront_distribution" "game_artifacts" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Game Arena ${var.environment} immutable game artifacts"
  price_class     = "PriceClass_200"
  http_version    = "http2and3"

  origin {
    domain_name              = aws_s3_bucket.game_artifacts.bucket_regional_domain_name
    origin_id                = "game-artifacts"
    origin_access_control_id = aws_cloudfront_origin_access_control.game_artifacts.id
  }

  default_cache_behavior {
    target_origin_id           = "game-artifacts"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.cors_s3.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.game_artifacts.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  depends_on = [aws_s3_bucket_public_access_block.game_artifacts]
}

data "aws_iam_policy_document" "game_artifact_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.game_artifacts.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.game_artifacts.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "game_artifacts" {
  bucket = aws_s3_bucket.game_artifacts.id
  policy = data.aws_iam_policy_document.game_artifact_bucket.json
}

resource "aws_ssm_parameter" "game_artifact_bucket" {
  name  = "${local.config_prefix}/game-artifact-bucket"
  type  = "String"
  value = aws_s3_bucket.game_artifacts.id
}

resource "aws_ssm_parameter" "game_artifact_distribution_domain" {
  name  = "${local.config_prefix}/game-artifact-distribution-domain"
  type  = "String"
  value = aws_cloudfront_distribution.game_artifacts.domain_name
}

output "game_artifact_bucket" {
  value = aws_s3_bucket.game_artifacts.id
}

output "game_artifact_distribution_domain" {
  value = aws_cloudfront_distribution.game_artifacts.domain_name
}
