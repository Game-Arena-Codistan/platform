export function processAccountRetention(store,{now=Date.now(),retentionDays=30,legalHoldUserIds=[]}={}){
  const holds=new Set(legalHoldUserIds);const cutoff=now-retentionDays*86400000;let processed=0;
  for(const user of store.users.values()){
    if(user.status!=='deletion_pending'||!user.deletionRequestedAt||user.deletionRequestedAt>cutoff||holds.has(user.id))continue;
    for(const [key,identity] of [...store.identities])if(identity.userId===user.id){store.identities.delete(key);store.usersByIdentity.delete(key);}
    for(const [hash,session] of [...store.sessions])if(session.userId===user.id)store.deleteSession(hash,'account_deleted');
    for(const [key,device] of [...store.devices])if(device.userId===user.id)store.devices.delete(key);
    for(const ticket of store.supportTickets)if(ticket.userId===user.id){ticket.userId=null;ticket.message='[deleted by account retention policy]';ticket.reference=null;}
    user.displayName='Deleted Player';user.status='deleted';user.deletedAt=now;user.updatedAt=new Date(now).toISOString();delete user.deletionRequestedAt;
    store.audit.write({actor:'system',action:'account.deletion_completed',targetType:'user',targetId:user.id,metadata:{retentionDays}});processed++;
  }
  if(processed)store.markDirty?.();return{processed,held:[...holds].length,cutoff};
}
