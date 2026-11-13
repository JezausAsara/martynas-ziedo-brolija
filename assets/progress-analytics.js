/* FANTASY RAMB2026 — live Progress analytics powered by public Supabase round scores. */
(function(){
"use strict";
const root=document.getElementById("progressAnalytics");
if(!root)return;
const $=id=>document.getElementById(id);
const SVG_NS="http://www.w3.org/2000/svg";
const colors=["#f4bf62","#7fc8f5","#e88686","#9cda9b","#ce9ce8","#e2c481","#64d1c4"];
const metricDefs={
  rank:{label:"Bendra lentelės pozicija",unit:"vieta",rank:true,field:"rank"},
  roundRank:{label:"Vieta atskirame ture",unit:"vieta",rank:true,field:"roundRank"},
  total:{label:"Sukaupti FPTS",unit:"FPTS",field:"total"},
  round:{label:"Kiekvieno turo FPTS",unit:"FPTS",field:"score"},
  avg:{label:"Vidutinis FPTS nuo sezono pradžios",unit:"FPTS",field:"avg"},
  rolling:{label:"Slenkantis FPTS vidurkis",unit:"FPTS",field:"rolling"},
  leaderGap:{label:"Atsilikimas nuo lyderio",unit:"FPTS",field:"leaderGap",lowerBetter:true},
  aheadGap:{label:"Iki aukščiau esančios komandos",unit:"FPTS",field:"aheadGap",lowerBetter:true},
  leagueGap:{label:"Sukauptų FPTS skirtumas nuo lygos vidurkio",unit:"FPTS",field:"leagueGap",signed:true},
  leagueRoundGap:{label:"Turo FPTS skirtumas nuo lygos vidurkio",unit:"FPTS",field:"leagueRoundGap",signed:true},
  posChange:{label:"Pozicijų pokytis po turo",unit:"vietos",field:"positionChange",signed:true},
  roundChange:{label:"Turo FPTS pokytis nuo praėjusio",unit:"FPTS",field:"roundChange",signed:true},
  roundShare:{label:"Turo FPTS dalis lygoje",unit:"%",field:"roundShare",percentage:true},
  top3Count:{label:"TOP 3 finišų skaičius (kaupiamai)",unit:"turai",field:"top3Count"},
  leaderCount:{label:"Pirmų vietų skaičius (kaupiamai)",unit:"turai",field:"leaderCount"},
  roundWinCount:{label:"Laimėtų atskirų turų skaičius",unit:"turai",field:"roundWinCount"},
  avgStreak:{label:"Turų virš lygos vidurkio serija",unit:"turai",field:"avgStreak"},
  h2hTotal:{label:"FPTS persvara prieš pasirinktą varžovą",unit:"FPTS",rival:true,signed:true},
  h2hRound:{label:"Turo FPTS prieš pasirinktą varžovą",unit:"FPTS",rival:true,signed:true},
  h2hPosition:{label:"Vietų skirtumas nuo pasirinkto varžovo",unit:"vietos",rival:true,signed:true}
};
const state={
  teams:[], rounds:[], selected:new Set(), initialized:false, loading:false,
  refreshAgain:false, liveReady:false, subscribed:false, channel:null,
  metric:"rank",from:null,to:null,rival:null,window:3,lastUpdated:null
};
const number=x=>Number(x);
const fixed=(n,d=2)=>Number(n).toFixed(d);
function fmt(value,def,axis=false){
  if(value===null||value===undefined||!Number.isFinite(value))return "—";
  if(def.rank)return axis?String(value):"#"+String(value);
  const isInteger=["posChange","top3Count","leaderCount","roundWinCount","avgStreak","h2hPosition"].includes(state.metric);
  const decimals=isInteger?0:(axis&&Math.abs(value)>=1000?0:Math.abs(value)<10?2:1);
  const v=Number(value).toFixed(decimals);
  if(axis)return v;
  const plus=def.signed&&value>0?"+":"";
  return plus+v+(def.percentage?"%":"");
}
function cell(tag,text,parent,attrs){
  const e=document.createElement(tag);
  if(text!==null&&text!==undefined)e.textContent=String(text);
  if(attrs)Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));
  if(parent)parent.appendChild(e);
  return e;
}
function svgNode(name,attrs,text,parent){
  const e=document.createElementNS(SVG_NS,name);
  if(attrs)Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));
  if(text!==undefined&&text!==null)e.textContent=String(text);
  if(parent)parent.appendChild(e);
  return e;
}
function setLive(message,ok=true){
  const node=$("pgLive");if(!node)return;
  node.textContent=message;
  node.classList.toggle("pg-offline",!ok);
}
function buildHistory(teams,scores,windowSize){
  const byRound=new Map();
  const ids=new Set(teams.map(t=>t.id));
  for(const s of scores){
    const rn=number(s.round_no),val=number(s.fpts);
    if(!Number.isInteger(rn)||rn<1||!ids.has(s.participant_id)||!Number.isFinite(val))continue;
    if(!byRound.has(rn))byRound.set(rn,new Map());
    byRound.get(rn).set(s.participant_id,val);
  }
  const totals=new Map(teams.map(t=>[t.id,0]));
  const histories=new Map(teams.map(t=>[t.id,[]]));
  const top3=new Map(teams.map(t=>[t.id,0]));
  const leaders=new Map(teams.map(t=>[t.id,0]));
  const wins=new Map(teams.map(t=>[t.id,0]));
  const streaks=new Map(teams.map(t=>[t.id,0]));
  let prevRank=new Map(), prevScore=new Map();
  const finished=[];
  for(const roundNo of [...byRound.keys()].sort((a,b)=>a-b)){
    const scoresForRound=byRound.get(roundNo);
    if(teams.some(t=>!scoresForRound.has(t.id)))continue;
    for(const t of teams){
      totals.set(t.id,Number((totals.get(t.id)+scoresForRound.get(t.id)).toFixed(2)));
      histories.get(t.id).push(scoresForRound.get(t.id));
    }
    const ordered=[...teams].sort((a,b)=>totals.get(b.id)-totals.get(a.id)||a.team_name.localeCompare(b.team_name,"lt"));
    const orderedRound=[...teams].sort((a,b)=>scoresForRound.get(b.id)-scoresForRound.get(a.id)||a.team_name.localeCompare(b.team_name,"lt"));
    const position=new Map(teams.map(t=>[t.id,1+teams.filter(x=>totals.get(x.id)>totals.get(t.id)).length]));
    const weeklyRank=new Map(teams.map(t=>[t.id,1+teams.filter(x=>scoresForRound.get(x.id)>scoresForRound.get(t.id)).length]));
    const leaderPoints=totals.get(ordered[0].id);
    const avgTotal=teams.reduce((sum,t)=>sum+totals.get(t.id),0)/teams.length;
    const roundSum=teams.reduce((sum,t)=>sum+scoresForRound.get(t.id),0);
    const avgRound=roundSum/teams.length;
    const points=new Map();
    for(const t of teams){
      const id=t.id,history=histories.get(id),score=scoresForRound.get(id),total=totals.get(id);
      const rank=position.get(id),roundRank=weeklyRank.get(id);
      if(rank<=3)top3.set(id,top3.get(id)+1);
      if(rank===1)leaders.set(id,leaders.get(id)+1);
      if(roundRank===1)wins.set(id,wins.get(id)+1);
      streaks.set(id,score>avgRound?streaks.get(id)+1:0);
      const higher=ordered.map(p=>totals.get(p.id)).filter(v=>v>total);
      const aheadGap=higher.length?Math.min(...higher)-total:0;
      const recent=history.slice(-Math.max(1,windowSize));
      points.set(id,{
        score,total,rank,roundRank,avg:total/history.length,
        rolling:recent.reduce((a,b)=>a+b,0)/recent.length,
        leaderGap:leaderPoints-total,aheadGap,
        leagueGap:total-avgTotal,leagueRoundGap:score-avgRound,
        positionChange:prevRank.has(id)?prevRank.get(id)-rank:null,
        roundChange:prevScore.has(id)?score-prevScore.get(id):null,
        roundShare:roundSum?score/roundSum*100:null,
        top3Count:top3.get(id),leaderCount:leaders.get(id),roundWinCount:wins.get(id),
        avgStreak:streaks.get(id)
      });
    }
    finished.push({roundNo,points,leaderId:ordered[0].id,leaderPoints,leagueAvg:avgTotal});
    prevRank=position;prevScore=new Map(scoresForRound);
  }
  return finished;
}
function valFor(teamId,round){
  const p=round.points.get(teamId),def=metricDefs[state.metric];
  if(!p)return null;
  if(def.rival){
    const rival=round.points.get(state.rival);
    if(!rival)return null;
    if(state.metric==="h2hTotal")return p.total-rival.total;
    if(state.metric==="h2hRound")return p.score-rival.score;
    return rival.rank-p.rank;
  }
  return p[def.field]??null;
}
function chosenRounds(){
  return state.rounds.filter(r=>r.roundNo>=state.from&&r.roundNo<=state.to);
}
function chosenTeams(){
  return state.teams.filter(t=>state.selected.has(t.id));
}
function updateFilters(){
  const allRounds=state.rounds.map(r=>r.roundNo);
  if(!allRounds.length)return;
  const min=Math.min(...allRounds),max=Math.max(...allRounds);
  const prevMax=state.to;
  if(state.from===null)state.from=min;
  if(state.to===null||state.to===state.previousLatest)state.to=max;
  state.previousLatest=max;
  if(!allRounds.includes(state.from))state.from=min;
  if(!allRounds.includes(state.to))state.to=max;
  if(state.from>state.to)state.from=state.to;
  for(const [id,value] of [["pgFrom",state.from],["pgTo",state.to]]){
    const sel=$(id);sel.replaceChildren();
    for(const n of allRounds)cell("option","T"+n,sel,{value:n});
    sel.value=String(value);
  }
  const r=$("pgRival");r.replaceChildren();
  for(const t of state.teams)cell("option",t.team_name,r,{value:t.id});
  if(!state.teams.some(t=>t.id===state.rival))state.rival=state.teams[0].id;
  r.value=state.rival;
  const select=$("pgMetric");select.value=state.metric;
  $("pgWindow").value=String(state.window);
  toggleDependentControls();
}
function toggleDependentControls(){
  const d=metricDefs[state.metric];
  $("pgWindowLabel").hidden=state.metric!=="rolling";
  $("pgRivalLabel").hidden=!d.rival;
  $("pgMetric").value=state.metric;
  root.querySelectorAll("[data-pg-preset]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.pgPreset===state.metric)));
}
function rebuildTeamButtons(){
  const box=$("pgTeams");box.replaceChildren();
  for(const [i,t] of state.teams.entries()){
    const active=state.selected.has(t.id),color=colors[i%colors.length];
    const b=cell("button",null,box,{type:"button","class":"pg-team","aria-pressed":active?"true":"false",title:t.owner_name+" · "+t.team_name});
    b.dataset.pgTeam=t.id;b.style.setProperty("--pg-team-color",color);
    cell("span","",b,{"class":"pg-swatch","aria-hidden":"true"});
    cell("span",t.team_name,b);
  }
}

function updateArchive(){
  const box=$("progressRows"),last=state.rounds[state.rounds.length-1];
  if(!box||!last)return;
  const previous=state.rounds.length>1?state.rounds[state.rounds.length-2]:null;
  const th=box.closest("table")?.querySelectorAll("thead th");
  if(th&&th.length>=7)th[2].textContent=last.roundNo+" turo FPTS";
  const title=document.querySelector("#progress .pg-archive h4");
  if(title)title.textContent="Bendra lentelė po "+last.roundNo+" turo";
  box.replaceChildren();
  const ordered=[...state.teams].sort((a,b)=>{
    const pa=last.points.get(a.id),pb=last.points.get(b.id);
    return pa.rank-pb.rank||pb.total-pa.total||a.team_name.localeCompare(b.team_name,"lt");
  });
  for(const team of ordered){
    const p=last.points.get(team.id),prev=previous?.points.get(team.id);
    const diff=prev?prev.rank-p.rank:0;
    const row=cell("tr",null,box);
    cell("td",p.rank,row,{"class":"rank"});
    const name=cell("td",null,row);
    const avatar=cell("span","",name,{"class":"avatar av-"+String(team.slug||"").replace(/[^a-z0-9_-]/gi,""),title:team.owner_name||team.team_name});
    name.appendChild(document.createTextNode(team.team_name));
    cell("td",fixed(p.score),row);
    cell("td",fixed(p.total),row);
    // Compare with the immediately higher and lower DISTICT cumulative FPTS
    // positions, not with whichever competitor has the smallest absolute gap.
    // A tie shares a rank; skip the tied teams to find the next actual position.
    const higher=[...ordered].reverse().find(t=>last.points.get(t.id).total>p.total);
    const lower=ordered.find(t=>last.points.get(t.id).total<p.total);
    const aheadGap=higher?Number((p.total-last.points.get(higher.id).total).toFixed(2)):null;
    const behindGap=lower?Number((p.total-last.points.get(lower.id).total).toFixed(2)):null;
    const higherCell=cell("td",higher?fixed(aheadGap):"—",row,{
      "class":"pg-standings-gap "+(higher?"negative":"neutral"),
      title:higher?"Iki "+higher.team_name+" trūksta "+fixed(Math.abs(aheadGap))+" FPTS":"Pirma vieta – aukštesnės pozicijos nėra"
    });
    if(higher)cell("small",higher.team_name,higherCell,{"class":"pg-gap-opponent"});
    const lowerCell=cell("td",lower?"+"+fixed(behindGap):"—",row,{
      "class":"pg-standings-gap "+(lower?"positive":"neutral"),
      title:lower?"Prieš "+lower.team_name+" pirmauja "+fixed(behindGap)+" FPTS":"Paskutinė vieta – žemesnės pozicijos nėra"
    });
    if(lower)cell("small",lower.team_name,lowerCell,{"class":"pg-gap-opponent"});
    cell("td",diff>0?"↑ +"+diff:diff<0?"↓ "+Math.abs(diff):"—",row);
  }
}
function updateKPIs(){
  const el=$("pgKpis");el.replaceChildren();
  const last=state.rounds[state.rounds.length-1];
  if(!last)return;
  const top=state.teams.find(t=>t.id===last.leaderId);
  const kpis=[
    ["UŽBAIGTI TURAI",String(state.rounds.length)+" / 38","Naujausias pilnas: T"+last.roundNo],
    ["KOMANDOS",String(state.teams.length),"Visos lygos dalyvės"],
    ["LYDERIS PO T"+last.roundNo,top?top.team_name:"—","Pagal sukauptus FPTS"],
    ["LYDERIO REZULTATAS",fixed(last.leaderPoints),"Sukaupti FPTS"]
  ];
  for(const k of kpis){
    const card=cell("div",null,el,{"class":"pg-kpi"});
    cell("label",k[0],card);cell("strong",k[1],card);cell("small",k[2],card);
  }
}
function messageFor(team,round,v){
  const def=metricDefs[state.metric];
  const rival=state.teams.find(t=>t.id===state.rival);
  const suffix=def.unit==="FPTS"?" FPTS":def.unit==="vieta"?" vieta":def.unit==="vietos"?" vietos":def.unit==="turai"?" turų":"";
  return team.team_name+" · "+round.roundNo+" turas · "+def.label+": "+fmt(v,def)+suffix+
    (def.rival&&rival?" · palyginta su "+rival.team_name:"");
}
function setInfo(team,round,v){
  const box=$("pgInfo");box.replaceChildren();
  if(!team||!round){cell("span","Užvesk pelę ant taško arba pasirink jį, kad matytum tikslų rezultatą.",box,{"class":"pg-note"});return}
  const strong=cell("strong",team.team_name+" · "+round.roundNo+" turas",box);
  const def=metricDefs[state.metric];
  cell("span"," · "+def.label+": "+fmt(v,def)+(def.unit==="FPTS"?" FPTS":def.unit==="vietos"?" vietos":def.unit==="vieta"?"":def.unit==="%"?"":" "+def.unit),box);
}
function niceTicks(vals,rank,teamCount){
  if(rank)return {min:1,max:teamCount,ticks:Array.from({length:teamCount},(_,i)=>i+1)};
  let low=vals.length?Math.min(...vals):0,high=vals.length?Math.max(...vals):1;
  if(low===high){const pad=Math.max(1,Math.abs(low)*.1);low-=pad;high+=pad}
  const raw=(high-low)/5,base=Math.pow(10,Math.floor(Math.log10(raw||1)));
  const step=[1,2,2.5,5,10].map(v=>v*base).find(v=>v>=raw)||base*10;
  low=Math.floor(low/step)*step;high=Math.ceil(high/step)*step;
  const ticks=[];for(let v=low,i=0;v<=high+step*.0001&&i<25;i++,v+=step){ticks.push(Number(v.toFixed(8)))}
  return {min:low,max:high,ticks};
}
function renderChart(){
  const box=$("pgChartScroll"),label=$("pgChartTitle"),help=$("pgChartHint");
  const teams=chosenTeams(),rounds=chosenRounds(),def=metricDefs[state.metric];
  label.textContent=def.label;help.textContent=def.rank?"1 vieta viršuje · kiekvienas turas pažymėtas":def.rival?"Skirtumas nuo pasirinkto varžovo · 0 reiškia lygybę":"Kiekvienas taškas – vieno turo rezultatas";
  box.replaceChildren();
  if(!teams.length||!rounds.length){
    cell("div",!teams.length?"Pasirink bent vieną komandą, kad matytum grafiką.":"Nėra duomenų pasirinktame intervale.",box,{"class":"pg-no-results"});
    setInfo(null,null);return;
  }
  const left=65,right=27,top=30,bottom=70,height=430,innerHeight=height-top-bottom;
  const width=Math.max(760,rounds.length*68+left+right);
  const graphWidth=width-left-right,spread=rounds.length>1?graphWidth/(rounds.length-1):0;
  const x=i=>rounds.length>1?left+spread*i:left+graphWidth/2;
  const allVals=teams.flatMap(t=>rounds.map(r=>valFor(t.id,r))).filter(v=>Number.isFinite(v));
  const scale=niceTicks(allVals,!!def.rank,state.teams.length);
  const y=value=>{
    if(def.rank)return top+(value-1)/Math.max(1,state.teams.length-1)*innerHeight;
    return top+(scale.max-value)/Math.max(.0000001,scale.max-scale.min)*innerHeight;
  };
  const chart=svgNode("svg",{viewBox:"0 0 "+width+" "+height,width,height,role:"img","aria-label":def.label+" nuo "+rounds[0].roundNo+" iki "+rounds[rounds.length-1].roundNo+" turo"},null,box);
  chart.id="pgChartSvg";chart.setAttribute("xmlns",SVG_NS);
  svgNode("title",null,def.label+" pagal turus",chart);
  svgNode("desc",null,"X ašis – visi pasirinkti turai. Y ašis – "+def.unit+". Linijos vaizduoja žaidėjų komandas.",chart);
  svgNode("rect",{x:0,y:0,width,height,fill:"#081113"},null,chart);
  for(const tick of scale.ticks){
    const py=y(tick);
    svgNode("line",{x1:left,y1:py,x2:width-right,y2:py,"class":"pg-gridline "+(tick===0?"major":""),
      stroke:tick===0?"#95835a":"#354740","stroke-width":tick===0?1.5:1,"stroke-dasharray":tick===0?"none":"3 5"},null,chart);
    svgNode("text",{x:left-11,y:py+4,"text-anchor":"end","font-size":10,"font-family":"Arial,sans-serif",fill:"#aec0b4"},fmt(tick,def,true),chart);
  }
  for(const [i,round] of rounds.entries()){
    const px=x(i);
    svgNode("line",{x1:px,y1:top,x2:px,y2:height-bottom,stroke:"#2a3d39","stroke-width":1,"stroke-dasharray":"2 8"},null,chart);
    svgNode("text",{x:px,y:height-bottom+22,"text-anchor":"middle","font-family":"Arial,sans-serif","font-size":11,fill:"#d8c18e"},"T"+round.roundNo,chart);
  }
  svgNode("text",{x:width/2,y:height-18,"text-anchor":"middle","font-family":"Arial,sans-serif","font-weight":800,"font-size":12,fill:"#dbc28c"},"FANTASY TURAI",chart);
  svgNode("text",{x:14,y:18,"font-family":"Arial,sans-serif","font-weight":800,"font-size":11,fill:"#dbc28c"},def.rank?"VIETA":def.unit.toUpperCase(),chart);
  for(const team of teams){
    const color=colors[state.teams.findIndex(t=>t.id===team.id)%colors.length];
    let d="",started=false;
    for(let i=0;i<rounds.length;i++){
      const value=valFor(team.id,rounds[i]);
      if(value===null||!Number.isFinite(value)){started=false;continue}
      d+=(started?"L":"M")+x(i).toFixed(1)+" "+y(value).toFixed(1)+" ";started=true;
    }
    if(d)svgNode("path",{d,stroke:color,"stroke-width":3,fill:"none","stroke-linejoin":"round","stroke-linecap":"round",opacity:.94},null,chart);
  }
  for(const team of teams){
    const color=colors[state.teams.findIndex(t=>t.id===team.id)%colors.length];
    for(let i=0;i<rounds.length;i++){
      const round=rounds[i],value=valFor(team.id,round);
      if(value===null||!Number.isFinite(value))continue;
      const cx=x(i),cy=y(value);
      const hit=svgNode("circle",{cx,cy,r:9,fill:color,"fill-opacity":"0.015",stroke:"none",class:"pg-point",tabindex:0,role:"button",
        "aria-label":messageFor(team,round,value)},null,chart);
      svgNode("circle",{cx,cy,r:4.5,fill:color,stroke:"#0c1312","stroke-width":1.5,"pointer-events":"none"},null,chart);
      svgNode("title",null,messageFor(team,round,value),hit);
      hit.addEventListener("pointerenter",()=>setInfo(team,round,value));
      hit.addEventListener("focus",()=>setInfo(team,round,value));
      hit.addEventListener("click",()=>setInfo(team,round,value));
      hit.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setInfo(team,round,value)}});
    }
  }
  setInfo(null,null);
}
function renderTable(){
  const parent=$("pgTable");parent.replaceChildren();
  const teams=chosenTeams(),rounds=chosenRounds(),def=metricDefs[state.metric];
  if(!teams.length||!rounds.length){cell("div","Pasirink komandas ir turų intervalą.",parent,{"class":"pg-no-results"});return}
  const table=cell("table",null,parent,{"aria-label":def.label+" – visų pasirinktų turų lentelė"});
  const head=cell("thead",null,table),tr=cell("tr",null,head);
  cell("th","Komanda",tr,{"scope":"col"});
  for(const r of rounds)cell("th","T"+r.roundNo,tr,{"scope":"col"});
  const body=cell("tbody",null,table);
  for(const team of teams){
    const i=state.teams.findIndex(t=>t.id===team.id);
    const row=cell("tr",null,body);
    const name=cell("td",null,row);
    const title=cell("span",null,name,{"class":"pg-rowname"});
    title.style.setProperty("--pg-team-color",colors[i%colors.length]);
    cell("span","",title,{"class":"pg-dot","aria-hidden":"true"});
    cell("span",team.team_name,title);
    for(const round of rounds)cell("td",fmt(valFor(team.id,round),def),row);
  }
}
function render(){
  if(!state.rounds.length)return;
  toggleDependentControls();rebuildTeamButtons();updateKPIs();updateArchive();
  renderChart();renderTable();
  $("pgTableLabel").textContent=metricDefs[state.metric].label;
  $("pgIntervalHint").textContent="Turai "+state.from+"–"+state.to+" · "+chosenTeams().length+" / "+state.teams.length+" komandos";
}
function downloadFile(name,type,content){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2500);
}
function downloadCsv(){
  const def=metricDefs[state.metric],rounds=chosenRounds(),teams=chosenTeams();
  if(!rounds.length||!teams.length)return;
  const quote=str=>'"'+String(str??"").replace(/"/g,'""')+'"';
  const lines=[["Komanda","Valdytojas",...rounds.map(r=>"T"+r.roundNo)]];
  for(const t of teams)lines.push([t.team_name,t.owner_name,...rounds.map(r=>{
    const v=valFor(t.id,r);return v===null||!Number.isFinite(v)?"":Number(v.toFixed(4));
  })]);
  downloadFile("ramb-progresas-"+state.metric+"-T"+state.from+"-T"+state.to+".csv","text/csv;charset=utf-8",
    "\ufeff"+lines.map(row=>row.map(quote).join(";")).join("\r\n"));
}
function downloadSvg(){
  const el=$("pgChartSvg");if(!el)return;
  const str=new XMLSerializer().serializeToString(el);
  downloadFile("ramb-grafikas-"+state.metric+"-T"+state.from+"-T"+state.to+".svg","image/svg+xml;charset=utf-8",str);
}
function applyDataset(teams,scores){
  const known=teams.filter(t=>t&&t.id&&t.team_name).sort((a,b)=>a.team_name.localeCompare(b.team_name,"lt"));
  if(!known.length)throw new Error("Lygos komandų nepavyko rasti.");
  const oldMax=state.rounds.length?state.rounds[state.rounds.length-1].roundNo:null;
  const wasSelected=state.initialized?new Set(state.selected):null;
  state.teams=known;
  if(!state.initialized){state.selected=new Set(known.map(t=>t.id));state.initialized=true}
  else state.selected=new Set([...wasSelected].filter(id=>known.some(t=>t.id===id)));
  state.scores=scores;
  state.rounds=buildHistory(known,scores,state.window);
  if(!state.rounds.length)throw new Error("Visų komandų pilno turo duomenų dar nėra.");
  if(state.to===oldMax)state.previousLatest=oldMax;
  updateFilters();
  render();
}
async function fetchScores(){
  const sb=window.rpgSupabase;
  if(!sb){setLive("Supabase dar nepasiekiama",false);return}
  if(state.loading){state.refreshAgain=true;return}
  state.loading=true;$("pgRefresh").disabled=true;
  try{
    const [players,scores]=await Promise.all([
      sb.from("participants").select("id,team_name,owner_name,slug").order("team_name",{ascending:true}),
      sb.from("fantasy_round_scores").select("participant_id,round_no,fpts").order("round_no",{ascending:true}).range(0,999)
    ]);
    if(players.error)throw players.error;
    if(scores.error)throw scores.error;
    applyDataset(players.data||[],scores.data||[]);
    state.lastUpdated=new Date();
    setLive(state.liveReady?"LIVE · Supabase":"Supabase · atnaujinta "+state.lastUpdated.toLocaleTimeString("lt-LT",{hour:"2-digit",minute:"2-digit"}));
    $("pgError").hidden=true;
  }catch(e){
    const msg=String(e&&e.message||"Nepavyko užkrauti duomenų.");
    $("pgError").textContent="Nepavyko nuskaityti Supabase duomenų: "+msg;
    $("pgError").hidden=false;
    setLive("Duomenys nepasiekiami",false);
    console.error("Ramb progress analytics:",e);
  }finally{
    state.loading=false;$("pgRefresh").disabled=false;
    if(state.refreshAgain){state.refreshAgain=false;fetchScores()}
  }
}
let schedule=null;
function scheduleRefresh(){
  if(schedule)clearTimeout(schedule);
  schedule=setTimeout(()=>{schedule=null;fetchScores()},400);
}
function initLive(){
  const sb=window.rpgSupabase;
  if(!sb||state.subscribed||!sb.channel)return;
  state.subscribed=true;
  try{
    state.channel=sb.channel("ramb-progress-score-updates")
      .on("postgres_changes",{event:"*",schema:"public",table:"fantasy_round_scores"},scheduleRefresh)
      .subscribe(status=>{
        state.liveReady=status==="SUBSCRIBED";
        if(state.lastUpdated)setLive(state.liveReady?"LIVE · Supabase":"Supabase · tikrinama kas 60 s",true);
      });
  }catch(e){console.warn("Realtime nepasiekiamas – liko periodinis atnaujinimas.",e)}
}
function bind(){
  $("pgMetric").addEventListener("change",e=>{state.metric=e.target.value;render()});
  $("pgFrom").addEventListener("change",e=>{state.from=number(e.target.value);if(state.from>state.to){state.to=state.from;$("pgTo").value=String(state.to)}render()});
  $("pgTo").addEventListener("change",e=>{state.to=number(e.target.value);if(state.to<state.from){state.from=state.to;$("pgFrom").value=String(state.from)}render()});
  $("pgWindow").addEventListener("change",e=>{state.window=number(e.target.value)||3;state.rounds=buildHistory(state.teams,state.scores,state.window);render()});
  $("pgRival").addEventListener("change",e=>{state.rival=e.target.value;render()});
  $("pgTeams").addEventListener("click",e=>{
    const btn=e.target.closest("[data-pg-team]");if(!btn)return;
    if(state.selected.has(btn.dataset.pgTeam))state.selected.delete(btn.dataset.pgTeam);
    else state.selected.add(btn.dataset.pgTeam);
    render();
  });
  root.querySelectorAll("[data-pg-preset]").forEach(btn=>btn.addEventListener("click",()=>{state.metric=btn.dataset.pgPreset;render()}));
  $("pgSelectAll").addEventListener("click",()=>{state.selected=new Set(state.teams.map(t=>t.id));render()});
  $("pgSelectNone").addEventListener("click",()=>{state.selected.clear();render()});
  $("pgSelectTop").addEventListener("click",()=>{
    const latest=state.rounds[state.rounds.length-1];
    state.selected=new Set(state.teams.filter(t=>latest.points.get(t.id)?.rank<=3).map(t=>t.id));render();
  });
  $("pgRefresh").addEventListener("click",fetchScores);
  $("pgExportCsv").addEventListener("click",downloadCsv);
  $("pgExportSvg").addEventListener("click",downloadSvg);
  const nav=document.querySelector("#nav button[data-tab='progress']");
  if(nav)nav.addEventListener("click",()=>{if(!state.lastUpdated||Date.now()-state.lastUpdated.getTime()>8000)fetchScores()});
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden&&root.closest(".section.active"))fetchScores();
  });
  setInterval(()=>{if(!document.hidden&&root.closest(".section.active"))fetchScores()},60000);
}
bind();
let retries=0;
(function connect(){
  if(window.rpgSupabase){initLive();fetchScores();return}
  if(++retries>50){setLive("Nepavyko prisijungti prie Supabase",false);return}
  setTimeout(connect,100);
})();
})();
