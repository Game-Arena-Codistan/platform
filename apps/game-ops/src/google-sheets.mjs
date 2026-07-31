import {createSign} from 'node:crypto';

const b64url=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
function loadCredentials(){
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON||(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64?Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64,'base64').toString('utf8'):'');
  if(!raw)throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_B64 is required for private Google Sheets.');
  const credentials=JSON.parse(raw);if(!credentials.client_email||!credentials.private_key)throw new Error('Google service-account credentials are incomplete.');return credentials;
}

export async function googleAccessToken(){
  const credentials=loadCredentials();const now=Math.floor(Date.now()/1000);const header=b64url({alg:'RS256',typ:'JWT'});const claim=b64url({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const unsigned=`${header}.${claim}`;const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();const assertion=`${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));if(!response.ok||!data.access_token)throw new Error(`Google token request failed: ${data.error_description||data.error||response.status}`);return data.access_token;
}

export function cellHyperlink(cell={}){
  if(cell.hyperlink)return cell.hyperlink;
  const direct=cell.userEnteredFormat?.textFormat?.link?.uri;if(direct)return direct;
  for(const run of cell.textFormatRuns||[]){const uri=run.format?.link?.uri;if(uri)return uri;}
  const formula=cell.userEnteredValue?.formulaValue||'';const match=formula.match(/^=HYPERLINK\(\s*"([^"]+)"/i);return match?.[1]||null;
}
export function cellText(cell={}){const value=cell.userEnteredValue;if(value?.stringValue!=null)return value.stringValue;if(value?.numberValue!=null)return String(value.numberValue);if(value?.boolValue!=null)return String(value.boolValue);return cell.formattedValue||'';}
export function gridRows(spreadsheet){
  const rows=[];for(const sheet of spreadsheet.sheets||[]){for(const block of sheet.data||[]){for(const row of block.rowData||[]){rows.push((row.values||[]).map(cell=>({text:cellText(cell).trim(),link:cellHyperlink(cell)})));}}}return rows;
}

export async function readRichSheet({spreadsheetId,sheetName,startRow=1,endRow=1000,endColumn='Z'}){
  if(!/^[A-Z]+$/.test(endColumn))throw new Error('endColumn must use A1 column letters.');const token=await googleAccessToken();const range=`'${String(sheetName).replaceAll("'","''")}'!A${startRow}:${endColumn}${endRow}`;
  const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`);url.searchParams.set('includeGridData','true');url.searchParams.append('ranges',range);
  const response=await fetch(url,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Google Sheets read failed: ${data.error?.message||response.status}`);
  return gridRows(data);
}
