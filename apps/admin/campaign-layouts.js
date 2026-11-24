// A shared table model for the Admin screens and the native workbook.
// Each dimension represents the same subscriptions, not additive totals.
const keys=(records,field)=>[...new Set(records.flatMap(row=>Object.keys(row[field]||{})))].sort();
const labels={T:'TikTok',M:'Meta',S:'Snapchat',G:'Google',D:'Direct',unknown:'Unknown'};
const label=(value,field)=>field==='byPlatform'?((Object.hasOwn(labels,value)?labels[value]:value)):value;
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const total=(rows,i)=>rows.reduce((sum,row)=>sum+number(row[i]),0);
const withTotal=(rows,width)=>[...rows,['Total',...Array.from({length:width-1},(_,i)=>total(rows,i+1))]];
export function campaignLayouts(report){
  const days=report.daily||[];
  const dims=[['Platform','byPlatform'],['Plan IDs','byPackage'],['Parameter/UTM','byParameter']].map(([title,field])=>({title,field,values:keys(days,field)}));
  const columns=['Date',...dims[0].values.map(v=>label(v,'byPlatform')),'Total Subs',...dims[1].values,...dims[2].values];
  const overviewRows=days.map(day=>[day.date,...dims[0].values.map(v=>number(day.byPlatform?.[v])),number(day.subscriptions),...dims[1].values.map(v=>number(day.byPackage?.[v])),...dims[2].values.map(v=>number(day.byParameter?.[v]))]);
  const overview={title:'Date-wise subscription overview',columns,rows:withTotal(overviewRows,columns.length),groups:[['Date',1],['Platform',dims[0].values.length+1],['Plan IDs',dims[1].values.length],['Parameter/UTM',dims[2].values.length]].filter(g=>g[1]>0)};
  const basic=dims.map(({title,field,values})=>{const cols=['Date',...values.map(v=>label(v,field)),'Total Subs'];return{title,columns:cols,rows:withTotal(days.map(day=>[day.date,...values.map(v=>number(day[field]?.[v])),number(day.subscriptions)]),cols.length)};});
  const details=[];
  for(const [field,items] of [['platform',report.detailed?.platformByParameter||[]],['package',report.detailed?.packageByParameter||[]]]){
    for(const key of [...new Set(items.map(item=>item[field]))].sort()){
      const subset=items.filter(item=>item[field]===key),params=[...new Set(subset.map(item=>item.parameter))].sort(),cols=['Date',...params,'Total Subs'];
      const dateRows=days.map(day=>{const matching=subset.filter(item=>item.date===day.date);return[day.date,...params.map(param=>matching.filter(item=>item.parameter===param).reduce((sum,item)=>sum+number(item.subscriptions),0)),matching.reduce((sum,item)=>sum+number(item.subscriptions),0)];});
      details.push({title:(field==='platform'?'Platform: '+label(key,'byPlatform'):'Plan: '+key),columns:cols,rows:withTotal(dateRows,cols.length)});
    }
  }
  return {overview,basic,details};
}
export function renderCampaignTable(table,escape){
  const group=table.groups?'<tr>'+table.groups.map(([title,width])=>'<th scope="colgroup" colspan="'+width+'">'+escape(title)+'</th>').join('')+'</tr>':'';
  return '<section class="campaign-table"><h3>'+escape(table.title)+'</h3><div class="scroll"><table><thead>'+group+'<tr>'+table.columns.map(value=>'<th scope="col">'+escape(value)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map((row,i)=>'<tr'+(i===table.rows.length-1?' class="campaign-total"':'')+'>'+row.map(value=>'<td>'+escape(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>';
}
export function renderCampaignLayouts(report,escape){
  const model=campaignLayouts(report);
  return renderCampaignTable(model.overview,escape)+'<h2>Basic View</h2>'+model.basic.map(t=>renderCampaignTable(t,escape)).join('')+'<h2>Detailed View</h2>'+(model.details.length?model.details.map(t=>renderCampaignTable(t,escape)).join(''):'<p class="empty">No detail rows for selected filters.</p>');
}
