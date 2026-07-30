import {randomUUID} from 'node:crypto';
import {hmac,safeEqual} from '../lib/security.mjs';
export class JazzCashAdapter{
  constructor(config){this.mode=config.jazzcashMode;this.secret=config.jazzcashWebhookSecret;this.origin=config.publicOrigin;}
  async createCheckout({transactionId}){
    if(this.mode==='disabled')throw Object.assign(new Error('JazzCash is not configured.'),{status:503,code:'payment_unavailable'});
    if(this.mode==='mock')return{providerReference:`JC-${randomUUID()}`,redirectUrl:`${this.origin}/#/payment-return?transactionId=${encodeURIComponent(transactionId)}&status=pending`};
    throw Object.assign(new Error('Live JazzCash adapter requires merchant credentials.'),{status:503,code:'payment_configuration_required'});
  }
  verifyWebhook(raw,signature){return Boolean(this.secret)&&safeEqual(hmac(this.secret,raw),signature??'');}
}
