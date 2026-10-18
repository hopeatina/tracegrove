import { join } from 'node:path';
import { z } from 'zod';
import { WorkflowKnowledgeQuery, IdString } from '../protocol/index.ts';
import { VerifiedBundleSnapshot } from '../core/bundle.ts';
import { WorkflowKnowledgeSnapshot } from '../core/workflowKnowledge.ts';
import { SavedRunName } from './runReport.ts';
import { savedRunDirectory } from './runLocation.ts';

const Run=SavedRunName.refine(name=>name!=='latest');
const Detail=z.object({run:Run,cell:IdString.optional()}).strict();
const Search=z.object({run:Run,text:WorkflowKnowledgeQuery.shape.text,case:IdString.optional(),workflow:IdString.optional(),
  surface:WorkflowKnowledgeQuery.shape.surface,tag:IdString.optional(),route:WorkflowKnowledgeQuery.shape.route,
  cursor:WorkflowKnowledgeQuery.shape.cursor,limit:z.string().regex(/^(?:[1-9][0-9]?|100)$/).optional()}).strict();
/** Named retained runs only; native-import archives never supply execution knowledge. */
export function savedWorkflowKnowledge(root:string,url:URL) {
  const values=Object.fromEntries(url.searchParams);
  if([...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1))return {status:400,body:{error:'Select one named run and non-duplicated lookup options.'}};
  const query=url.pathname==='/api/workflow-map'?Detail.safeParse(values):Search.safeParse(values);
  if(!query.success)return {status:400,body:{error:'Select one named run and valid lookup options.'}};
  try{
    const snapshot=WorkflowKnowledgeSnapshot.capture(VerifiedBundleSnapshot.open(join(savedRunDirectory(root,query.data.run),'bundle')));
    if(url.pathname==='/api/workflow-map'){
      const detail=Detail.parse(values),report=snapshot.report;
      return {status:200,body:detail.cell?{snapshotRef:report.ref,evidence:report.evidence,entry:snapshot.get(detail.cell)}:report};
    }
    const search=Search.parse(values),{run,limit,case:caseId,workflow:workflowId,...filters}=search;
    return {status:200,body:snapshot.search({...filters,...(caseId?{caseId}:{}),...(workflowId?{workflowId}:{}),...(limit?{limit:Number(limit)}:{})})};
  }catch{return {status:409,body:{error:'Recorded workflow knowledge is unavailable or changed. Select a retained run and retry inspection.'}}}
}
