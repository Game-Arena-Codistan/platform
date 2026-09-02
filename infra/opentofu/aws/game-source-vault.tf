resource "aws_s3_bucket" "game_sources" {
  bucket        = "${local.name}-${data.aws_caller_identity.current.account_id}-game-sources"
  force_destroy = false

  tags = merge(local.tags, {
    Name       = "${local.name}-game-sources"
    DataClass  = "source-archive"
    PublicData = "false"
  })
}

resource "aws_s3_bucket_versioning" "game_sources" {
  bucket = aws_s3_bucket.game_sources.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "game_sources" {
  bucket = aws_s3_bucket.game_sources.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.platform.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "game_sources" {
  bucket = aws_s3_bucket.game_sources.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "game_sources" {
  bucket = aws_s3_bucket.game_sources.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.game_sources]
}

resource "aws_ssm_parameter" "game_source_vault_bucket" {
  name        = "${local.config_prefix}/game-source-vault-bucket"
  description = "Private encrypted source archive bucket for Game Arena game source snapshots"
  type        = "String"
  value       = aws_s3_bucket.game_sources.id
}

output "game_source_vault_bucket" {
  description = "Private versioned S3 bucket used for source snapshot archival"
  value       = aws_s3_bucket.game_sources.id
}
