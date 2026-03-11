import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

const PRICING = {
  canape:  { label:"Canapé",  icon:"🛋️", hasFormula:true,  hasQty:false, isSurface:false, items:[{id:"1p",label:"1 place",basic:39,premium:59},{id:"23p",label:"2/3 places",basic:69,premium:89},{id:"45p",label:"4/5 places",basic:89,premium:109},{id:"67p",label:"6/7 places",basic:109,premium:129},{id:"89p",label:"8/9 places",basic:129,premium:149}]},
  chaise:  { label:"Chaises", icon:"🪑", hasFormula:true,  hasQty:true,  isSurface:false, items:[{id:"ch",label:"Par chaise",basic:10,premium:15}]},
  pouf:    { label:"Pouf",    icon:"💺", hasFormula:true,  hasQty:true,  isSurface:false, items:[{id:"pf",label:"Par pouf",basic:19,premium:29}]},
  matelas: { label:"Matelas", icon:"🛏️", hasFormula:true,  hasQty:false, isSurface:false, items:[{id:"bb",label:"Bébé",basic:29,premium:49},{id:"1p",label:"1 place",basic:49,premium:69},{id:"2p",label:"2 places",basic:69,premium:89}]},
  tapis:   { label:"Tapis",   icon:"🟫", hasFormula:false, hasQty:false, isSurface:false, items:[{id:"2m",label:"≤ 2m²",basic:49},{id:"4m",label:"≤ 4m²",basic:59},{id:"6m",label:"≤ 6m²",basic:69},{id:"8m",label:"≤ 8m²",basic:79}]},
  voiture: { label:"Voiture", icon:"🚗", hasFormula:true,  hasQty:false, isSurface:false, items:[{id:"5s",label:"5 sièges",basic:69,premium:89}]},
};

function lineUnitPrice(l) {
  if (l.type==="custom") return parseFloat(l.unitPrice)||0;
  const cat=PRICING[l.category]; if(!cat) return 0;
  const item=cat.items.find(i=>i.id===l.itemId); if(!item) return 0;
  return (l.formula==="premium"&&item.premium)?item.premium:item.basic;
}
function lineTotal(l) {
  const u=lineUnitPrice(l),cat=PRICING[l.category];
  if(l.type==="custom") return u*(parseFloat(l.qty)||1);
  if(!cat) return u;
  return (cat.hasQty||cat.isSurface)?u*(parseFloat(l.qty)||1):u;
}
function calcTotals(lines=[],adjs=[]) {
  const sub=lines.reduce((s,l)=>s+lineTotal(l),0);
  const adj=adjs.reduce((s,a)=>{const v=parseFloat(a.amount)||0;return a.isDiscount?s-v:s+v;},0);
  return {subtotal:sub,adjTotal:adj,total:Math.max(0,sub+adj)};
}
function lineLabel(l) {
  if(l.type==="custom") return l.label||"Personnalisé";
  const cat=PRICING[l.category]; if(!cat) return "";
  const item=cat.items.find(i=>i.id===l.itemId); if(!item) return cat.label;
  const f=cat.hasFormula?(l.formula==="premium"?" Premium":" Basique"):"";
  const q=cat.isSurface?` — ${l.qty}m²`:(cat.hasQty&&l.qty>1?` ×${l.qty}`:"");
  return `${cat.label} ${item.label}${f}${q}`;
}
function rdvSummary(lines=[]) {
  if(!lines.length) return "";
  if(lines.length===1) return lineLabel(lines[0]);
  return `${lineLabel(lines[0])} +${lines.length-1}`;
}
function newId(){return Math.random().toString(36).slice(2,9);}
function fmt(n){return `${Math.round(n||0)}€`;}
function getMon(d){
  const dt=new Date(d);dt.setHours(0,0,0,0);
  const dow=dt.getDay();
  dt.setDate(dt.getDate()+(dow===0?-6:1-dow));
  return dt;
}
function weekDates(mon){
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
function dk(d){return d.toISOString().split("T")[0];}
function fmtShort(d){return d.toLocaleDateString("fr-BE",{day:"numeric",month:"short"});}
function dayIndex(d){const dow=d.getDay();return dow===0?6:dow-1;}

const DAYS_SHORT=["LUN","MAR","MER","JEU","VEN","SAM","DIM"];
const DAYS_FULL=["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const MONTHS_FR=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MONTHS_S=["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];
const SLOTS=[
  {id:"matin",time:"10:00",end:"13:00",color:"#3b82f6",light:"#eff6ff",border:"#bfdbfe",dot:"#3b82f6"},
  {id:"midi", time:"13:00",end:"15:00",color:"#10b981",light:"#f0fdf4",border:"#bbf7d0",dot:"#10b981"},
  {id:"soir", time:"15:00",end:"17:00",color:"#f59e0b",light:"#fffbeb",border:"#fde68a",dot:"#f59e0b"},
];
const STATUS_CFG={
  confirmed:{label:"Confirmé",color:"#2563eb",bg:"#dbeafe"},
  done:     {label:"Effectué",color:"#059669",bg:"#d1fae5"},
  cancelled:{label:"Annulé",  color:"#dc2626",bg:"#fee2e2"},
};
const today=new Date();today.setHours(0,0,0,0);
const tdk=dk(today);
const EMPTY={name:"",phone:"",address:"",notes:"",source:"",status:"confirmed",paid:false,payment:"Virement",lines:[],adjustments:[]};
const DL=()=>({id:newId(),type:"standard",category:"canape",itemId:"23p",formula:"basic",qty:1});
const DA=(p={})=>({id:newId(),label:p.label||"Supplément",amount:p.amount||0,isDiscount:p.isDiscount||false});

function Sheet({open,onClose,children,title}){
  if(!open)return null;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"white",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:560,maxHeight:"93vh",display:"flex",flexDirection:"column",boxShadow:"0 -24px 60px rgba(0,0,0,0.22)"}}>
        <div style={{padding:"14px 18px 12px",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <span style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{title}</span>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{overflowY:"auto",padding:"14px 18px 36px",flex:1}}>{children}</div>
      </div>
    </div>
  );
}

