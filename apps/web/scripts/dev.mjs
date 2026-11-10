import {createServer,request as httpRequest} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const port=Number(process.env.PORT||4173);
const apiTarget=process.env.API_PROXY_TARGET||'http://127.0.0.1:8081';
const types={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json',
  '.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.ico':'image/x-icon'
};

function shouldProxy(pathname){
  return pathname==='/v1'||pathname.startsWith('/v1/')||pathname==='/api'||pathname.startsWith('/api/')||pathname==='/callback'||pathname==='/jazzcash/ipn'||pathname==='/account/jazzcash-ipn';
}

function proxyApi(req,res){
  const target=new URL(req.url,apiTarget);
  const headers={...req.headers,host:target.host};
  const upstream=httpRequest(target,{method:req.method,headers},upstreamRes=>{
    res.writeHead(upstreamRes.statusCode||502,upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error',error=>{
    res.writeHead(502,{'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:{message:`API proxy failed (${apiTarget}): ${error.message}`,code:'api_proxy_failed'}}));
  });
  req.pipe(upstream);
}

createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(shouldProxy(url.pathname)){
      proxyApi(req,res);
      return;
    }
    let path=normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if(path==='/'||!extname(path))path='/index.html';
    let file=join(root,path);
    try{await stat(file);}catch{file=join(root,'index.html');}
    const body=await readFile(file);
    res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
    res.end(body);
  }catch{
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port,()=>console.log(`Game Arena: http://localhost:${port} (API proxy → ${apiTarget})`));
