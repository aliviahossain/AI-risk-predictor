import { useState, useMemo } from "react";
import { classifyGene } from "../utils/parseCSV";

const PAGE = 15;

export default function GeneTable({ genes, fcThreshold=0.5, pThreshold=0.05, pValueType="adj" }) {
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("all");
  const [sortCol, setSortCol] = useState("adjPVal");
  const [sortDir, setSortDir] = useState("asc");
  const [page,    setPage]    = useState(1);

  const rows = useMemo(() => {
    let r = genes.map(g => ({ ...g, type: classifyGene(g, fcThreshold, pThreshold, pValueType) }));
    if (filter !== "all") r = r.filter(g => g.type === filter);
    if (search.trim())    r = r.filter(g => g.geneSymbol.toLowerCase().includes(search.toLowerCase()));
    r.sort((a,b) => sortDir === "asc" ? a[sortCol]-b[sortCol] : b[sortCol]-a[sortCol]);
    return r;
  }, [genes, filter, search, sortCol, sortDir, fcThreshold, pThreshold, pValueType]);

  const totalPages = Math.ceil(rows.length / PAGE);
  const paged = rows.slice((page-1)*PAGE, page*PAGE);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  };

  const badge = (type) => {
    const s = { up:{bg:"#fef2f2",color:"#ef4444"}, down:{bg:"#eff6ff",color:"#3b82f6"}, ns:{bg:"#f9fafb",color:"#9ca3af"} };
    const t = s[type]||s.ns;
    return <span style={{background:t.bg,color:t.color,padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      {type==="up"?"↑ UP":type==="down"?"↓ DN":"NS"}
    </span>;
  };

  const cols = [
    {key:"geneSymbol",label:"GENE",    sortable:false},
    {key:"logFC",     label:"logFC",   sortable:true},
    {key:"aveExpr",   label:"AveExpr", sortable:true},
    {key:"pValue",    label:"P.Value", sortable:true},
    {key:"adjPVal",   label:"adj.P",   sortable:true},
    {key:"bStat",     label:"B",       sortable:true},
  ];

  const th = { padding:"10px 14px", textAlign:"left", fontSize:10, fontWeight:700,
    textTransform:"uppercase", letterSpacing:"0.8px", color:"#9ca3af",
    borderBottom:"2px solid #e5e7eb", background:"#f9fafb", cursor:"pointer" };
  const td = { padding:"10px 14px", fontSize:13, borderBottom:"1px solid #f3f4f6", color:"#374151" };

  return (
    <div>
      {/* Filter bar */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
          placeholder="Search gene symbol…"
          style={{flex:1,minWidth:160,padding:"8px 14px",border:"1px solid #e5e7eb",borderRadius:8,
            fontSize:13,outline:"none",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#374151"}}/>
        {["all","up","down","ns"].map(f=>(
          <button key={f} onClick={()=>{setFilter(f);setPage(1);}}
            style={{padding:"7px 16px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
              border:"1px solid",transition:"all 0.15s",fontFamily:"'Plus Jakarta Sans',sans-serif",
              borderColor: filter===f?"#6366f1":"#e5e7eb",
              background:  filter===f?"#6366f1":"#fff",
              color:       filter===f?"#fff":"#6b7280"}}>
            {f==="all"?"All":f==="up"?"↑ Up":f==="down"?"↓ Down":"— NS"}
          </button>
        ))}
        <span style={{color:"#9ca3af",fontSize:12,marginLeft:"auto"}}>{rows.length.toLocaleString()} genes</span>
      </div>

      {/* Table */}
      <div style={{overflowX:"auto",borderRadius:12,border:"1px solid #e5e7eb"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr>
              <th style={th}>TYPE</th>
              {cols.map(c=>(
                <th key={c.key} style={{...th,cursor:c.sortable?"pointer":"default"}} onClick={()=>c.sortable&&handleSort(c.key)}>
                  {c.label}{c.sortable&&sortCol===c.key&&<span style={{color:"#6366f1",marginLeft:4}}>{sortDir==="asc"?"↑":"↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((g,i)=>(
              <tr key={g.id} style={{background:i%2===0?"#fff":"#fafafa"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f0f4ff"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafafa"}>
                <td style={td}>{badge(g.type)}</td>
                <td style={{...td,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:"#4f46e5"}}>{g.geneSymbol}</td>
                <td style={{...td,color:g.logFC>0?"#ef4444":"#3b82f6",fontFamily:"'JetBrains Mono',monospace"}}>{g.logFC.toFixed(4)}</td>
                <td style={{...td,fontFamily:"'JetBrains Mono',monospace"}}>{g.aveExpr.toFixed(4)}</td>
                <td style={{...td,fontFamily:"'JetBrains Mono',monospace"}}>{g.pValue.toExponential(2)}</td>
                <td style={{...td,color:(pValueType==="raw"?g.pValue:g.adjPVal)<pThreshold?"#16a34a":"#374151",fontFamily:"'JetBrains Mono',monospace"}}>{g.adjPVal.toExponential(2)}</td>
                <td style={{...td,fontFamily:"'JetBrains Mono',monospace"}}>{g.bStat.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages>1&&(
        <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:16,alignItems:"center"}}>
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
            style={{padding:"6px 14px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",
              color:"#374151",cursor:"pointer",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>‹ Prev</button>
          <span style={{fontSize:13,color:"#6b7280"}}>Page {page} of {totalPages}</span>
          <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
            style={{padding:"6px 14px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",
              color:"#374151",cursor:"pointer",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Next ›</button>
        </div>
      )}
    </div>
  );
}