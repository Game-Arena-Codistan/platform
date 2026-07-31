import {hmac} from '../lib/security.mjs';

export class SupportDelivery{
  constructor({mode='disabled',endpoint='',secret='',fetchImpl=fetch}={}){this.mode=mode;this.endpoint=endpoint;this.secret=secret;this.fetch=fetchImpl;}
  async send(ticket){
    if(this.mode==='disabled')return{delivered:false,provider:'disabled'};
    if(this.mode!=='http'||!this.endpoint||!this.secret)throw Object.assign(new Error('Support delivery is not configured.'),{status:503,code:'support_delivery_unavailable'});
    const url=new URL(this.endpoint);if(url.protocol!=='https:')throw Object.assign(new Error('Support delivery endpoint must use HTTPS.'),{status:503,code:'support_delivery_unavailable'});
    const body=JSON.stringify({id:ticket.id,userId:ticket.userId,topic:ticket.topic,message:ticket.message,reference:ticket.reference,createdAt:ticket.createdAt});
    const response=await this.fetch(url,{method:'POST',headers:{'content-type':'application/json','x-game-arena-signature':hmac(this.secret,body),'x-game-arena-event':'support.ticket.created'},body,signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Object.assign(new Error('Support delivery failed.'),{status:503,code:'support_delivery_unavailable'});
    return{delivered:true,provider:'http',status:response.status};
  }
}
