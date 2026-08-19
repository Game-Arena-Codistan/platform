export class MockOtpProvider{
  constructor(name='mock'){this.name=name;}
  async send({identity,code}){return{provider:this.name,messageId:`${this.name}-${Date.now()}`,channel:identity.type,accepted:true,debugCode:code};}
}
export class DisabledOtpProvider{
  constructor(name='disabled'){this.name=name;}
  async send(){throw Object.assign(new Error('OTP delivery provider is not configured.'),{code:'delivery_unavailable'});}
}
export class HttpOtpProvider{
  constructor({name,endpoint,apiKey,fetchImpl=fetch}){this.name=name;this.endpoint=endpoint;this.apiKey=apiKey;this.fetchImpl=fetchImpl;}
  async send({identity,code,templateId}){
    if(!this.endpoint||!this.apiKey)throw Object.assign(new Error(`${this.name} is not configured.`),{code:'delivery_unavailable'});
    const response=await this.fetchImpl(this.endpoint,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${this.apiKey}`},body:JSON.stringify({channel:identity.type,to:identity.value,templateId,variables:{code}}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Object.assign(new Error(`${this.name} rejected OTP delivery.`),{code:'delivery_rejected',status:response.status});const data=await response.json().catch(()=>({}));return{provider:this.name,messageId:String(data.messageId||data.id||''),channel:identity.type,accepted:true};
  }
}
export class BrevoOtpProvider{
  constructor({apiKey,senderEmail,senderName='Game Arena',smsSender,fetchImpl=fetch,emailEndpoint='https://api.brevo.com/v3/smtp/email',smsEndpoint='https://api.brevo.com/v3/transactionalSMS/send'}){
    this.name='brevo';this.apiKey=apiKey;this.senderEmail=senderEmail;this.senderName=senderName;this.smsSender=smsSender;this.fetchImpl=fetchImpl;this.emailEndpoint=emailEndpoint;this.smsEndpoint=smsEndpoint;
  }
  async request(endpoint,body){
    if(!this.apiKey)throw Object.assign(new Error('Brevo API key is not configured.'),{code:'delivery_unavailable'});
    const response=await this.fetchImpl(endpoint,{method:'POST',headers:{accept:'application/json','content-type':'application/json','api-key':this.apiKey},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Object.assign(new Error('Brevo rejected OTP delivery.'),{code:'delivery_rejected',status:response.status});
    return response.json().catch(()=>({}));
  }
  async send({identity,code}){
    if(identity.type==='email'){
      if(!this.senderEmail)throw Object.assign(new Error('Brevo sender email is not configured.'),{code:'delivery_unavailable'});
      const data=await this.request(this.emailEndpoint,{sender:{email:this.senderEmail,name:this.senderName},to:[{email:identity.value}],subject:'Your Game Arena verification code',textContent:`Your Game Arena verification code is ${code}. It expires shortly. If you did not request this code, you can ignore this message.`,tags:['game-arena-otp']});
      return{provider:this.name,messageId:String(data.messageId||''),channel:'email',accepted:true};
    }
    if(identity.type==='phone'){
      if(!this.smsSender)throw Object.assign(new Error('Brevo SMS sender is not configured.'),{code:'delivery_unavailable'});
      const data=await this.request(this.smsEndpoint,{sender:this.smsSender,recipient:identity.value,content:`Your Game Arena verification code is ${code}.`,type:'transactional',tag:'game-arena-otp'});
      return{provider:this.name,messageId:String(data.messageId||''),channel:'phone',accepted:true};
    }
    throw Object.assign(new Error(`Brevo does not support identity type ${identity.type}.`),{code:'delivery_unavailable'});
  }
}
export class OtpDeliveryRouter{
  constructor({providers=[],audit,metrics}){this.providers=providers;this.audit=audit;this.metrics=metrics;this.health=new Map();this.events=[];}
  async send(request){
    const started=Date.now();const errors=[];
    for(const provider of this.providers){
      const state=this.health.get(provider.name);if(state?.openUntil>Date.now())continue;
      try{const result=await provider.send(request);this.health.set(provider.name,{failures:0,openUntil:0});const event={at:new Date().toISOString(),provider:provider.name,channel:request.identity.type,status:'accepted',messageId:result.messageId};this.events.push(event);this.metrics?.increment('otp_delivery_total',{provider:provider.name,status:'accepted'});this.metrics?.observe('otp_delivery_duration_ms',Date.now()-started,{provider:provider.name});this.audit?.write({actor:'system',action:'otp.delivery.accepted',targetType:'identity',targetId:request.identity.type,metadata:event});return result;}catch(error){errors.push({provider:provider.name,code:error.code||'delivery_failed'});const previous=this.health.get(provider.name)||{failures:0};const failures=previous.failures+1;this.health.set(provider.name,{failures,openUntil:failures>=3?Date.now()+60000:0});this.metrics?.increment('otp_delivery_total',{provider:provider.name,status:'failed'});}
    }
    this.audit?.write({actor:'system',action:'otp.delivery.failed',targetType:'identity',targetId:request.identity.type,metadata:{providers:errors}});throw Object.assign(new Error('Verification delivery is temporarily unavailable.'),{status:503,code:'otp_delivery_unavailable'});
  }
  diagnostics(){return{providers:this.providers.map(item=>({name:item.name,...(this.health.get(item.name)||{failures:0,openUntil:0})})),recent:this.events.slice(-100)};}
}
