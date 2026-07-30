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
