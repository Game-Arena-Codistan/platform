import {randomUUID} from 'node:crypto';
import {hmac,safeEqual} from '../lib/security.mjs';

function timestamp(date,timeZone='Asia/Karachi'){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}
export function jazzCashSecureHash(fields,salt){
  const values=Object.entries(fields).filter(([key,value])=>/^pp_/i.test(key)&&key!=='pp_SecureHash'&&value!==undefined&&value!==null&&String(value)!=='').sort(([a],[b])=>a.localeCompare(b,'en',{sensitivity:'case'})).map(([,value])=>String(value));
  return hmac(salt,[salt,...values].join('&')).toUpperCase();
}
export class JazzCashAdapter{
  constructor(config){this.mode=config.jazzcashMode;this.webhookSecret=config.jazzcashWebhookSecret;this.origin=config.publicOrigin;this.merchantId=config.jazzcashMerchantId;this.password=config.jazzcashPassword;this.integritySalt=config.jazzcashIntegritySalt;this.actionUrl=config.jazzcashActionUrl;this.returnUrl=config.jazzcashReturnUrl||`${config.publicOrigin}/api/v1/payments/jazzcash/return`;}
  async createCheckout({transactionId,planId,amountPkr}){
    if(this.mode==='disabled')throw Object.assign(new Error('JazzCash is not configured.'),{status:503,code:'payment_unavailable'});
    if(this.mode==='mock')return{providerReference:`JC-${randomUUID()}`,checkout:{method:'mock',redirectUrl:`${this.origin}/#/payment-return?transactionId=${encodeURIComponent(transactionId)}&status=pending`}};
    if(!this.merchantId||!this.password||!this.integritySalt||!this.actionUrl)throw Object.assign(new Error('JazzCash merchant credentials are incomplete.'),{status:503,code:'payment_configuration_required'});
    const now=new Date();const expiry=new Date(now.getTime()+3*60*60*1000);const providerReference=`GA${transactionId.replaceAll('-','').slice(0,28)}`;
    const fields={pp_Version:'1.1',pp_Language:'EN',pp_TxnType:'MWALLET',pp_MerchantID:this.merchantId,pp_SubMerchantID:'',pp_Password:this.password,pp_BankID:'',pp_ProductID:'',pp_TxnRefNo:providerReference,pp_Amount:String(Math.round(amountPkr*100)),pp_TxnCurrency:'PKR',pp_TxnDateTime:timestamp(now),pp_TxnExpiryDateTime:timestamp(expiry),pp_BillReference:transactionId,pp_Description:`Game Arena+ ${planId}`,pp_ReturnURL:this.returnUrl,pp_Frequency:'SINGLE'};
    fields.pp_SecureHash=jazzCashSecureHash(fields,this.integritySalt);return{providerReference,checkout:{method:'POST',actionUrl:this.actionUrl,fields}};
  }
  verifyFields(fields){if(!this.integritySalt||!fields?.pp_SecureHash)return false;return safeEqual(jazzCashSecureHash(fields,this.integritySalt),String(fields.pp_SecureHash).toUpperCase());}
  verifyWebhook(raw,signature,fields){if(fields?.pp_SecureHash)return this.verifyFields(fields);return Boolean(this.webhookSecret)&&safeEqual(hmac(this.webhookSecret,raw),signature??'');}
  mapStatus(fields){const code=String(fields?.pp_ResponseCode??fields?.responseCode??'');if(code==='000')return'paid';if(new Set(['055','058','062']).has(code))return'pending';return'failed';}
}
