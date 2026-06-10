import { useMemo } from "react";
import { classifyGene } from "../utils/parseCSV";

const W=700, H=420, PAD={top:30,right:30,bottom:54,left:60};
const PW=W-PAD.left-PAD.right, PH=H-PAD.top-PAD.bottom;
const C={ up:"#ef4444", down:"#3b82f6", ns:"#d1d5db" };

function arrMin(arr) { let m=arr[0]; for(let i=1;i<arr.length;i++) if(arr[i]<m) m=arr[i]; return m; }
function arrMax(arr) { let m=arr[0]; for(let i=1;i<arr.length;i++) if(arr[i]>m) m=arr[i]; return m; }

export default function MAPlot({ genes, fcThreshold=0.1, pThreshold=0.05 }) {
  const data = useMemo(() => {
    if (!genes?.length) return null;

    const aves=[], logFCs=[];
    for (let i=0; i<genes.length; i++) {
      if (isFinite(genes[i].aveExpr)) aves.push(genes[i].aveExpr);
      if (isFinite(genes[i].logFC))   logFCs.push(genes[i].logFC);
    }
    if (!aves.length) return null;

    const xMin=arrMin(aves)-0.5, xMax=arrMax(aves)+0.5;
    const absFC = logFCs.map(v => v<0?-v:v);
    const yAbsMax = arrMax(absFC) * 1.1 || 1;
    const yMin=-yAbsMax, yMax=yAbsMax;

    const sx = v => ((v-xMin)/(xMax-xMin))*PW;
    const sy = v => PH-((v-yMin)/(yMax-yMin))*PH;

    const ns_pts=[], sig_pts=[];
    for (let i=0; i<genes.length; i++) {
      const g    = genes[i];
      const type = classifyGene(g, fcThreshold, pThreshold);
      const pt   = { geneSymbol:g.geneSymbol, aveExpr:g.aveExpr, logFC:g.logFC,
                     cx:sx(g.aveExpr), cy:sy(g.logFC), type };
      if (type==="ns") ns_pts.push(pt); else sig_pts.push(pt);
    }

    const MAX_NS = 1500;
    const ns_display = ns_pts.length > MAX_NS
      ? ns_pts.filter((_,i) => i % Math.ceil(ns_pts.length/MAX_NS)===0)
      : ns_pts;

    const xStep=(xMax-xMin)/6;
    const xTicks=Array.from({length:7},(_,i)=>({v:xMin+i*xStep, x:sx(xMin+i*xStep)}));
    const yVals=[-yAbsMax, -yAbsMax/2, 0, yAbsMax/2, yAbsMax];
    const yTicks=yVals.map(v=>({v, y:sy(v)}));
    const midY=sy(0);

    return {ns_display, sig_pts, xTicks, yTicks, midY};
  },[genes,fcThreshold,pThreshold]);

  if (!data) return <p style={{color:"#9ca3af",textAlign:"center",padding:40}}>No data</p>;
  const {ns_display, sig_pts, xTicks, yTicks, midY}=data;

  return (
    <div style={{width:"100%",overflowX:"auto"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,display:"block",margin:"0 auto"}}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          <rect x={0} y={0} width={PW} height={PH} fill="#fafafa" rx={6} stroke="#e5e7eb"/>
          {yTicks.map(t=><line key={t.v} x1={0} y1={t.y} x2={PW} y2={t.y} stroke="#f3f4f6"/>)}
          <line x1={0} y1={midY} x2={PW} y2={midY} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4,3"/>

          {ns_display.map((p,i)=>(
            <circle key={i} cx={p.cx} cy={p.cy} r={2.5} fill={C.ns} opacity={0.4}>
              <title>{`${p.geneSymbol}\nAveExpr:${p.aveExpr.toFixed(2)}\nlogFC:${p.logFC.toFixed(3)}`}</title>
            </circle>
          ))}
          {sig_pts.map((p,i)=>(
            <circle key={i} cx={p.cx} cy={p.cy} r={4} fill={C[p.type]} opacity={0.85} stroke="#fff" strokeWidth={0.5}>
              <title>{`${p.geneSymbol}\nAveExpr:${p.aveExpr.toFixed(2)}\nlogFC:${p.logFC.toFixed(3)}`}</title>
            </circle>
          ))}

          <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#d1d5db"/>
          {xTicks.map(t=>(
            <g key={t.v}>
              <line x1={t.x} y1={PH} x2={t.x} y2={PH+4} stroke="#d1d5db"/>
              <text x={t.x} y={PH+14} fill="#9ca3af" fontSize={9} textAnchor="middle">{t.v.toFixed(1)}</text>
            </g>
          ))}
          <text x={PW/2} y={PH+36} fill="#6b7280" fontSize={11} textAnchor="middle" fontWeight="600">
            Average Expression
          </text>

          <line x1={0} y1={0} x2={0} y2={PH} stroke="#d1d5db"/>
          {yTicks.map(t=>(
            <g key={t.v}>
              <line x1={-4} y1={t.y} x2={0} y2={t.y} stroke="#d1d5db"/>
              <text x={-8} y={t.y+3} fill="#9ca3af" fontSize={9} textAnchor="end">{t.v.toFixed(2)}</text>
            </g>
          ))}
          <text transform={`translate(-44,${PH/2}) rotate(-90)`}
            fill="#6b7280" fontSize={11} textAnchor="middle" fontWeight="600">log₂ Fold Change</text>

          {[["up","#ef4444","Upregulated"],["down","#3b82f6","Downregulated"],["ns","#d1d5db","Not Sig"]].map(([,col,lbl],i)=>(
            <g key={lbl} transform={`translate(${PW-130},${10+i*18})`}>
              <circle cx={6} cy={6} r={4} fill={col}/>
              <text x={14} y={10} fill="#374151" fontSize={10}>{lbl}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}