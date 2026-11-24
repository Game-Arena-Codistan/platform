import {campaignLayouts} from './campaign-layouts.mjs';
// Minimal uncompressed ZIP / OOXML, no network dependency in the private Admin.
const enc=new TextEncoder();
const xml=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const decl='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG='http://schemas.openxmlformats.org/package/2006/relationships';
function col(index){let s='';for(let n=index+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function cell(value,row,index,style){const ref=col(index)+row;return typeof value==='number'&&Number.isFinite(value)?'<c r="'+ref+'" s="'+style+'"><v>'+value+'</v></c>':'<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';}
function worksheet(tables,report){
  const rows=[],merges=[];let row=0,maxColumns=2;
  const add=(values,style=0)=>{row++;maxColumns=Math.max(maxColumns,values.length);rows.push('<row r="'+row+'">'+values.map((value,i)=>cell(value,row,i,style)).join('')+'</row>');};
  add(['Game Arena | Campaign attribution'],1);
  add(['Timezone',report.timezone||report.timeZone||'Asia/Karachi']);
  add(['From',report.effectiveRange?.from||'']);add(['To (exclusive)',report.effectiveRange?.toExclusive||report.effectiveRange?.to||'']);
  for(const key of ['preset','aggregation','product','platform','planId','parameter','landingPage','referral','purpose','paymentStatus']){const value=report.filters?.[key];if(value)add([key,String(value)]);}
  add(['Verified subscription count',Number(report.totals?.subscriptions||0)],2);
  add(['Amount (minor units)',Number(report.totals?.amountMinor||0)]);
  for(const table of tables){
    add([]);add([table.title],1);
    if(table.groups){const heads=[];let index=0;for(const [title,width] of table.groups){heads[index]=title;for(let n=1;n<width;n++)heads[index+n]='';if(width>1)merges.push(col(index)+(row+1)+':'+col(index+width-1)+(row+1));index+=width;}add(heads,1);}
    add(table.columns,1);
    for(const [i,values] of table.rows.entries())add(values,i===table.rows.length-1?2:0);
  }
  const columns='<cols><col min="1" max="1" width="29" customWidth="1"/><col min="2" max="'+maxColumns+'" width="20" customWidth="1"/></cols>';
  return decl+'<worksheet xmlns="'+NS+'">'+columns+'<sheetData>'+rows.join('')+'</sheetData>'+(merges.length?'<mergeCells count="'+merges.length+'">'+merges.map(ref=>'<mergeCell ref="'+ref+'"/>').join('')+'</mergeCells>':'')+'</worksheet>';
}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function header(size){const bytes=new Uint8Array(size);const v=new DataView(bytes.buffer);return{bytes,u16:(p,n)=>v.setUint16(p,n,true),u32:(p,n)=>v.setUint32(p,n,true)};}
function zip(entries){const local=[],central=[];let offset=0,centralSize=0;
  for(const [path,content] of entries){const name=enc.encode(path),data=enc.encode(content),crc=crc32(data),l=header(30),c=header(46);
    l.u32(0,0x04034b50);l.u16(4,20);l.u16(6,0x800);l.u16(12,33);l.u32(14,crc);l.u32(18,data.length);l.u32(22,data.length);l.u16(26,name.length);
    c.u32(0,0x02014b50);c.u16(4,20);c.u16(6,20);c.u16(8,0x800);c.u16(14,33);c.u32(16,crc);c.u32(20,data.length);c.u32(24,data.length);c.u16(28,name.length);c.u32(42,offset);
    local.push(l.bytes,name,data);central.push(c.bytes,name);offset+=30+name.length+data.length;centralSize+=46+name.length;
  }
  const end=header(22);end.u32(0,0x06054b50);end.u16(8,entries.length);end.u16(10,entries.length);end.u32(12,centralSize);end.u32(16,offset);
  const out=new Uint8Array(offset+centralSize+22);let at=0;for(const part of [...local,...central,end.bytes]){out.set(part,at);at+=part.length;}return out;
}
export function campaignWorkbook(report,kind='all'){
  const {overview,basic,details}=campaignLayouts(report);
  const sheets=kind==='overview'?[['Date-wise overview',[overview]]]:kind==='detail'?[['Basic view',basic],['Detailed view',details]]:[['Date-wise overview',[overview]],['Basic view',basic],['Detailed view',details]];
  const entries=[
    ['[Content_Types].xml',decl+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
    ['_rels/.rels',decl+'<Relationships xmlns="'+PKG+'"><Relationship Id="rId1" Type="'+REL+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',decl+'<workbook xmlns="'+NS+'" xmlns:r="'+REL+'"><sheets>'+sheets.map(([name],i)=>'<sheet name="'+xml(name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels',decl+'<Relationships xmlns="'+PKG+'">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+REL+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="'+REL+'/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',decl+'<styleSheet xmlns="'+NS+'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173C77"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B609A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ...sheets.map(([,tables],i)=>['xl/worksheets/sheet'+(i+1)+'.xml',worksheet(tables,report)])
  ];
  return zip(entries);
}
