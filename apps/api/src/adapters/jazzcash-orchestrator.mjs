import {randomBytes} from 'node:crypto';
import {jazzCashSecureHash,verifyJazzCashSecureHash} from './jazzcash-secure-hash.mjs';

const DEFAULT_BASE='https://onlinepayments.jazzcash.com.pk';
const PATHS={
  linkWallet:'/payment-orchestrator/WalletLinkingPortal/wallet/LinkWallet',
  payViaToken:'/payment-orchestrator/api/v4/rest/payments/m-wallet',
  statusInquiry:'/payment-orchestrator/api/v2/rest/payments/status/inquiry',
  tokenInquiry:'/payment-orchestrator/payment/api/v1/mobile-tokens/inquiry',
  deleteToken:'/payment-orchestrator/payment/api/v1/mobile-tokens/delete'
};

function timestamp(date,timeZone='Asia/Karachi'){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

export function jazzCashRequestId(prefix='ReqId'){
  return `${prefix}${Date.now()}${randomBytes(3).toString('hex')}`;
}

export function jazzCashTxnRefNo(seed=''){
  const base=String(seed||'').replaceAll(/[^a-zA-Z0-9]/g,'').slice(0,12)||randomBytes(4).toString('hex');
  return `GA${base}`.slice(0,20);
}

export class JazzCashOrchestratorAdapter{
  constructor(config,{fetchImpl=globalThis.fetch}={}){
    this.mode=config.jazzcashMode;
    this.merchantId=config.jazzcashMerchantId;
    this.password=config.jazzcashPassword;
    this.integritySalt=config.jazzcashIntegritySalt;
    this.baseUrl=(config.jazzcashOrchestratorBaseUrl||DEFAULT_BASE).replace(/\/$/,'');
    this.returnUrl=config.jazzcashReturnUrl||`${config.publicOrigin.replace(/\/$/,'')}/api/v1/jazzcash/wallet/callback`;
    this.timeoutMs=Number(config.jazzcashTimeoutMs||8000);
    this.fetchImpl=fetchImpl;
  }

  assertConfigured(){
    if(this.mode==='disabled')throw Object.assign(new Error('JazzCash orchestrator is not enabled.'),{status:503,code:'payment_unavailable'});
    if(this.mode==='mock')return;
    if(!this.merchantId||!this.password||!this.integritySalt)throw Object.assign(new Error('JazzCash merchant credentials are incomplete.'),{status:503,code:'payment_configuration_required'});
  }

  signedFields(fields){
    const payload={...fields};
    payload.pp_SecureHash=jazzCashSecureHash(payload,this.integritySalt);
    return payload;
  }

  createLinkWalletForm({msisdn,requestId,returnUrl}){
    this.assertConfigured();
    const pp_RequestID=requestId||jazzCashRequestId();
    if(this.mode==='mock'){
      return{
        requestId:pp_RequestID,
        actionUrl:`${this.baseUrl}${PATHS.linkWallet}`,
        portalUrl:`${this.baseUrl}${PATHS.linkWallet}`,
        method:'POST',
        fields:{
          pp_MerchantID:this.merchantId||'mock-merchant',
          pp_Password:this.password||'mock-password',
          pp_MSISDN:msisdn,
          pp_RequestID:pp_RequestID,
          pp_ReturnURL:returnUrl||this.returnUrl,
          pp_SecureHash:'MOCKHASH'
        }
      };
    }
    const fields=this.signedFields({
      pp_MerchantID:this.merchantId,
      pp_Password:this.password,
      pp_MSISDN:msisdn,
      pp_RequestID:pp_RequestID,
      pp_ReturnURL:returnUrl||this.returnUrl
    });
    const actionUrl=`${this.baseUrl}${PATHS.linkWallet}`;
    return{requestId:pp_RequestID,actionUrl,portalUrl:actionUrl,method:'POST',fields};
  }

  verifyReturnFields(fields){
    if(this.mode==='mock')return Boolean(fields?.pp_PaymentToken||fields?.pp_ResponseCode==='000');
    return verifyJazzCashSecureHash(fields,this.integritySalt);
  }

  normalizeLinkReturn(fields={}){
    const responseCode=String(fields.pp_ResponseCode??'').trim();
    const token=String(fields.pp_PaymentToken??'').trim();
    const success=responseCode==='000'&&token.length>0;
    const alreadyLinked=/already contains an active payment token/i.test(String(fields.pp_ResponseMessage||''));
    return{
      responseCode,
      responseMessage:String(fields.pp_ResponseMessage||''),
      requestId:String(fields.pp_RequestID||''),
      msisdn:String(fields.pp_MSISDN||''),
      paymentToken:token,
      success:success||alreadyLinked&&token.length>0,
      alreadyLinked
    };
  }

  async postJson(path,fields){
    this.assertConfigured();
    if(this.mode==='mock'){
      const code=String(fields.pp_TxnRefNo||'').includes('fail')?'999':'000';
      return{pp_ResponseCode:code,pp_ResponseMessage:code==='000'?'Success':'Mock failure',pp_TxnRefNo:fields.pp_TxnRefNo,pp_Amount:fields.pp_Amount};
    }
    const body=JSON.stringify(this.signedFields(fields));
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const response=await this.fetchImpl(`${this.baseUrl}${path}`,{method:'POST',headers:{'content-type':'application/json'},body,signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Object.assign(new Error(data?.pp_ResponseMessage||`JazzCash HTTP ${response.status}`),{status:502,code:'jazzcash_upstream_error',details:data});
      if(data?.pp_SecureHash&&!verifyJazzCashSecureHash(data,this.integritySalt))throw Object.assign(new Error('JazzCash response hash is invalid.'),{status:502,code:'jazzcash_hash_invalid'});
      return data;
    }finally{clearTimeout(timer);}
  }

  async payViaToken({paymentToken,txnRefNo,amountMinor,billReference,description}){
    const now=new Date();
    const expiry=new Date(now.getTime()+3*60*60*1000);
    return this.postJson(PATHS.payViaToken,{
      pp_MerchantID:this.merchantId,
      pp_Password:this.password,
      pp_PaymentToken:paymentToken,
      pp_TxnRefNo:txnRefNo,
      pp_Amount:String(amountMinor),
      pp_BillReference:billReference,
      pp_Description:description,
      pp_TxnCurrency:'PKR',
      pp_TxnDateTime:timestamp(now),
      pp_TxnExpiryDateTime:timestamp(expiry)
    });
  }

  async statusInquiry({txnRefNo}){
    return this.postJson(PATHS.statusInquiry,{
      pp_MerchantID:this.merchantId,
      pp_Password:this.password,
      pp_TxnRefNo:txnRefNo
    });
  }

  async tokenInquiry({requestId,mobileNumber}){
    return this.postJson(PATHS.tokenInquiry,{
      pp_RequestID:requestId,
      pp_MobileNumber:mobileNumber,
      pp_MerchantID:this.merchantId,
      pp_Password:this.password
    });
  }

  async deleteToken({requestId,paymentToken}){
    return this.postJson(PATHS.deleteToken,{
      pp_RequestID:requestId,
      pp_MerchantID:this.merchantId,
      pp_Password:this.password,
      pp_PaymentToken:paymentToken
    });
  }
}

export {PATHS,DEFAULT_BASE,timestamp,jazzCashSecureHash,verifyJazzCashSecureHash};
