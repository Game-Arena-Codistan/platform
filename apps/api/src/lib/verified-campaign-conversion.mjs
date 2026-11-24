import {randomToken,sha256,safeEqual} from './security.mjs';
// Receipt is not an authentication credential and never grants an entitlement.
// It proves a specific captured membership transaction to the returning browser.
const TTL=15*60*1000;
export function issueCampaignReceipt(store,id,now=Date.now()){
  const tx=store.getTransaction(id);
  if(!tx||tx.kind!=='membership'||tx.status!=='paid'||!tx.providerReference)return null;
  const proof=randomToken(32);
  store.saveTransaction({...tx,campaignReceiptHash:sha256(proof),campaignReceiptExpiresAt:now+TTL});
  return proof;
}
export function verifiedCampaignConversion(store,{id,receipt,userId,now=Date.now()}){
  if(typeof id!=='string'||id.length>100)return null;
  const tx=store.getTransaction(id);
  if(!tx||tx.kind!=='membership'||tx.status!=='paid'||!tx.providerReference)return null;
  const owned=Boolean(userId&&tx.userId===userId);
  const validReceipt=typeof receipt==='string'&&/^[A-Za-z0-9_-]{43}$/.test(receipt)&&tx.campaignReceiptExpiresAt>now&&safeEqual(tx.campaignReceiptHash||'',sha256(receipt));
  if(!owned&&!validReceipt)return null;
  const value=Number(tx.amountPkr),currency=String(tx.currency||'');
  if(!Number.isFinite(value)||value<=0||!/^[A-Z]{3}$/.test(currency)||!tx.paidAt)return null;
  return{verified:true,transactionId:String(tx.providerReference),orderId:tx.id,planCode:tx.planId,value,currency,paidAt:tx.paidAt};
}
