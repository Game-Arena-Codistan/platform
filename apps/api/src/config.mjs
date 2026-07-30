function number(name,fallback){
  const value=Number(process.env[name]??fallback);
  if(!Number.isFinite(value)||value<=0)throw new Error(`Invalid ${name}`);
  return value;
}
function bool(name,fallback=false){return String(process.env[name]??fallback).toLowerCase()==='true';}
export function loadConfig(overrides={}){
  const nodeEnv=overrides.nodeEnv??process.env.NODE_ENV??'development';
  return Object.freeze({
    nodeEnv,
    port:overrides.port??number('PORT',8081),
    publicOrigin:overrides.publicOrigin??process.env.PUBLIC_ORIGIN??'http://localhost:8080',
    sessionCookieName:overrides.sessionCookieName??process.env.SESSION_COOKIE_NAME??'ga_session',
    sessionTtlSeconds:overrides.sessionTtlSeconds??number('SESSION_TTL_SECONDS',2592000),
    otpTtlSeconds:overrides.otpTtlSeconds??number('OTP_TTL_SECONDS',300),
    otpResendSeconds:overrides.otpResendSeconds??number('OTP_RESEND_SECONDS',30),
    allowDebugOtp:overrides.allowDebugOtp??bool('ALLOW_DEBUG_OTP',nodeEnv!=='production'),
    jazzcashMode:overrides.jazzcashMode??process.env.JAZZCASH_MODE??'disabled',
    jazzcashWebhookSecret:overrides.jazzcashWebhookSecret??process.env.JAZZCASH_WEBHOOK_SECRET??''
  });
}
