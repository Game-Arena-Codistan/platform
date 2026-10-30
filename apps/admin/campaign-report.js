const blank=value=>{const text=String(value??'');return!text||text==='unknown'||text==='none'?'':text;};
const escapeXml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** Build client CSV rows: date,view,platform,parameter,package,count */
export function campaignCsvRows(report){
  const rows=[['date','view','platform','parameter','package','count']];
  for(const item of report.detailed?.platformByParameter||[]){
    rows.push([item.date,'platform_parameter',blank(item.platform),blank(item.parameter),'',String(item.subscriptions)]);
  }
  for(const item of report.detailed?.packageByParameter||[]){
    rows.push([item.date,'package_parameter','',blank(item.parameter),blank(item.package),String(item.subscriptions)]);
  }
  for(const day of report.daily||[]){
    for(const [platform,count] of Object.entries(day.byPlatform||{}))rows.push([day.date,'platform',blank(platform),'','',String(count)]);
    for(const [pkg,count] of Object.entries(day.byPackage||{}))rows.push([day.date,'package','','',blank(pkg),String(count)]);
    for(const [parameter,count] of Object.entries(day.byParameter||{}))rows.push([day.date,'parameter','',blank(parameter),'',String(count)]);
    rows.push([day.date,'daily_total','','','',String(day.subscriptions)]);
  }
  return rows;
}

function csvEscape(value){
  const text=String(value??'');
  return/[",\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}

export function campaignCsvString(report){
  return`\uFEFF${campaignCsvRows(report).map(row=>row.map(csvEscape).join(',')).join('\r\n')}\r\n`;
}

/** SpreadsheetML workbook Excel opens as .xls — no ExcelJS dependency. */
export function campaignSpreadsheetXml(report){
  const rows=campaignCsvRows(report);
  const cells=rows.map((row,index)=>{
    const style=index===0?'Header':index%2===0?'Alt':'Normal';
    return`<Row>${row.map(cell=>`<Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`;
  }).join('');
  return`<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1f2937" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Normal"><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Alt"><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="Campaign attribution">
  <Table>${cells}</Table>
 </Worksheet>
</Workbook>`;
}

export function downloadCampaignSpreadsheet(report,preset='last30'){
  const xml=campaignSpreadsheetXml(report);
  const blob=new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=`premium-campaign-attribution-${preset||'range'}.xls`;
  document.body.append(link);link.click();link.remove();
  URL.revokeObjectURL(link.href);
}

export function renderDailyPivot(report,escape){
  const days=report.daily||[];
  if(!days.length)return'';
  const platforms=[...new Set(days.flatMap(day=>Object.keys(day.byPlatform||{})))].sort();
  const packages=[...new Set(days.flatMap(day=>Object.keys(day.byPackage||{})))].sort();
  const parameters=[...new Set(days.flatMap(day=>Object.keys(day.byParameter||{})))].sort();
  const head=`<tr><th>Date</th>${platforms.map(item=>`<th>${escape(item)}</th>`).join('')}<th>Total Subs</th>${packages.map(item=>`<th>Pkg ${escape(item)}</th>`).join('')}${parameters.map(item=>`<th>Param ${escape(item)}</th>`).join('')}</tr>`;
  const body=days.map(day=>`<tr><td>${escape(day.date)}</td>${platforms.map(item=>`<td>${escape(day.byPlatform?.[item]||0)}</td>`).join('')}<td><b>${escape(day.subscriptions)}</b></td>${packages.map(item=>`<td>${escape(day.byPackage?.[item]||0)}</td>`).join('')}${parameters.map(item=>`<td>${escape(day.byParameter?.[item]||0)}</td>`).join('')}</tr>`).join('');
  return`<div class="scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
