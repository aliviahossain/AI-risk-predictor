import { useMemo } from "react";
import { classifyGene } from "../utils/parseCSV";

const W=700, H=440, PAD={top:30,right:30,bottom:54,left:60};
const PW = W-PAD.left-PAD.right, PH = H-PAD.top-PAD.bottom;
const C  = { up:"#ef4444", down:"#3b82f6", ns:"#d1d5db" };

export default function VolcanoPlot({ genes, fcThreshold=0.5, pThreshold=0.05 }) {
  const { points, labeled, xMin, xMax, yMax, pLine, scaleX, scaleY, xTicks, yTicks } = useMemo(() => {
    if (!genes?.length) return {};
    const eps   = 1e-300;
    const logFCs = genes.map((g) => g.logFC);
    const xPad   = (Math.max(...logFCs) - Math.min(...logFCs)) * 0.1;
    const xMin   = Math.min(...logFCs) - xPad;
    const xMax   = Math.max(...logFCs) + xPad;
    const negLogs= genes.map((g) => -Math.log10(Math.max(g.adjPVal, eps)));
    const yMax   = Math.max(...negLogs) * 1.1;

    const scaleX = (v) => ((v - xMin) / (xMax - xMin)) * PW;
    const scaleY = (v) => PH - (v / yMax) * PH;
    const pLine  = -Math.log10(pThreshold);

    const points = genes.map((g) => ({
      ...g,
      cx:   scaleX(g.logFC),
      cy:   scaleY(-Math.log10(Math.max(g.adjPVal, eps))),
      type: classifyGene(g, fcThreshold, pThreshold),
      nl:   -Math.log10(Math.max(g.adjPVal, eps)),
    }));

    const labeled = [...points]
      .filter((p) => p.type !== "ns")
      .sort((a,b) => b.nl - a.nl)
      .slice(0, 8);

    const xStep = (xMax - xMin) / 6;
    const xTicks = Array.from({length:7}, (_,i) => ({ v: xMin+i*xStep, x: scaleX(xMin+i*xStep) }));
    const yStep  = yMax / 5;
    const yTicks = Array.from({length:6}, (_,i) => ({ v: i*yStep, y: scaleY(i*yStep) }));

    return { points, labeled, xMin, xMax, yMax, pLine, scaleX, scaleY, xTicks, yTicks };
  }, [genes, fcThreshold, pThreshold]);

  if (!points) return null;

  return (
    <div style={{width:"100%",overflowX:"auto"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,display:"block",margin:"0 auto",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          <rect x={0} y={0} width={PW} height={PH} fill="#fafafa" rx={6} stroke="#e5e7eb"/>

          {/* Grid */}
          {yTicks.map((t) => <line key={t.v} x1={0} y1={t.y} x2={PW} y2={t.y} stroke="#f3f4f6" strokeWidth={1}/>)}

          {/* P threshold line */}
          <line x1={0} y1={scaleY(pLine)} x2={PW} y2={scaleY(pLine)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6,4"/>
          <text x={PW-6} y={scaleY(pLine)-5} fill="#f59e0b" fontSize={9} textAnchor="end" fontWeight="600">p={pThreshold}</text>

          {/* FC threshold lines */}
          {[-fcThreshold, fcThreshold].map((fc) => (
            <line key={fc} x1={scaleX(fc)} y1={0} x2={scaleX(fc)} y2={PH}
              stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6,4"/>
          ))}

          {/* NS points first */}
          {points.filter(p=>p.type==="ns").map((p,i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={3} fill={C.ns} opacity={0.5}>
              <title>{`${p.geneSymbol}\nlogFC: ${p.logFC.toFixed(3)}\nadj.P: ${p.adjPVal.toExponential(2)}`}</title>
            </circle>
          ))}
          {/* Significant points on top */}
          {points.filter(p=>p.type!=="ns").map((p,i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={4.5} fill={C[p.type]} opacity={0.85} stroke="#fff" strokeWidth={0.5}>
              <title>{`${p.geneSymbol}\nlogFC: ${p.logFC.toFixed(3)}\nadj.P: ${p.adjPVal.toExponential(2)}`}</title>
            </circle>
          ))}

          {/* Gene labels */}
          {labeled.map((p,i) => (
            <g key={i}>
              <line x1={p.cx} y1={p.cy-5} x2={p.cx} y2={p.cy-16} stroke={C[p.type]} strokeWidth={1}/>
              <text x={p.cx} y={p.cy-18} fill={C[p.type]} fontSize={9} fontWeight="700" textAnchor="middle" fontFamily="'JetBrains Mono',monospace">{p.geneSymbol}</text>
            </g>
          ))}

          {/* Axes */}
          <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#d1d5db"/>
          {xTicks.map((t) => (
            <g key={t.v}>
              <line x1={t.x} y1={PH} x2={t.x} y2={PH+4} stroke="#d1d5db"/>
              <text x={t.x} y={PH+14} fill="#9ca3af" fontSize={9} textAnchor="middle">{t.v.toFixed(2)}</text>
            </g>
          ))}
          <text x={PW/2} y={PH+36} fill="#6b7280" fontSize={11} textAnchor="middle" fontWeight="600">log₂ Fold Change</text>

          <line x1={0} y1={0} x2={0} y2={PH} stroke="#d1d5db"/>
          {yTicks.map((t) => (
            <g key={t.v}>
              <line x1={-4} y1={t.y} x2={0} y2={t.y} stroke="#d1d5db"/>
              <text x={-8} y={t.y+3} fill="#9ca3af" fontSize={9} textAnchor="end">{t.v.toFixed(1)}</text>
            </g>
          ))}
          <text transform={`translate(-44,${PH/2}) rotate(-90)`} fill="#6b7280" fontSize={11} textAnchor="middle" fontWeight="600">-log₁₀(adj.P)</text>

          {/* Legend */}
          {[["up","#ef4444","Upregulated"],["down","#3b82f6","Downregulated"],["ns","#d1d5db","Not Significant"]].map(([,col,lbl],i)=>(
            <g key={lbl} transform={`translate(${PW-148},${10+i*18})`}>
              <circle cx={6} cy={6} r={5} fill={col}/>
              <text x={16} y={10} fill="#374151" fontSize={10}>{lbl}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}