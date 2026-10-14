import {
  classifyGene,
  getDataRange,
  getSummary,
  parseCSV,
} from './utils/parseCSV';

test('parses valid DEG rows and skips invalid rows', () => {
  const csv = [
    'GeneSymbol,logFC,AveExpr,t,P.Value,adj.P.Val,B',
    'GENE1,1.5,8,4,0.001,0.01,2',
    'GENE2,-1.2,7,-3,0.01,0.02,1',
    'INVALID,not-a-number,6,1,0.5,0.5,0',
  ].join('\n');

  expect(parseCSV(csv)).toHaveLength(2);
  expect(parseCSV(csv)[0]).toMatchObject({ geneSymbol: 'GENE1', logFC: 1.5 });
});

test('classifies genes and summarizes expression changes', () => {
  const genes = [
    { logFC: 1.5, pValue: 0.001, adjPVal: 0.01 },
    { logFC: -1.2, pValue: 0.01, adjPVal: 0.02 },
    { logFC: 0.2, pValue: 0.5, adjPVal: 0.5 },
  ];

  expect(classifyGene(genes[0], 1, 0.05)).toBe('up');
  expect(classifyGene(genes[1], 1, 0.05)).toBe('down');
  expect(getSummary(genes, 1, 0.05)).toEqual({
    total: 3,
    up: 1,
    down: 1,
    ns: 1,
  });
});

test('provides safe default plot ranges for empty data', () => {
  expect(getDataRange([])).toEqual({
    fcMin: -1,
    fcMax: 1,
    fcAbsMax: 1,
    negLogMax: 5,
    suggestedFC: 0,
    suggestedP: 0.05,
  });
});
