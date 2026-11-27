const timeoutError=()=>Object.assign(new Error('Payment service timed out.'),{status:504,code:'payment_service_timeout'});

function preferredCheckout(env=process.env){
  const preferred=String(env.PREMIUM_PREFERRED_CHECKOUT||env.PROJECT_PREFERRED_CHECKOUT||'').trim().toLowerCase();
  if(preferred==='digisphere'||preferred==='payment_service'||preferred==='external')return 'digisphere';
  if(preferred==='diy'||preferred==='jazzcash'||preferred==='orchestrator')return 'diy';
  return '';
}

export function loadPaymentServiceSettings({env=process.env,publicOrigin='http://localhost:8080'}={}){
  const preferred=preferredCheckout(env);
  const rawMode=String(env.PAYMENT_SERVICE_MODE||'').trim().toLowerCase();
  const mode=preferred==='digisphere'?'external':(rawMode||'disabled');
  const baseUrl=String(env.PAYMENT_SERVICE_URL||env.PREMIUM_PAYMENT_SERVICE_URL||'').trim().replace(/\/$/,'');
  const apiKey=String(env.PAYMENT_SERVICE_API_KEY||env.PREMIUM_PAYMENT_SERVICE_API_KEY||'');
  const webhookSecret=String(env.PAYMENT_SERVICE_WEBHOOK_SECRET||env.PAYMENT_WEBHOOK_SECRET||'');
  const appReturnUrl=String(env.PAYMENT_SERVICE_APP_RETURN_URL||env.PAYMENT_APP_RETURN_URL||'').trim();
  const timeoutMs=Number(env.PAYMENT_SERVICE_TIMEOUT_MS||20000);
  if(!['disabled','external'].includes(mode))throw new Error('Invalid PAYMENT_SERVICE_MODE.');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw new Error('Invalid PAYMENT_SERVICE_TIMEOUT_MS.');
  if(mode==='external'){
    if(!baseUrl||!apiKey||!webhookSecret)throw new Error('PAYMENT_SERVICE_URL, PAYMENT_SERVICE_API_KEY and PAYMENT_SERVICE_WEBHOOK_SECRET are required in external payment mode.');
    const parsed=new URL(baseUrl);
    if(parsed.protocol!=='https:'&&parsed.hostname!=='localhost'&&parsed.hostname!=='127.0.0.1')throw new Error('PAYMENT_SERVICE_URL must use HTTPS outside localhost.');
    if(appReturnUrl){
      const target=new URL(appReturnUrl);
      const app=new URL(publicOrigin);
      if(target.origin!==app.origin)throw new Error('PAYMENT_SERVICE_APP_RETURN_URL must use PUBLIC_ORIGIN.');
    }
  }
  return Object.freeze({mode,preferredCheckout:preferred||(mode==='external'?'digisphere':'diy'),baseUrl,apiKey,webhookSecret,appReturnUrl,timeoutMs});
}

export class PaymentServiceClient{
  constructor({baseUrl,apiKey,timeoutMs=20000,fetchImpl=globalThis.fetch}){
    this.baseUrl=baseUrl.replace(/\/$/,'');this.apiKey=apiKey;this.timeoutMs=timeoutMs;this.fetch=fetchImpl;
  }
  async request(path,{method='GET',body}={}){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      let response;
      try{response=await this.fetch(`${this.baseUrl}${path}`,{method,signal:controller.signal,headers:{'content-type':'application/json','x-api-key':this.apiKey},...(body===undefined?{}:{body:JSON.stringify(body)})});}
      catch(error){if(error?.name==='AbortError')throw timeoutError();throw Object.assign(new Error('Payment service is unavailable.'),{status:502,code:'payment_service_unavailable'});}
      const raw=await response.text();let payload=null;
      if(raw){try{payload=JSON.parse(raw);}catch{throw Object.assign(new Error('Payment service returned an invalid response.'),{status:502,code:'payment_service_invalid_response'});}}
      if(!response.ok){const errorCode=String(payload?.error||'payment_service_error');const message=String(payload?.message||'Payment request failed.');throw Object.assign(new Error(message),{status:response.status,code:errorCode,upstream:true});}
      return payload;
    }finally{clearTimeout(timer);}
  }
  plans(){return this.request('/v1/plans');}
  linkWallet(userId,{msisdn,planCode,appReturnUrl}){return this.request('/v1/wallets/link',{method:'POST',body:{userId,msisdn,...(planCode?{planCode}:{}),...(appReturnUrl?{appReturnUrl}:{})}});}
  wallet(userId){return this.request(`/v1/wallets/${encodeURIComponent(userId)}`);}
  unlinkWallet(userId){return this.request('/v1/wallets/unlink',{method:'POST',body:{userId}});}
  status(userId){return this.request(`/v1/users/${encodeURIComponent(userId)}/status`);}
  subscribe(userId,{planCode,skipTrial=false}){return this.request('/v1/subscriptions',{method:'POST',body:{userId,planCode,skipTrial:Boolean(skipTrial)}});}
  cancelSubscription(id){return this.request(`/v1/subscriptions/${encodeURIComponent(id)}/cancel`,{method:'POST'});}
  payments(userId){return this.request(`/v1/users/${encodeURIComponent(userId)}/payments`);}
  payment(id){return this.request(`/v1/payments/${encodeURIComponent(id)}`);}
  /**
   * Merchant callback bridge: forward JazzCash wallet-return fields to Digisphere
   * without following redirects so the product can pass Location through.
   */
  async forwardWalletReturn({productId,userId,fields}){
    const query=new URLSearchParams();
    if(productId)query.set('productId',String(productId));
    if(userId)query.set('userId',String(userId));
    const path=`/v1/jazzcash/wallet-return?${query}`;
    const body=new URLSearchParams();
    for(const [key,value] of Object.entries(fields||{})){
      if(value===undefined||value===null)continue;
      body.set(key,String(value));
    }
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      let response;
      try{
        response=await this.fetch(`${this.baseUrl}${path}`,{
          method:'POST',
          signal:controller.signal,
          redirect:'manual',
          headers:{'content-type':'application/x-www-form-urlencoded','x-api-key':this.apiKey},
          body:body.toString()
        });
      }catch(error){
        if(error?.name==='AbortError')throw timeoutError();
        throw Object.assign(new Error('Payment service is unavailable.'),{status:502,code:'payment_service_unavailable'});
      }
      const location=response.headers.get('location')||'';
      const raw=await response.text();
      return{status:response.status,location,body:raw};
    }finally{clearTimeout(timer);}
  }
}