function LineEditor({line,onChange,onRemove}){
  const cat=PRICING[line.category],item=cat?.items.find(i=>i.id===line.itemId);
  const u=lineUnitPrice(line),tot=lineTotal(line);
  const s={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"9px 11px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"white"};
  if(line.type==="custom")return(
    <div style={{background:"white",border:"2px solid #e0e7ff",borderRadius:12,padding:12,marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:800,color:"#7c3aed"}}>✏️ PERSONNALISÉ</span>
        <button onClick={onRemove} style={{background:"#fee2e2",border:"none",color:"#dc2626",borderRadius:6,width:24,height:24,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div style={{gridColumn:"1/-1"}}><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Libellé</label><input style={s} value={line.label||""} placeholder="Remise, pack spécial..." onChange={e=>onChange({...line,label:e.target.value})}/></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Quantité</label><input type="number" style={s} value={line.qty} onChange={e=>onChange({...line,qty:e.target.value})}/></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Prix (€)</label><input type="number" style={s} value={line.unitPrice} onChange={e=>onChange({...line,unitPrice:e.target.value})}/></div>
      </div>
      <div style={{textAlign:"right",fontWeight:800,color:"#0f172a",fontSize:16,marginTop:8,paddingTop:8,borderTop:"1px solid #f1f5f9"}}>{fmt(tot)}</div>
    </div>
  );
  return(
    <div style={{background:"white",border:"1.5px solid #e2e8f0",borderRadius:12,padding:12,marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:800,color:"#3b82f6"}}>📋 STANDARD</span>
        <button onClick={onRemove} style={{background:"#fee2e2",border:"none",color:"#dc2626",borderRadius:6,width:24,height:24,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Catégorie</label>
          <select style={s} value={line.category} onChange={e=>{const nc=PRICING[e.target.value];onChange({...line,category:e.target.value,itemId:nc.items[0].id,formula:"basic",qty:1});}}>
            {Object.entries(PRICING).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select></div>
        <div><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Prestation</label>
          <select style={s} value={line.itemId} onChange={e=>onChange({...line,itemId:e.target.value})}>
            {cat?.items.map(it=><option key={it.id} value={it.id}>{it.label}</option>)}
          </select></div>
        {cat?.hasFormula&&<div><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Formule</label>
          <select style={s} value={line.formula} onChange={e=>onChange({...line,formula:e.target.value})}>
            <option value="basic">Basique — {item?.basic}€</option>
            <option value="premium">Premium — {item?.premium}€</option>
          </select></div>}
        {(cat?.hasQty||cat?.isSurface)&&<div><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>{cat.isSurface?"Surface (m²)":"Quantité"}</label>
          <input type="number" min="1" style={s} value={line.qty} onChange={e=>onChange({...line,qty:e.target.value})}/></div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:8,borderTop:"1px solid #f1f5f9"}}>
        <span style={{fontSize:12,color:"#94a3b8"}}>{u}€{(cat?.hasQty||cat?.isSurface)?` × ${line.qty}`:""}</span>
        <span style={{fontWeight:800,color:"#0f172a",fontSize:16}}>{fmt(tot)}</span>
      </div>
    </div>
  );
}

function RDVForm({initial,onSave,saving}){
  const [form,setForm]=useState(initial||EMPTY);
  const {subtotal,adjTotal,total}=calcTotals(form.lines,form.adjustments);
  const s={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"9px 11px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"white"};
  const H=t=><div style={{fontSize:10,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:8}}>{t}</div>;
  const ok=form.name.trim()&&form.lines.length>0;
  return(
    <div>
      <div style={{background:"#f8fafc",borderRadius:12,padding:12,marginBottom:10}}>
        {H("👤 Client")}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{gridColumn:"1/-1"}}><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Nom *</label><input style={s} placeholder="Prénom Nom" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Téléphone</label><input style={s} placeholder="+32 4XX..." value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Paiement</label>
            <select style={s} value={form.payment} onChange={e=>setForm(f=>({...f,payment:e.target.value}))}>
              {["Virement","Cash","Bancontact"].map(p=><option key={p}>{p}</option>)}
            </select></div>
          <div style={{gridColumn:"1/-1"}}><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Adresse</label><input style={s} placeholder="Rue, numéro, commune" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
          <div style={{gridColumn:"1/-1"}}><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Source</label>
            <select style={s} value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))}>
              {["","Facebook Ads","Instagram","Recommandation","Google","WhatsApp direct","Autre"].map(p=><option key={p} value={p}>{p||"— Source client —"}</option>)}
            </select></div>
          <div style={{gridColumn:"1/-1"}}><label style={{display:"block",fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3,textTransform:"uppercase"}}>Notes internes</label><textarea style={{...s,resize:"vertical",minHeight:52}} placeholder="Tissu, tache, accès difficile..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
        </div>
        <div onClick={()=>setForm(f=>({...f,paid:!f.paid}))} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:form.paid?"#d1fae5":"white",border:`1.5px solid ${form.paid?"#6ee7b7":"#e2e8f0"}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",marginTop:8}}>
          <span style={{fontSize:13,fontWeight:700,color:form.paid?"#059669":"#64748b"}}>💳 Paiement reçu</span>
          <div style={{width:38,height:21,background:form.paid?"#10b981":"#cbd5e1",borderRadius:11,position:"relative"}}>
            <div style={{position:"absolute",top:3,left:form.paid?18:3,width:15,height:15,background:"white",borderRadius:"50%",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
          </div>
        </div>
      </div>
      <div style={{background:"#f8fafc",borderRadius:12,padding:12,marginBottom:10}}>
        {H(`🛋️ Prestations (${form.lines.length})`)}
        {form.lines.map(line=><LineEditor key={line.id} line={line} onChange={val=>setForm(f=>({...f,lines:f.lines.map(l=>l.id===line.id?val:l)}))} onRemove={()=>setForm(f=>({...f,lines:f.lines.filter(l=>l.id!==line.id)}))}/>)}
        {form.lines.length===0&&<div style={{textAlign:"center",padding:"14px 0",color:"#94a3b8",fontSize:12}}>Ajoute au moins une prestation 👇</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
          <button onClick={()=>setForm(f=>({...f,lines:[...f.lines,DL()]}))} style={{background:"#eff6ff",color:"#3b82f6",border:"2px dashed #bfdbfe",borderRadius:10,padding:"10px",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Standard</button>
          <button onClick={()=>setForm(f=>({...f,lines:[...f.lines,{id:newId(),type:"custom",label:"",qty:1,unitPrice:0}]}))} style={{background:"#f5f3ff",color:"#7c3aed",border:"2px dashed #ddd6fe",borderRadius:10,padding:"10px",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Personnalisé</button>
        </div>
      </div>
      <div style={{background:"#f8fafc",borderRadius:12,padding:12,marginBottom:10}}>
        {H("⚙️ Ajustements")}
        {form.adjustments.map(adj=>(
          <div key={adj.id} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
            <select style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 6px",fontSize:12,outline:"none",background:"white",flex:"0 0 85px"}} value={adj.isDiscount?"rem":"sup"} onChange={e=>setForm(f=>({...f,adjustments:f.adjustments.map(a=>a.id===adj.id?{...a,isDiscount:e.target.value==="rem"}:a)}))}>
              <option value="sup">➕ Suppl.</option><option value="rem">➖ Remise</option>
            </select>
            <input style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px",fontSize:12,outline:"none",flex:1,minWidth:80,fontFamily:"inherit"}} value={adj.label} placeholder="Libellé" onChange={e=>setForm(f=>({...f,adjustments:f.adjustments.map(a=>a.id===adj.id?{...a,label:e.target.value}:a)}))}/>
            <input type="number" style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px",fontSize:12,outline:"none",width:60,fontFamily:"inherit"}} value={adj.amount} onChange={e=>setForm(f=>({...f,adjustments:f.adjustments.map(a=>a.id===adj.id?{...a,amount:e.target.value}:a)}))}/>
            <button onClick={()=>setForm(f=>({...f,adjustments:f.adjustments.filter(a=>a.id!==adj.id)}))} style={{background:"#fee2e2",border:"none",color:"#dc2626",borderRadius:6,width:28,height:28,cursor:"pointer",flexShrink:0,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        ))}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
          {[{label:"Frais déplacement",amount:15},{label:"Urgence",amount:20},{label:"Remise",amount:10,isDiscount:true}].map(p=>(
            <button key={p.label} onClick={()=>setForm(f=>({...f,adjustments:[...f.adjustments,DA(p)]}))} style={{background:"white",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"5px 9px",fontSize:11,fontWeight:700,color:"#475569",cursor:"pointer"}}>{p.isDiscount?"➖":"➕"} {p.label}</button>
          ))}
        </div>
      </div>
      <div style={{background:"#0f172a",borderRadius:12,padding:14,marginBottom:14}}>
        {subtotal>0&&<div style={{display:"flex",justifyContent:"space-between",color:"#64748b",fontSize:13,marginBottom:5}}><span>Sous-total</span><span>{fmt(subtotal)}</span></div>}
        {adjTotal!==0&&<div style={{display:"flex",justifyContent:"space-between",color:adjTotal>0?"#fbbf24":"#34d399",fontSize:13,marginBottom:5}}><span>Ajustements</span><span>{adjTotal>0?"+":""}{fmt(adjTotal)}</span></div>}
        <div style={{display:"flex",justifyContent:"space-between",color:"white",fontSize:22,fontWeight:800,borderTop:"1px solid #1e293b",paddingTop:10,marginTop:4}}><span>Total</span><span>{fmt(total)}</span></div>
      </div>
      <button disabled={!ok||saving} onClick={()=>onSave(form)} style={{width:"100%",background:ok&&!saving?"#0f172a":"#e2e8f0",color:ok&&!saving?"white":"#94a3b8",border:"none",borderRadius:12,padding:"13px",fontWeight:800,fontSize:14,cursor:ok&&!saving?"pointer":"default"}}>
        {saving?"⏳ Enregistrement...":"✅ Confirmer le RDV"}
      </button>
      {!ok&&<p style={{textAlign:"center",color:"#f59e0b",fontSize:12,marginTop:6}}>⚠️ Nom + au moins une prestation obligatoires</p>}
    </div>
  );
}

function RDVDetail({rdv,slot,onEdit,onStatusChange,onTogglePaid,onDelete}){
  const lines=JSON.parse(rdv.lines||"[]"),adjs=JSON.parse(rdv.adjustments||"[]");
  const {subtotal,adjTotal,total}=calcTotals(lines,adjs);
  const sc=STATUS_CFG[rdv.status]||STATUS_CFG.confirmed;
  return(
    <div>
      <div style={{background:slot.color,borderRadius:14,padding:"14px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:"rgba(255,255,255,0.75)",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>{slot.time} – {slot.end}</div><div style={{color:"white",fontSize:20,fontWeight:800,marginTop:2}}>{rdv.name}</div></div>
        <div style={{textAlign:"right"}}><div style={{color:"rgba(255,255,255,0.7)",fontSize:11}}>Total</div><div style={{color:"white",fontSize:26,fontWeight:800}}>{fmt(total)}</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div style={{background:sc.bg,borderRadius:10,padding:"10px 12px",textAlign:"center"}}><div style={{fontSize:10,fontWeight:700,color:sc.color,textTransform:"uppercase",marginBottom:2}}>Statut</div><div style={{fontSize:14,fontWeight:800,color:sc.color}}>{sc.label}</div></div>
        <div style={{background:rdv.paid?"#d1fae5":"#fef3c7",borderRadius:10,padding:"10px 12px",textAlign:"center"}}><div style={{fontSize:10,fontWeight:700,color:rdv.paid?"#059669":"#d97706",textTransform:"uppercase",marginBottom:2}}>Paiement</div><div style={{fontSize:14,fontWeight:800,color:rdv.paid?"#059669":"#d97706"}}>{rdv.paid?"✅ Reçu":"⏳ En attente"}</div></div>
      </div>
      {[rdv.phone&&["📞","Tél",rdv.phone],rdv.address&&["📍","Adresse",rdv.address],rdv.payment&&["💳","Mode",rdv.payment],rdv.source&&["📣","Source",rdv.source],rdv.notes&&["📝","Notes",rdv.notes]].filter(Boolean).map(([ico,lbl,val])=>(
        <div key={lbl} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}><span style={{fontSize:12,color:"#64748b",minWidth:80,flexShrink:0}}>{ico} {lbl}</span><span style={{fontSize:12,fontWeight:600,color:"#0f172a"}}>{val}</span></div>
      ))}
      <div style={{marginTop:12}}><div style={{fontSize:10,fontWeight:800,color:"#64748b",textTransform:"uppercase",marginBottom:8}}>🛋️ Prestations</div>
        {lines.map((l,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",background:"#f8fafc",borderRadius:8,marginBottom:4}}><span style={{fontSize:12}}>{lineLabel(l)}</span><span style={{fontSize:12,fontWeight:700}}>{fmt(lineTotal(l))}</span></div>)}
      </div>
      {adjs.length>0&&<div style={{marginTop:10}}><div style={{fontSize:10,fontWeight:800,color:"#64748b",textTransform:"uppercase",marginBottom:8}}>⚙️ Ajustements</div>
        {adjs.map((a,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",background:"#f8fafc",borderRadius:8,marginBottom:4}}><span style={{fontSize:12}}>{a.label}</span><span style={{fontSize:12,fontWeight:700,color:a.isDiscount?"#059669":"#d97706"}}>{a.isDiscount?"-":"+"}{fmt(a.amount)}</span></div>)}
      </div>}
      <div style={{background:"#0f172a",borderRadius:12,padding:"12px 14px",marginTop:12,marginBottom:14}}>
        {subtotal!==total&&<><div style={{display:"flex",justifyContent:"space-between",color:"#64748b",fontSize:12,marginBottom:4}}><span>Sous-total</span><span>{fmt(subtotal)}</span></div>{adjTotal!==0&&<div style={{display:"flex",justifyContent:"space-between",color:adjTotal>0?"#fbbf24":"#34d399",fontSize:12,marginBottom:4}}><span>Ajustements</span><span>{adjTotal>0?"+":""}{fmt(adjTotal)}</span></div>}</>}
        <div style={{display:"flex",justifyContent:"space-between",color:"white",fontSize:20,fontWeight:800}}><span>Total</span><span>{fmt(total)}</span></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button onClick={onEdit} style={{background:"#eff6ff",color:"#2563eb",border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:12,cursor:"pointer"}}>✏️ Modifier</button>
        <button onClick={onTogglePaid} style={{background:rdv.paid?"#fef3c7":"#d1fae5",color:rdv.paid?"#d97706":"#059669",border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:12,cursor:"pointer"}}>{rdv.paid?"↩️ Non payé":"💳 Marquer payé"}</button>
        {rdv.status!=="done"&&<button onClick={()=>onStatusChange("done")} style={{background:"#d1fae5",color:"#059669",border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:12,cursor:"pointer"}}>✅ Effectué</button>}
        <button onClick={onDelete} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:12,cursor:"pointer"}}>🗑️ Supprimer</button>
      </div>
    </div>
  );
}

function StatsView({rdvs}){
  const all=Object.values(rdvs),active=all.filter(r=>r.status!=="cancelled");
  const getT=r=>calcTotals(JSON.parse(r.lines||"[]"),JSON.parse(r.adjustments||"[]")).total;
  const now=new Date(),mon=getMon(now);
  const isW=r=>{const d=new Date((r.rdv_key||"").split("_")[0]);return d>=mon&&d<new Date(mon.getTime()+7*86400000);};
  const isM=r=>{const d=new Date((r.rdv_key||"").split("_")[0]);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();};
  const wCA=active.filter(isW).reduce((s,r)=>s+getT(r),0);
  const mCA=active.filter(isM).reduce((s,r)=>s+getT(r),0);
  const tCA=active.reduce((s,r)=>s+getT(r),0);
  const enc=active.filter(r=>r.paid).reduce((s,r)=>s+getT(r),0);
  const pan=active.length?Math.round(tCA/active.length):0;
  const done=all.filter(r=>r.status==="done");
  const mMap={};
  active.forEach(r=>{const[ds]=(r.rdv_key||"").split("_");const d=new Date(ds);if(isNaN(d))return;const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;mMap[k]=(mMap[k]||0)+getT(r);});
  const months=Object.entries(mMap).sort(([a],[b])=>a.localeCompare(b)).slice(-6);
  const maxV=Math.max(...months.map(([,v])=>v),1);
  const K=(ico,lbl,val,bg,c,sub)=>(
    <div style={{background:bg,borderRadius:14,padding:"14px",border:`1px solid ${c}15`}}>
      <div style={{fontSize:20,marginBottom:5}}>{ico}</div>
      <div style={{fontSize:10,fontWeight:700,color:c,textTransform:"uppercase",letterSpacing:"0.4px"}}>{lbl}</div>
      <div style={{fontSize:24,fontWeight:800,color:c,lineHeight:1,marginTop:2}}>{val}</div>
      {sub&&<div style={{fontSize:11,color:c,opacity:0.7,marginTop:3}}>{sub}</div>}
    </div>
  );
  return(
    <div style={{padding:16}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {K("📅","CA semaine",fmt(wCA),"#f0f9ff","#0369a1")}
        {K("📆","CA mois",fmt(mCA),"#f0fdf4","#16a34a")}
        {K("💰","CA total",fmt(tCA),"#fff7ed","#c2410c")}
        {K("✅","Encaissé",fmt(enc),"#f0fdf4","#059669")}
        {K("⏳","À encaisser",fmt(tCA-enc),"#fefce8","#ca8a04")}
        {K("📈","Panier moyen",pan?fmt(pan):"—","#fdf4ff","#9333ea")}
        {K("📋","Interventions",active.length,"#f8fafc","#475569",`${done.length} effectuées`)}
      </div>
      {months.length>0&&(
        <div style={{background:"white",borderRadius:14,padding:16,border:"1px solid #f1f5f9"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:14}}>📊 Évolution mensuelle</div>
          {months.map(([m,ca])=>{
            const[y,mo]=m.split("-");
            const lbl=new Date(parseInt(y),parseInt(mo)-1).toLocaleString("fr",{month:"long",year:"numeric"});
            const pct=Math.max(4,Math.round(ca/maxV*100));
            return(<div key={m} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:"#475569",fontWeight:600,textTransform:"capitalize"}}>{lbl}</span><span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>{fmt(ca)}</span></div>
              <div style={{background:"#f1f5f9",borderRadius:6,height:8}}><div style={{background:"linear-gradient(90deg,#3b82f6,#10b981)",width:`${pct}%`,height:"100%",borderRadius:6}}/></div>
            </div>);
          })}
        </div>
      )}
    </div>
  );
}

export default function App(){
  const [rdvs,setRdvs]=useState({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [calView,setCalView]=useState("week");
  const [mainView,setMainView]=useState("calendar");
  const [monday,setMonday]=useState(()=>getMon(today));
  const [selDay,setSelDay]=useState(()=>dayIndex(today));
  const [monthDate,setMonthDate]=useState(()=>new Date(today.getFullYear(),today.getMonth(),1));
  const [detailData,setDetailData]=useState(null);
  const [formData,setFormData]=useState(null);

  useEffect(()=>{
    loadRdvs();
    const channel=supabase.channel("rdvs-realtime")
      .on("postgres_changes",{event:"*",schema:"public",table:"rdvs"},()=>loadRdvs())
      .subscribe();
    return ()=>supabase.removeChannel(channel);
  },[]);

  async function loadRdvs(){
    const{data,error}=await supabase.from("rdvs").select("*");
    if(error){console.error(error);setLoading(false);return;}
    const map={};data.forEach(r=>{map[r.rdv_key]=r;});
    setRdvs(map);setLoading(false);
  }

  async function saveRdv(form){
    setSaving(true);
    const k=formData.key;
    const record={rdv_key:k,name:form.name,phone:form.phone,address:form.address,notes:form.notes,source:form.source,status:form.status,paid:form.paid,payment:form.payment,lines:JSON.stringify(form.lines||[]),adjustments:JSON.stringify(form.adjustments||[]),total_amount:calcTotals(form.lines||[],form.adjustments||[]).total};
    const{error}=await supabase.from("rdvs").upsert(record,{onConflict:"rdv_key"});
    if(error){console.error(error);alert("❌ Erreur enregistrement: "+error.message);}
    else{await loadRdvs();}
    setSaving(false);setFormData(null);setDetailData(null);
  }

  async function updateRdv(key,updates){
    const{error}=await supabase.from("rdvs").update(updates).eq("rdv_key",key);
    if(!error) await loadRdvs();
  }

  async function deleteRdv(key){
    await supabase.from("rdvs").delete().eq("rdv_key",key);
    await loadRdvs();
    setDetailData(null);
  }

  const dates=weekDates(monday);
  const isToday=d=>dk(d)===tdk;
  const getR=(ds,sl)=>rdvs[`${ds}_${sl}`];
  const openDetail=(key,slot,date)=>{const rdv=rdvs[key];if(!rdv)return;setDetailData({rdv,slot,key,date});};
  const openForm=(key,slot,date,existing=null)=>{setFormData({key,slot,date,initial:existing?{...existing,lines:JSON.parse(existing.lines||"[]"),adjustments:JSON.parse(existing.adjustments||"[]")}:null});};

  const wActive=dates.flatMap((_,di)=>SLOTS.map(slot=>{const k=`${dk(dates[di])}_${slot.id}`;const r=rdvs[k];return r&&r.status!=="cancelled"?r:null;})).filter(Boolean);
  const wCA=wActive.reduce((s,r)=>s+calcTotals(JSON.parse(r.lines||"[]"),JSON.parse(r.adjustments||"[]")).total,0);
  const wPaid=wActive.filter(r=>r.paid).reduce((s,r)=>s+calcTotals(JSON.parse(r.lines||"[]"),JSON.parse(r.adjustments||"[]")).total,0);
  const wDone=wActive.filter(r=>r.status==="done").length;

  const navPrev=()=>{if(calView==="month")setMonthDate(d=>{const n=new Date(d);n.setMonth(d.getMonth()-1);return n;});else setMonday(m=>{const d=new Date(m);d.setDate(d.getDate()-7);return d;});};
  const navNext=()=>{if(calView==="month")setMonthDate(d=>{const n=new Date(d);n.setMonth(d.getMonth()+1);return n;});else setMonday(m=>{const d=new Date(m);d.setDate(d.getDate()+7);return d;});};
  const navToday=()=>{setMonday(getMon(today));setSelDay(dayIndex(today));setMonthDate(new Date(today.getFullYear(),today.getMonth(),1));};
  const navLabel=()=>{if(calView==="month")return`${MONTHS_FR[monthDate.getMonth()]} ${monthDate.getFullYear()}`;return`${fmtShort(monday)} – ${fmtShort(dates[6])}`;};

  const WeekView=()=>(
    <div style={{padding:"14px 10px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[{ico:"💰",lbl:"CA semaine",val:fmt(wCA),bg:"#f0fdf4",c:"#16a34a",bdr:"#bbf7d0"},{ico:"✅",lbl:"Encaissé",val:fmt(wPaid),bg:"#d1fae5",c:"#059669",bdr:"#6ee7b7"},{ico:"⏳",lbl:"À encaisser",val:fmt(wCA-wPaid),bg:"#fef9c3",c:"#d97706",bdr:"#fde68a"},{ico:"📋",lbl:`RDV (${wDone}/${wActive.length} faits)`,val:wActive.length,bg:"#eff6ff",c:"#2563eb",bdr:"#bfdbfe"}].map(({ico,lbl,val,bg,c,bdr})=>(
          <div key={lbl} style={{background:bg,borderRadius:16,padding:"12px 14px",border:`1.5px solid ${bdr}`}}><div style={{fontSize:11,fontWeight:700,color:c,marginBottom:5}}>{ico} {lbl}</div><div style={{fontSize:24,fontWeight:800,color:c,lineHeight:1}}>{val}</div></div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
        {dates.map((date,di)=>{
          const isT=isToday(date),isSun=di===6;
          return(
            <div key={di} style={{background:isT?"#3b82f6":isSun?"#fdf4ff":"white",borderRadius:16,border:`2px solid ${isT?"#3b82f6":isSun?"#e9d5ff":"#e8edf2"}`,overflow:"hidden",boxShadow:isT?"0 4px 20px rgba(59,130,246,0.28)":"0 1px 4px rgba(0,0,0,0.05)"}}>
              <div style={{textAlign:"center",padding:"8px 2px 6px",borderBottom:`1px solid ${isT?"rgba(255,255,255,0.2)":isSun?"#e9d5ff":"#f1f5f9"}`}}>
                <div style={{fontSize:8.5,fontWeight:700,color:isT?"rgba(255,255,255,0.8)":isSun?"#9333ea":"#94a3b8",textTransform:"uppercase"}}>{DAYS_SHORT[di]}</div>
                <div style={{fontSize:18,fontWeight:800,color:isT?"white":isSun?"#9333ea":"#0f172a",lineHeight:1.1}}>{date.getDate()}</div>
                <div style={{fontSize:8.5,color:isT?"rgba(255,255,255,0.65)":isSun?"#a855f7":"#94a3b8"}}>{MONTHS_S[date.getMonth()]}</div>
              </div>
              <div style={{padding:"5px 4px",background:isT?"transparent":isSun?"#fdf4ff":"#f8fafc"}}>
                {SLOTS.map(slot=>{
                  const k=`${dk(date)}_${slot.id}`,r=getR(dk(date),slot.id);
                  if(r){
                    const lines=JSON.parse(r.lines||"[]"),adjs=JSON.parse(r.adjustments||"[]");
                    const{total}=calcTotals(lines,adjs),sc=STATUS_CFG[r.status]||STATUS_CFG.confirmed;
                    return(<div key={slot.id} onClick={()=>openDetail(k,slot,date)} style={{background:"white",borderRadius:10,padding:"6px 5px",marginBottom:5,cursor:"pointer",border:`1.5px solid ${slot.border}`,transition:"transform 0.1s"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.04)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
                      <div style={{display:"flex",alignItems:"center",gap:2,marginBottom:2}}><div style={{width:5,height:5,borderRadius:"50%",background:slot.dot,flexShrink:0}}/><div style={{fontSize:7.5,fontWeight:700,color:slot.color,lineHeight:1.2}}>{slot.time}<br/>–{slot.end}</div></div>
                      <div style={{fontSize:9,fontWeight:800,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:1}}>{r.name}</div>
                      <div style={{fontSize:9.5,fontWeight:800,color:slot.color}}>{fmt(total)}</div>
                      <div style={{marginTop:2,display:"flex",gap:2}}><span style={{background:sc.bg,color:sc.color,fontSize:7,fontWeight:700,padding:"1px 3px",borderRadius:3}}>{sc.label}</span>{r.paid&&<span style={{background:"#d1fae5",color:"#059669",fontSize:7,fontWeight:700,padding:"1px 3px",borderRadius:3}}>💳</span>}</div>
                    </div>);
                  }
                  return(<div key={slot.id} onClick={()=>openForm(k,slot,date)} style={{background:isT?"rgba(255,255,255,0.15)":"white",borderRadius:10,padding:"5px 4px",marginBottom:5,cursor:"pointer",border:`1.5px dashed ${isT?"rgba(255,255,255,0.35)":slot.border}`,minHeight:50,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}} onMouseEnter={e=>e.currentTarget.style.background=isT?"rgba(255,255,255,0.25)":"#f0f9ff"} onMouseLeave={e=>e.currentTarget.style.background=isT?"rgba(255,255,255,0.15)":"white"}>
                    <div style={{display:"flex",alignItems:"center",gap:2}}><div style={{width:4,height:4,borderRadius:"50%",background:isT?"rgba(255,255,255,0.5)":slot.dot,opacity:0.5}}/><div style={{fontSize:7.5,fontWeight:700,color:isT?"rgba(255,255,255,0.65)":slot.color,lineHeight:1.2}}>{slot.time}<br/>–{slot.end}</div></div>
                    <div style={{fontSize:8,color:isT?"rgba(255,255,255,0.5)":"#94a3b8",fontWeight:600}}>+ RDV</div>
                  </div>);
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const DayView=()=>{
    const dayActive=SLOTS.map(slot=>{const k=`${dk(dates[selDay])}_${slot.id}`;const r=rdvs[k];return r&&r.status!=="cancelled"?r:null;}).filter(Boolean);
    const dayCA=dayActive.reduce((s,r)=>s+calcTotals(JSON.parse(r.lines||"[]"),JSON.parse(r.adjustments||"[]")).total,0);
    return(<div>
      <div style={{background:"white",borderBottom:"1px solid #f1f5f9",display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"0 8px"}}>
        {dates.map((date,di)=>{
          const isSun=di===6;
          return(<button key={di} onClick={()=>setSelDay(di)} style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",padding:"7px 10px",borderBottom:`3px solid ${selDay===di?"#3b82f6":"transparent"}`}}>
            <div style={{fontSize:9.5,fontWeight:700,color:selDay===di?"#3b82f6":isToday(date)?"#f59e0b":isSun?"#9333ea":"#94a3b8",textTransform:"uppercase"}}>{DAYS_SHORT[di]}</div>
            <div style={{fontSize:19,fontWeight:800,color:selDay===di?"#3b82f6":isToday(date)?"#f59e0b":isSun?"#9333ea":"#0f172a",lineHeight:1.1,textAlign:"center"}}>{date.getDate()}</div>
            {isToday(date)&&<div style={{width:5,height:5,borderRadius:"50%",background:"#f59e0b",margin:"2px auto 0"}}/>}
          </button>);
        })}
      </div>
      {dayCA>0&&<div style={{padding:"8px 16px",background:"white",borderBottom:"1px solid #f1f5f9"}}><div style={{background:"#f0fdf4",borderRadius:10,padding:"8px 14px",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#16a34a",fontWeight:700}}>💰 CA du jour</span><span style={{fontSize:18,fontWeight:800,color:"#16a34a"}}>{fmt(dayCA)}</span></div></div>}
      <div style={{padding:"14px 16px"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:12}}>
          {DAYS_FULL[selDay]} {fmtShort(dates[selDay])}
          {isToday(dates[selDay])&&<span style={{marginLeft:8,background:"#fef3c7",color:"#d97706",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>Aujourd'hui</span>}
          {selDay===6&&<span style={{marginLeft:8,background:"#f3e8ff",color:"#9333ea",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>Dimanche</span>}
        </div>
        {SLOTS.map(slot=>{
          const k=`${dk(dates[selDay])}_${slot.id}`,r=rdvs[k];
          if(r){
            const lines=JSON.parse(r.lines||"[]"),adjs=JSON.parse(r.adjustments||"[]");
            const{total}=calcTotals(lines,adjs),sc=STATUS_CFG[r.status]||STATUS_CFG.confirmed;
            return(<div key={slot.id} onClick={()=>openDetail(k,slot,dates[selDay])} style={{borderRadius:14,padding:"12px 14px",cursor:"pointer",background:slot.light,border:`1.5px solid ${slot.border}`,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}><div style={{width:7,height:7,borderRadius:"50%",background:slot.dot}}/><span style={{fontSize:11,fontWeight:700,color:slot.color,textTransform:"uppercase"}}>{slot.time} – {slot.end}</span></div>
              <div style={{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:3}}>{r.name}</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>{rdvSummary(JSON.parse(r.lines||"[]"))}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:18,fontWeight:800,color:"#0f172a"}}>{fmt(total)}</span>
                <div style={{display:"flex",gap:4}}><span style={{background:sc.bg,color:sc.color,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6}}>{sc.label}</span>{r.paid&&<span style={{background:"#d1fae5",color:"#059669",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6}}>💳</span>}</div>
              </div>
            </div>);
          }
          return(<div key={slot.id} onClick={()=>openForm(k,slot,dates[selDay])} style={{borderRadius:14,padding:"12px",cursor:"pointer",border:"1.5px dashed #e2e8f0",minHeight:72,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",gap:4,marginBottom:8}} onMouseEnter={e=>{e.currentTarget.style.background="#f8fafc";}} onMouseLeave={e=>{e.currentTarget.style.background="";}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:slot.dot,opacity:0.3}}/>
            <span style={{fontSize:11,color:slot.color,fontWeight:700,textTransform:"uppercase"}}>{slot.time} – {slot.end}</span>
            <span style={{fontSize:12,color:"#cbd5e1",fontWeight:600}}>+ Ajouter un RDV</span>
          </div>);
        })}
      </div>
    </div>);
  };

  const MonthView=()=>{
    const year=monthDate.getFullYear(),month=monthDate.getMonth();
    const dim=new Date(year,month+1,0).getDate();
    const first=(()=>{const d=new Date(year,month,1).getDay();return d===0?6:d-1;})();
    const mRdvs=Object.values(rdvs).filter(r=>{const[ds]=(r.rdv_key||"").split("_");const d=new Date(ds);return d.getFullYear()===year&&d.getMonth()===month&&r.status!=="cancelled";});
    const mCA=mRdvs.reduce((s,r)=>s+calcTotals(JSON.parse(r.lines||"[]"),JSON.parse(r.adjustments||"[]")).total,0);
    const getRd=day=>{const ds=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;return SLOTS.map(slot=>{const r=getR(ds,slot.id);return r?{...r,slot}:null;}).filter(Boolean);};
    const cells=[];
    for(let i=0;i<first;i++)cells.push(null);
    for(let d=1;d<=dim;d++)cells.push(d);
    while(cells.length%7!==0)cells.push(null);
    return(<div>
      <div style={{padding:"10px 16px",background:"white",borderBottom:"1px solid #f1f5f9",display:"flex",gap:8}}>
        <div style={{background:"#f0fdf4",borderRadius:12,padding:"10px 14px",flex:1,textAlign:"center"}}><div style={{fontSize:10,color:"#16a34a",fontWeight:700,marginBottom:2}}>💰 CA du mois</div><div style={{fontSize:22,fontWeight:800,color:"#16a34a"}}>{fmt(mCA)}</div></div>
        <div style={{background:"#eff6ff",borderRadius:12,padding:"10px 14px",flex:1,textAlign:"center"}}><div style={{fontSize:10,color:"#2563eb",fontWeight:700,marginBottom:2}}>📋 Interventions</div><div style={{fontSize:22,fontWeight:800,color:"#2563eb"}}>{mRdvs.length}</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"white",borderBottom:"1px solid #f1f5f9",padding:"0 10px"}}>
        {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map((d,i)=>(
          <div key={i} style={{textAlign:"center",padding:"8px 0",fontSize:10,fontWeight:700,color:i===6?"#9333ea":"#64748b",textTransform:"uppercase"}}>{d}</div>
        ))}
      </div>
      <div style={{padding:"6px 10px 20px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {cells.map((day,i)=>{
            if(!day)return<div key={i} style={{minHeight:70}}/>;
            const ds=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const dRdvs=getRd(day);
            const ca=dRdvs.reduce((s,r)=>s+calcTotals(JSON.parse(r.lines||"[]"),JSON.parse(r.adjustments||"[]")).total,0);
            const isT=ds===tdk,isSun=i%7===6;
            return(<div key={i} onClick={()=>{setMonday(getMon(new Date(ds)));setSelDay(dayIndex(new Date(ds)));setCalView("day");}} style={{minHeight:70,background:isT?"#eff6ff":isSun?"#fdf4ff":"white",borderRadius:10,padding:"4px",cursor:"pointer",border:isT?"1.5px solid #bfdbfe":isSun?"1.5px solid #e9d5ff":"1.5px solid #f1f5f9"}} onMouseEnter={e=>e.currentTarget.style.background=isT?"#dbeafe":isSun?"#f3e8ff":"#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=isT?"#eff6ff":isSun?"#fdf4ff":"white"}>
              <div style={{fontWeight:isT?800:600,fontSize:11,color:isT?"#3b82f6":isSun?"#9333ea":"#0f172a",marginBottom:2,display:"flex",justifyContent:"space-between"}}>
                <span>{day}</span>{isT&&<div style={{width:5,height:5,borderRadius:"50%",background:"#3b82f6"}}/>}
              </div>
              {ca>0&&<div style={{fontSize:9,fontWeight:800,color:"#16a34a",marginBottom:1}}>{fmt(ca)}</div>}
              {dRdvs.slice(0,2).map((r,j)=>(
                <div key={j} style={{background:r.slot.light,borderLeft:`2px solid ${r.slot.color}`,borderRadius:3,padding:"1px 3px",marginBottom:2,fontSize:8.5,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
              ))}
              {dRdvs.length>2&&<div style={{fontSize:8,color:"#64748b"}}>+{dRdvs.length-2}</div>}
            </div>);
          })}
        </div>
      </div>
    </div>);
  };

  if(loading)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#eef2f7",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>🚿</div>
        <div style={{fontSize:16,fontWeight:700,color:"#0f172a"}}>StayClean</div>
        <div style={{fontSize:12,color:"#64748b",marginTop:4}}>Chargement...</div>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#eef2f7",fontFamily:"'Segoe UI',system-ui,-apple-system,sans-serif",maxWidth:720,margin:"0 auto"}}>
      <div style={{background:"#0f172a",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 16px rgba(0,0,0,0.35)"}}>
        <div><div style={{color:"white",fontWeight:800,fontSize:17}}>StayClean</div><div style={{color:"#64748b",fontSize:10}}>Gestion interventions</div></div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setMainView("calendar")} style={{background:mainView==="calendar"?"#3b82f6":"#1e293b",border:"none",color:"white",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontWeight:700,fontSize:12}}>📅 Planning</button>
          <button onClick={()=>setMainView("stats")} style={{background:mainView==="stats"?"#10b981":"#1e293b",border:"none",color:"white",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontWeight:700,fontSize:12}}>📊 Stats</button>
        </div>
      </div>

      {mainView==="stats"&&<StatsView rdvs={rdvs}/>}

      {mainView==="calendar"&&<>
        <div style={{background:"white",borderBottom:"1px solid #e8edf2",padding:"10px 16px"}}>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {[{id:"day",label:"Jour"},{id:"week",label:"Semaine"},{id:"month",label:"Mois"}].map(({id,label})=>(
              <button key={id} onClick={()=>setCalView(id)} style={{flex:1,background:calView===id?"#0f172a":"#f1f5f9",color:calView===id?"white":"#64748b",border:"none",borderRadius:10,padding:"9px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{label}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={navPrev} style={{background:"#f1f5f9",border:"none",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:18,color:"#475569",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <button onClick={navToday} style={{background:"#f1f5f9",border:"none",color:"#475569",borderRadius:9,padding:"0 14px",height:34,cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Aujourd'hui</button>
            <button onClick={navNext} style={{background:"#f1f5f9",border:"none",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:18,color:"#475569",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
            <span style={{color:"#0f172a",fontSize:13,fontWeight:700,flex:1,textAlign:"right"}}>{navLabel()}</span>
          </div>
        </div>
        {calView==="week"&&<WeekView/>}
        {calView==="day"&&<DayView/>}
        {calView==="month"&&<MonthView/>}
      </>}

      <Sheet open={!!detailData} onClose={()=>setDetailData(null)} title="Détail intervention">
        {detailData&&<RDVDetail rdv={detailData.rdv} slot={detailData.slot}
          onEdit={()=>{openForm(detailData.key,detailData.slot,detailData.date,detailData.rdv);setDetailData(null);}}
          onStatusChange={async s=>{await updateRdv(detailData.key,{status:s});setDetailData(null);}}
          onTogglePaid={async()=>{await updateRdv(detailData.key,{paid:!detailData.rdv.paid});setDetailData(null);}}
          onDelete={()=>deleteRdv(detailData.key)}
        />}
      </Sheet>

      <Sheet open={!!formData} onClose={()=>setFormData(null)} title={formData?.initial?"Modifier le RDV":"Nouveau RDV"}>
        {formData&&<RDVForm initial={formData.initial} onSave={saveRdv} saving={saving}/>}
      </Sheet>
    </div>
  );
}
