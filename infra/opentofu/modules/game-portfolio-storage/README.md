# Game portfolio storage module

Creates the bounded storage and delivery layer for a 300–500-title Game Arena portfolio:

- private KMS-encrypted, versioned and object-locked source vault;
- private KMS-encrypted, versioned and object-locked immutable artifact bucket;
- private inventory bucket with daily source/artifact inventories;
- noncurrent-version Glacier Instant Retrieval transitions;
- CloudFront Origin Access Control with no public S3 access;
- source archive, artifact publish and metadata-read role boundaries;
- transport-security bucket policies and security response headers.

The module does not create GitHub OIDC roles or approve game rights. Pass the protected role ARNs created by the environment bootstrap. Source and artifact keys remain content/version addressed:

```text
sources/<engine>/<slug>/<sha256>.zip
games/<slug>/<version>/release.zip
games/<slug>/<version>/manifest.json
```

Example:

```hcl
module "game_portfolio_storage" {
  source = "./modules/game-portfolio-storage"

  name_prefix              = "game-arena-123456789012"
  environment              = "staging"
  source_archive_role_arn  = var.github_source_archive_role_arn
  artifact_publish_role_arn = var.github_game_publish_role_arn
  metadata_read_role_arns  = [var.github_runtime_role_arn]
  cloudfront_aliases       = ["games.staging.example.com"]
  acm_certificate_arn      = var.cloudfront_certificate_arn

  tags = { Application = "GameArena" }
}
```

Apply only through a reviewed environment plan. Never use personal AWS keys, public bucket ACLs or mutable `latest` artifact keys.
