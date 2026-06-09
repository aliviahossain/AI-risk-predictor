import { useMemo } from "react";
import { classifyGene } from "../utils/parseCSV";

const W=700, H=420, PAD={top:30,right:30,bottom:54,left:60};
const PW=W-PAD.left-PAD.right, PH=H-PAD.top-PAD.bottom;
const C={ up:"#ef4444", down:"#3b82f6", ns:"#d1d5db" };

export default function MAPlot({ genes, fcThreshold=0.5, pThreshold=0.05 }) {
  const data = useMemo(() => {
    if (!genes?.length) return null;
    const aves   = genes.map(g=>g.aveExpr).filter(isFinite);
    const logFCs = genes.map(g=>g.logFC).filter(isFinite);
    const xMin=Math.min(...aves)-0.5, xMax=Math.max(...aves)+0.5;
    const yAbsMax=Math.max(...logFCs.map(Math.abs))*1.1;
    const yMin=-yAbsMax, yMax=yAbsMax;

    const sx = v=>((v-xMin)/(xMax-xMin))*PW;
    const sy = v=>PH-((v-yMin)/(yMax-yMin))*PH;

    const points = genes.map(g=>({
      ...g, cx:sx(g.aveExpr), cy:sy(g.logFC),
      type:classifyGene(g,fcThreshold,pThreshold)
    }));

    const xStep=(xMax-xMin)/6;
    const xTicks=Array.from({length:7},(_,i)=>({v:xMin+i*xStep,x:sx(xMin+i*xStep)}));
    const yStep=yAbsMax/3;
    const yTicks=Array.from({length:7},(_,i)=>({v:yMin+i*yStep*2/3*1.5,y:sy(yMin+i*yStep*2/3*1.5)})).filter(t=>Math.abs(t.v)<=yAbsMax);

    const midY=sy(0);
    return {points,xTicks,yTicks,midY,xMin,xMax,yMin,yMax,sx,sy};
  },[genes,fcThreshold,pThreshold]);

  if (!data) return null;
  const {points,xTicks,yTicks,midY}=data;

  return (
    <div style={{width:"100%",overflowX:"auto"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,display:"block",margin:"0 auto"}}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          <rect x={0} y={0} width={PW} height={PH} fill="#fafafa" rx={6} stroke="#e5e7eb"/>
          {yTicks.map(t=><line key={t.v} x1={0} y1={t.y} x2={PW} y2={t.y} stroke="#f3f4f6"/>)}
          {/* Zero line */}
          <line x1={0} y1={midY} x2={PW} y2={midY} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4,3"/>

          {points.filter(p=>p.type==="ns").map((p,i)=>(
            <circle key={i} cx={p.cx} cy={p.cy} r={2.5} fill={C.ns} opacity={0.4}>
              <title>{`${p.geneSymbol}\nAveExpr: ${p.aveExpr.toFixed(2)}\nlogFC: ${p.logFC.toFixed(3)}`}</title>
            </circle>
          ))}
          {points.filter(p=>p.type!=="ns").map((p,i)=>(
            <circle key={i} cx={p.cx} cy={p.cy} r={4} fill={C[p.type]} opacity={0.85} stroke="#fff" strokeWidth={0.5}>
              <title>{`${p.geneSymbol}\nAveExpr: ${p.aveExpr.toFixed(2)}\nlogFC: ${p.logFC.toFixed(3)}`}</title>
            </circle>
          ))}

          <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#d1d5db"/>
          {xTicks.map(t=>(
            <g key={t.v}>
              <line x1={t.x} y1={PH} x2={t.x} y2={PH+4} stroke="#d1d5db"/>
              <text x={t.x} y={PH+14} fill="#9ca3af" fontSize={9} textAnchor="middle">{t.v.toFixed(1)}</text>
            </g>
          ))}
          <text x={PW/2} y={PH+36} fill="#6b7280" fontSize={11} textAnchor="middle" fontWeight="600">Average Expression (AveExpr)</text>

          <line x1={0} y1={0} x2={0} y2={PH} stroke="#d1d5db"/>
          {yTicks.map(t=>(
            <g key={t.v}>
              <line x1={-4} y1={t.y} x2={0} y2={t.y} stroke="#d1d5db"/>
              <text x={-8} y={t.y+3} fill="#9ca3af" fontSize={9} textAnchor="end">{t.v.toFixed(2)}</text>
            </g>
          ))}
          <text transform={`translate(-44,${PH/2}) rotate(-90)`} fill="#6b7280" fontSize={11} textAnchor="middle" fontWeight="600">log₂ Fold Change</text>

          {[["up","#ef4444","Upregulated"],["down","#3b82f6","Downregulated"],["ns","#d1d5db","Not Significant"]].map(([,col,lbl],i)=>(
            <g key={lbl} transform={`translate(${PW-148},${10+i*18})`}>
              <circle cx={6} cy={6} r={4} fill={col}/>
              <text x={14} y={10} fill="#374151" fontSize={10}>{lbl}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}