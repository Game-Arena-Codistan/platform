function number(name,fallback,{min=1}={}){const value=Number(process.env[name]??fallback);if(!Number.isFinite(value)||value<min)throw new Error(`Invalid ${name}`);return value;}
function bool(name,fallback=false){return String(process.env[name]??fallback).toLowerCase()==='true';}
function list(name,fallback=''){return String(process.env[name]??fallback).split(',').map(item=>item.trim()).filter(Boolean);}
export function loadConfig(overrides={}){
  const nodeEnv=overrides.nodeEnv??process.env.NODE_ENV??'development';
  return Object.freeze({
    nodeEnv,
    port:overrides.port??number('PORT',8081),
    publicOrigin:overrides.publicOrigin??process.env.PUBLIC_ORIGIN??'http://localhost:8080',
    allowedOrigins:overrides.allowedOrigins??list('ALLOWED_ORIGINS',process.env.PUBLIC_ORIGIN??'http://localhost:8080'),
    sessionCookieName:overrides.sessionCookieName??process.env.SESSION_COOKIE_NAME??'ga_session',
    csrfCookieName:overrides.csrfCookieName??process.env.CSRF_COOKIE_NAME??'ga_csrf',
    sessionTtlSeconds:overrides.sessionTtlSeconds??number('SESSION_TTL_SECONDS',2592000),
    sessionRotationSeconds:overrides.sessionRotationSeconds??number('SESSION_ROTATION_SECONDS',86400),
    otpTtlSeconds:overrides.otpTtlSeconds??number('OTP_TTL_SECONDS',300),
    otpResendSeconds:overrides.otpResendSeconds??number('OTP_RESEND_SECONDS',30),
    otpMaxAttempts:overrides.otpMaxAttempts??number('OTP_MAX_ATTEMPTS',5),
    otpAccountLimit:overrides.otpAccountLimit??number('OTP_ACCOUNT_LIMIT',5),
    otpIpLimit:overrides.otpIpLimit??number('OTP_IP_LIMIT',20),
    otpDeviceLimit:overrides.otpDeviceLimit??number('OTP_DEVICE_LIMIT',10),
    allowDebugOtp:overrides.allowDebugOtp??bool('ALLOW_DEBUG_OTP',nodeEnv!=='production'),
    otpProviderMode:overrides.otpProviderMode??process.env.OTP_PROVIDER_MODE??(nodeEnv==='production'?'disabled':'mock'),
    otpPrimaryName:overrides.otpPrimaryName??process.env.OTP_PRIMARY_NAME??'primary',
    otpPrimaryEndpoint:overrides.otpPrimaryEndpoint??process.env.OTP_PRIMARY_ENDPOINT??'',
    otpPrimaryApiKey:overrides.otpPrimaryApiKey??process.env.OTP_PRIMARY_API_KEY??'',
    otpSecondaryName:overrides.otpSecondaryName??process.env.OTP_SECONDARY_NAME??'secondary',
    otpSecondaryEndpoint:overrides.otpSecondaryEndpoint??process.env.OTP_SECONDARY_ENDPOINT??'',
    otpSecondaryApiKey:overrides.otpSecondaryApiKey??process.env.OTP_SECONDARY_API_KEY??'',
    jazzcashMode:overrides.jazzcashMode??process.env.JAZZCASH_MODE??'disabled',
    jazzcashWebhookSecret:overrides.jazzcashWebhookSecret??process.env.JAZZCASH_WEBHOOK_SECRET??'',
    jazzcashMerchantId:overrides.jazzcashMerchantId??process.env.JAZZCASH_MERCHANT_ID??'',
    jazzcashPassword:overrides.jazzcashPassword??process.env.JAZZCASH_PASSWORD??'',
    jazzcashIntegritySalt:overrides.jazzcashIntegritySalt??process.env.JAZZCASH_INTEGRITY_SALT??'',
    jazzcashActionUrl:overrides.jazzcashActionUrl??process.env.JAZZCASH_ACTION_URL??'',
    jazzcashReturnUrl:overrides.jazzcashReturnUrl??process.env.JAZZCASH_RETURN_URL??'',
    adminApiKeys:overrides.adminApiKeys??list('ADMIN_API_KEYS'),
    rewardDailyCap:overrides.rewardDailyCap??number('REWARD_DAILY_CAP',1000),
    highRiskAdjustmentThreshold:overrides.highRiskAdjustmentThreshold??number('HIGH_RISK_ADJUSTMENT_THRESHOLD',5000),
    retentionDays:overrides.retentionDays??number('ACCOUNT_RETENTION_DAYS',30)
  });
}
