# Game Arena AWS infrastructure

This OpenTofu root module provisions one isolated Game Arena AWS environment. Create separate state and variable files for `staging` and `production`.

## Resources

- VPC, public/private subnets, NAT and routing
- encrypted EKS cluster and managed node group
- EKS access entry for the protected GitHub deployment role
- AWS Load Balancer Controller IRSA role and pinned IAM policy
- private encrypted RDS PostgreSQL with managed master password
- ACM certificate and Route 53 validation records
- immutable encrypted ECR repositories for API, web, admin and games
- Secrets Manager application/provider configuration
- SSM deployment-discovery parameters
- encrypted, versioned S3 deployment-evidence storage

## Usage

Use `.github/workflows/aws-infrastructure.yml`; do not run an unreviewed production apply from a workstation. Start from `staging.tfvars.example` or `production.tfvars.example`, encode the JSON variable file into the matching protected GitHub Environment secret `AWS_TFVARS_JSON_B64`, and configure the remote-state variables described in `docs/AWS-DEPLOYMENT.md`.

The GitHub OIDC provider, infrastructure/deployment roles and remote-state bucket are one-time account bootstrap dependencies and must exist before this root module can run.

Production requires separate IAM roles and state, Multi-AZ database configuration, deletion protection, multiple NAT gateways, protected GitHub reviewers and approved DNS names.

OpenTofu outputs and SSM values do not contain provider credentials. OTP and JazzCash credentials belong in the generated Secrets Manager application secret. JazzCash remains a fixed-duration single-charge integration.
