import { useMemo } from "react";
import { classifyGene } from "../utils/parseCSV";

export default function TopGenesChart({ genes, fcThreshold=0.5, pThreshold=0.05 }) {
  const top = useMemo(() => {
    return [...genes]
      .map(g => ({ ...g, type: classifyGene(g, fcThreshold, pThreshold) }))
      .filter(g => g.type !== "ns")
      .sort((a,b) => a.adjPVal - b.adjPVal)
      .slice(0, 20);
  }, [genes, fcThreshold, pThreshold]);

  if (top.length === 0) return (
    <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}>
      <div style={{fontSize:40,marginBottom:12}}>🔍</div>
      <p style={{fontWeight:600}}>No significant genes at current thresholds</p>
      <p style={{fontSize:13,marginTop:4}}>Try lowering the FC threshold using the slider above</p>
    </div>
  );

  const maxFC = Math.max(...top.map(g => Math.abs(g.logFC)));
  const BAR_MAX = 400;

  return (
    <div style={{ overflowX:"auto" }}>
      <div style={{ minWidth:500 }}>
        {top.map((g, i) => {
          const barW = (Math.abs(g.logFC) / maxFC) * BAR_MAX;
          const isUp = g.type === "up";
          return (
            <div key={g.id} style={{
              display:"flex", alignItems:"center", gap:12,
              padding:"7px 0", borderBottom:"1px solid #f3f4f6"
            }}>
              <div style={{ width:24, color:"#9ca3af", fontSize:11, textAlign:"right", flexShrink:0 }}>{i+1}</div>
              <div style={{ width:110, fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color: isUp?"#ef4444":"#3b82f6", flexShrink:0 }}>{g.geneSymbol}</div>
              <div style={{ flex:1, position:"relative", height:22 }}>
                <div style={{
                  position:"absolute", left:0, top:"50%", transform:"translateY(-50%)",
                  height:14, width:barW,
                  background: isUp ? "linear-gradient(90deg,#fca5a5,#ef4444)" : "linear-gradient(90deg,#93c5fd,#3b82f6)",
                  borderRadius:4, transition:"width 0.3s ease"
                }}/>
              </div>
              <div style={{ width:80, textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color: isUp?"#ef4444":"#3b82f6", flexShrink:0 }}>
                {g.logFC > 0 ? "+" : ""}{g.logFC.toFixed(4)}
              </div>
              <div style={{ width:80, textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#6b7280", flexShrink:0 }}>
                {g.adjPVal.toExponential(2)}
              </div>
            </div>
          );
        })}
        <div style={{ display:"flex", gap:12, paddingTop:8, paddingLeft:36 }}>
          <div style={{ width:110, fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase" }}>Gene</div>
          <div style={{ flex:1, fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase" }}>logFC magnitude</div>
          <div style={{ width:80, textAlign:"right", fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase" }}>logFC</div>
          <div style={{ width:80, textAlign:"right", fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase" }}>adj.P</div>
        </div>
      </div>
    </div>
  );
}