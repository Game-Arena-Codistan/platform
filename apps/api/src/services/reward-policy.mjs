const DEFAULT={minDurationMs:1000,maxDurationMs:4*60*60*1000,maxScore:100000000,rewardCooldownMs:1000,maxCompletionsPerHour:60};
export class RewardPolicy{
  constructor({config,store,clock=()=>Date.now()}){this.config=config;this.store=store;this.clock=clock;this.rules=new Map();}
  setRule(gameId,rule){this.rules.set(gameId,{...DEFAULT,...rule});}
  validate({user,game,session,score,durationMs,clientCompletedAt,gameVersion}){
    const rule=this.rules.get(game.id)||DEFAULT;const reasons=[];const numericScore=Number(score);const numericDuration=Number(durationMs);
    if(session.status!=='active')reasons.push('session_not_active');
    if(gameVersion&&session.gameVersion&&gameVersion!==session.gameVersion)reasons.push('game_version_mismatch');
    if(!Number.isFinite(numericScore)||numericScore<0||numericScore>rule.maxScore)reasons.push('score_out_of_range');
    if(!Number.isFinite(numericDuration)||numericDuration<rule.minDurationMs||numericDuration>rule.maxDurationMs)reasons.push('duration_out_of_range');
    const elapsed=this.clock()-session.startedAt;if(numericDuration>elapsed+10000||numericDuration<Math.max(0,elapsed-60000))reasons.push('duration_clock_mismatch');
    if(clientCompletedAt&&Math.abs(this.clock()-Number(clientCompletedAt))>5*60*1000)reasons.push('client_clock_outlier');
    const recent=[...this.store.playSessions.values()].filter(item=>item.userId===user.id&&item.status==='completed'&&item.completedAt>this.clock()-3600000);if(recent.length>=rule.maxCompletionsPerHour)reasons.push('completion_rate_exceeded');
    const duplicate=this.store.scoreEvents.find(item=>item.userId===user.id&&item.gameId===game.id&&item.score===numericScore&&item.durationMs===numericDuration&&item.completedAt>this.clock()-rule.rewardCooldownMs);if(duplicate)reasons.push('duplicate_result');
    const suspicious=reasons.length>0;return{accepted:!suspicious,status:suspicious?'review':'verified',reasons,score:numericScore,durationMs:numericDuration};
  }
  reward({user,game,session,validation}){
    if(!validation.accepted)return{reward:0,decision:'review',reasons:validation.reasons};
    const entitlement=this.store.getEntitlement(user.id,this.clock());const multiplier=entitlement.tier==='premium'&&entitlement.status==='active'?2:1;const proposed=game.reward*multiplier;const startOfDay=this.clock()-this.clock()%86400000;const credited=this.store.dailyCredits(user.id,startOfDay);const remaining=Math.max(0,this.config.rewardDailyCap-credited);const reward=Math.min(proposed,remaining);if(reward<=0)return{reward:0,decision:'capped',reasons:['daily_cap_reached']};
    const entry=this.store.appendLedger({userId:user.id,amount:reward,reason:'game_completion',idempotencyKey:`play:${session.id}`,referenceType:'play_session',referenceId:session.id});return{reward:entry.amount,decision:entry.duplicate?'duplicate':'credited',reasons:[]};
  }
}
