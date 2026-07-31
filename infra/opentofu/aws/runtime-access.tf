resource "aws_eks_access_entry" "github_runtime" {
  count = var.github_runtime_role_arn == null ? 0 : 1

  cluster_name  = aws_eks_cluster.platform.name
  principal_arn = var.github_runtime_role_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_runtime_namespace" {
  count = var.github_runtime_role_arn == null ? 0 : 1

  cluster_name  = aws_eks_cluster.platform.name
  principal_arn = var.github_runtime_role_arn
  policy_arn    = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy"

  access_scope {
    type       = "namespace"
    namespaces = ["game-arena"]
  }

  depends_on = [aws_eks_access_entry.github_runtime]
}

resource "aws_ssm_parameter" "runtime_role_arn" {
  count = var.github_runtime_role_arn == null ? 0 : 1

  name  = "${local.config_prefix}/runtime-role-arn"
  type  = "String"
  value = var.github_runtime_role_arn
}
