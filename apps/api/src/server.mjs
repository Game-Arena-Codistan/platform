import {createServer} from 'node:http';
import {loadConfig} from './config.mjs';
import {createApp} from './app.mjs';
import {createSupplementalApp} from './admin-app.mjs';
import {MemoryStore} from './adapters/memory-store.mjs';
import {JazzCashAdapter} from './adapters/jazzcash.mjs';
import {DisabledOtpProvider,HttpOtpProvider,MockOtpProvider,OtpDeliveryRouter} from './adapters/otp-delivery.mjs';
import {PaymentService} from './services/payments.mjs';
import {RewardPolicy} from './services/reward-policy.mjs';
const config=loadConfig();let store;if(config.databaseUrl){const {PostgresStore}=await import('./adapters/postgres-store.mjs');store=await PostgresStore.connect({connectionString:config.databaseUrl,ssl:config.databaseSsl});}else{if(config.requireDatabase)throw new Error('DATABASE_URL is required in production.');store=new MemoryStore();}
const providers=config.otpProviderMode==='mock'?[new MockOtpProvider()]:config.otpProviderMode==='http'?[new HttpOtpProvider({name:config.otpPrimaryName,endpoint:config.otpPrimaryEndpoint,apiKey:config.otpPrimaryApiKey}),new HttpOtpProvider({name:config.otpSecondaryName,endpoint:config.otpSecondaryEndpoint,apiKey:config.otpSecondaryApiKey})]:[new DisabledOtpProvider()];
const otpDelivery=new OtpDeliveryRouter({providers,audit:store.audit,metrics:store.metrics});const jazzcash=new JazzCashAdapter(config);const payments=new PaymentService({store,provider:jazzcash});const rewardPolicy=new RewardPolicy({config,store});const primary=createApp({config,store,jazzcash,otpDelivery,payments,rewardPolicy});const supplemental=createSupplementalApp({config,store});
const server=createServer(async(req,res)=>{try{if(await supplemental(req,res)!==false)return;await primary(req,res);}catch(error){console.error(JSON.stringify({level:'error',message:'Unhandled request error',error:error.message}));if(!res.headersSent){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'internal_error',message:'Unexpected server error.'}}));}}});
server.requestTimeout=15000;server.headersTimeout=16000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=1000;server.listen(config.port,'0.0.0.0',()=>console.log(JSON.stringify({level:'info',message:'Game Arena API listening',port:config.port,mode:config.nodeEnv,database:config.databaseUrl?'postgres':'memory',payments:config.jazzcashMode,otp:config.otpProviderMode})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await store.close?.();process.exit(0);}));
