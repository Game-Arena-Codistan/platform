from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one source fragment, found {count}")
    file.write_text(text.replace(old, new))


replace_once(
    "infra/opentofu/aws/main.tf",
    '''resource "aws_eks_access_policy_association" "github_deploy_admin" {
  cluster_name  = aws_eks_cluster.platform.name
  principal_arn = var.github_deploy_role_arn
  policy_arn    = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.github_deploy]
}''',
    '''resource "aws_eks_access_policy_association" "github_deploy_admin" {
  cluster_name  = aws_eks_cluster.platform.name
  principal_arn = var.github_deploy_role_arn
  policy_arn    = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy"

  access_scope {
    type       = "namespace"
    namespaces = ["game-arena", "kube-system"]
  }

  depends_on = [aws_eks_access_entry.github_deploy]
}''',
)

replace_once(
    "infra/opentofu/aws/main.tf",
    '''resource "random_password" "jazzcash_webhook_secret" {
  length  = 48
  special = false
}''',
    '''resource "random_password" "admin_proxy_secret" {
  length  = 64
  special = false
}

resource "random_password" "support_delivery_secret" {
  length  = 48
  special = false
}

resource "random_password" "jazzcash_webhook_secret" {
  length  = 48
  special = false
}''',
)

replace_once(
    "infra/opentofu/aws/main.tf",
    '''    admin_api_keys          = random_password.admin_api_key.result
    otp_primary_name        = "primary"''',
    '''    admin_api_keys            = random_password.admin_api_key.result
    admin_proxy_secret        = random_password.admin_proxy_secret.result
    admin_identity_roles_json = "{}"
    support_delivery_endpoint = ""
    support_delivery_secret   = random_password.support_delivery_secret.result
    legal_hold_user_ids        = ""
    otp_primary_name           = "primary"''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          ALLOW_DEBUG_OTP_INPUT: ${{ vars.ALLOW_DEBUG_OTP }}''',
    '''          ALLOW_DEBUG_OTP_INPUT: ${{ vars.ALLOW_DEBUG_OTP }}
          SUPPORT_MODE_INPUT: ${{ vars.SUPPORT_DELIVERY_MODE }}
          ALLOW_EXTERNAL_GAMES_INPUT: ${{ vars.ALLOW_EXTERNAL_GAMES }}
          COMPETITIONS_ENABLED_INPUT: ${{ vars.COMPETITIONS_ENABLED }}''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          if [ "$ENVIRONMENT_INPUT" = staging ]; then
            otp_mode="${OTP_MODE_INPUT:-mock}"
            jazzcash_mode="${JAZZCASH_MODE_INPUT:-mock}"
            debug_otp="${ALLOW_DEBUG_OTP_INPUT:-true}"
          else
            otp_mode="${OTP_MODE_INPUT:-disabled}"
            jazzcash_mode="${JAZZCASH_MODE_INPUT:-disabled}"
            debug_otp="${ALLOW_DEBUG_OTP_INPUT:-false}"
            [ "$otp_mode" = http ] || { echo 'Production requires OTP_PROVIDER_MODE=http.' >&2; exit 1; }
            [ "$jazzcash_mode" = hosted ] || { echo 'Production requires JAZZCASH_MODE=hosted.' >&2; exit 1; }
            [ "$debug_otp" = false ] || { echo 'Production cannot expose debug OTP codes.' >&2; exit 1; }
          fi''',
    '''          admin_auth_mode="signed-headers"
          competitions_enabled="${COMPETITIONS_ENABLED_INPUT:-false}"
          if [ "$ENVIRONMENT_INPUT" = staging ]; then
            otp_mode="${OTP_MODE_INPUT:-mock}"
            jazzcash_mode="${JAZZCASH_MODE_INPUT:-mock}"
            debug_otp="${ALLOW_DEBUG_OTP_INPUT:-true}"
            support_mode="${SUPPORT_MODE_INPUT:-disabled}"
            allow_external_games="${ALLOW_EXTERNAL_GAMES_INPUT:-true}"
          else
            otp_mode="${OTP_MODE_INPUT:-disabled}"
            jazzcash_mode="${JAZZCASH_MODE_INPUT:-disabled}"
            debug_otp="${ALLOW_DEBUG_OTP_INPUT:-false}"
            support_mode="${SUPPORT_MODE_INPUT:-http}"
            allow_external_games="${ALLOW_EXTERNAL_GAMES_INPUT:-false}"
            [ "$otp_mode" = http ] || { echo 'Production requires OTP_PROVIDER_MODE=http.' >&2; exit 1; }
            [ "$jazzcash_mode" = hosted ] || { echo 'Production requires JAZZCASH_MODE=hosted.' >&2; exit 1; }
            [ "$debug_otp" = false ] || { echo 'Production cannot expose debug OTP codes.' >&2; exit 1; }
            [ "$support_mode" = http ] || { echo 'Production requires SUPPORT_DELIVERY_MODE=http.' >&2; exit 1; }
            [ "$allow_external_games" = false ] || { echo 'Production cannot enable uncertified external games.' >&2; exit 1; }
            [ "$competitions_enabled" = false ] || { echo 'Production competitions remain disabled until certified.' >&2; exit 1; }
          fi''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''            echo "ALLOW_DEBUG_OTP=$debug_otp"
            echo "IMAGE_TAG=$IMAGE_TAG_INPUT"''',
    '''            echo "ALLOW_DEBUG_OTP=$debug_otp"
            echo "ADMIN_AUTH_MODE=$admin_auth_mode"
            echo "SUPPORT_DELIVERY_MODE=$support_mode"
            echo "ALLOW_EXTERNAL_GAMES=$allow_external_games"
            echo "COMPETITIONS_ENABLED=$competitions_enabled"
            echo "IMAGE_TAG=$IMAGE_TAG_INPUT"''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          admin_api_keys="$(value admin_api_keys)"
          otp_primary_name="$(value otp_primary_name)"''',
    '''          admin_api_keys="$(value admin_api_keys)"
          admin_proxy_secret="$(value admin_proxy_secret)"
          admin_identity_roles_json="$(value admin_identity_roles_json)"
          support_delivery_endpoint="$(value support_delivery_endpoint)"
          support_delivery_secret="$(value support_delivery_secret)"
          legal_hold_user_ids="$(value legal_hold_user_ids)"
          otp_primary_name="$(value otp_primary_name)"''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          test -n "$admin_api_keys"
          test -n "$jazzcash_webhook_secret"''',
    '''          test -n "$admin_proxy_secret"
          jq -e 'type == "object"' <<<"$admin_identity_roles_json" >/dev/null
          test -n "$jazzcash_webhook_secret"''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''            test -n "$otp_primary_endpoint" && test -n "$otp_primary_api_key"
            test -n "$jazzcash_merchant_id" && test -n "$jazzcash_password"''',
    '''            test -n "$otp_primary_endpoint" && test -n "$otp_primary_api_key"
            test -n "$support_delivery_endpoint" && test -n "$support_delivery_secret"
            jq -e 'length > 0' <<<"$admin_identity_roles_json" >/dev/null
            test -n "$jazzcash_merchant_id" && test -n "$jazzcash_password"''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''            case "$jazzcash_action_url" in https://*) ;; *) echo 'JazzCash action URL must use HTTPS.' >&2; exit 1 ;; esac''',
    '''            case "$jazzcash_action_url" in https://*) ;; *) echo 'JazzCash action URL must use HTTPS.' >&2; exit 1 ;; esac
            case "$support_delivery_endpoint" in https://*) ;; *) echo 'Support delivery endpoint must use HTTPS.' >&2; exit 1 ;; esac''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          for secret in "$db_user" "$db_password" "$database_url" "$admin_api_keys" \\
            "$otp_primary_api_key"''',
    '''          for secret in "$db_user" "$db_password" "$database_url" "$admin_api_keys" "$admin_proxy_secret" \\
            "$support_delivery_secret" "$otp_primary_api_key"''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          python - "$database_url" "$admin_api_keys" "$otp_primary_name" "$otp_primary_endpoint" \\''',
    '''          python - "$database_url" "$admin_api_keys" "$admin_proxy_secret" "$admin_identity_roles_json" \\
            "$support_delivery_endpoint" "$support_delivery_secret" "$legal_hold_user_ids" \\
            "$otp_primary_name" "$otp_primary_endpoint" \\''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''              "DATABASE_URL", "ADMIN_API_KEYS", "OTP_PRIMARY_NAME", "OTP_PRIMARY_ENDPOINT",''',
    '''              "DATABASE_URL", "ADMIN_API_KEYS", "ADMIN_PROXY_SECRET", "ADMIN_IDENTITY_ROLES_JSON",
              "SUPPORT_DELIVERY_ENDPOINT", "SUPPORT_DELIVERY_SECRET", "LEGAL_HOLD_USER_IDS",
              "OTP_PRIMARY_NAME", "OTP_PRIMARY_ENDPOINT",''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          chmod 600 /tmp/game-arena-runtime.env''',
    '''          chmod 600 /tmp/game-arena-runtime.env
          curl --fail --silent --show-error --location --retry 3 \\
            https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \\
            --output /tmp/rds-global-bundle.pem
          test -s /tmp/rds-global-bundle.pem
          chmod 600 /tmp/rds-global-bundle.pem''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''            --from-env-file=/tmp/game-arena-runtime.env \\
            --from-literal=DATABASE_SSL=true \\''',
    '''            --from-env-file=/tmp/game-arena-runtime.env \\
            --from-file=DATABASE_CA_PEM=/tmp/rds-global-bundle.pem \\
            --from-literal=DATABASE_SSL=true \\''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          rm -f /tmp/game-arena-runtime.env''',
    '''          rm -f /tmp/game-arena-runtime.env /tmp/rds-global-bundle.pem''',
)

replace_once(
    ".github/workflows/aws-deploy.yml",
    '''          export JAZZCASH_MODE
          export AWS_CERTIFICATE_ARN''',
    '''          export JAZZCASH_MODE
          export ADMIN_AUTH_MODE
          export SUPPORT_DELIVERY_MODE
          export ALLOW_EXTERNAL_GAMES
          export COMPETITIONS_ENABLED
          export AWS_CERTIFICATE_ARN''',
)
