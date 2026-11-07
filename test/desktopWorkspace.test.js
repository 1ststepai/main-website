import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDesktopWorkspaceUpdate, desktopWorkspaceView, mergeDesktopWorkspace } from '../lib/admin/desktopWorkspace.js';
import { createEmptyWorkspace, normalizeWorkspace } from '../lib/admin/workspaceModel.js';
import { newsletterQuoteTemplate, newsletterQuoteOverrides } from '../lib/admin/newsletterQuote.js';

test('desktop workspace permits draft work but forbids pricing, issued quotes and delivery/payment changes',()=>{
  const initial=createEmptyWorkspace();initial.clients=[{id:'client_1',company:'Example',contact_name:'Owner'}];initial.templates.push(newsletterQuoteTemplate());initial.quotes=[{...newsletterQuoteOverrides('item_1'),id:'quote_1',client_id:'client_1',quote_number:'FS-0001',status:'sent',valid_until:'2026-11-01',line_items:[{id:'item_1',name:'Newsletter',quantity:1,rate:600}]}];
  const current=normalizeWorkspace(initial);
  const draft=structuredClone(current.quotes[0]); draft.id='desktop-draft';draft.status='draft';draft.payment_links=[];draft.sent_at=null;draft.delivery_id=null;draft.last_contacted_at=null;draft.follow_up_due='';draft.follow_up_count=0;
  current.quotes.push(draft);
  const general={...structuredClone(draft),id:'website-draft',quote_number:'FS-0099',contract_template_id:'website-build'};current.quotes.push(general);
  const view=desktopWorkspaceView(current);assert.equal(view.quotes.length,2);assert.equal(view.next_quote_sequence,100);assert.ok(view.quotes.every(q=>q.contract_template_id==='newsletter-pilot'));
  const edited=structuredClone(view);edited.quotes[1].summary='Newsletter edit';const merged=mergeDesktopWorkspace(current,edited);assert.doesNotThrow(()=>assertDesktopWorkspaceUpdate(current,merged));assert.deepEqual(merged.quotes.find(q=>q.id===general.id),general,'hidden website quote preserved');
  const generalAttempt=structuredClone(view);generalAttempt.quotes.push(general);assert.throws(()=>mergeDesktopWorkspace(current,generalAttempt),e=>e.statusCode===403);
  current.quotes.pop();
  const next=structuredClone(current);next.quotes.at(-1).summary='A revised draft';next.clients[0].contact_name='Updated contact';assert.doesNotThrow(()=>assertDesktopWorkspaceUpdate(current,normalizeWorkspace(next)));
  for(const change of [
    w=>{w.pricing_settings.default_deposit_percent=99;},
    w=>{w.templates[0].name='Changed';},
    w=>{w.quotes[0].summary='Changed issued quote';},
    w=>{w.quotes.shift();},
    w=>{w.quotes.at(-1).status='sent';},
    w=>{w.quotes.at(-1).delivery_id='invented-receipt';},
    w=>{w.quotes.at(-1).sent_at=new Date().toISOString();},
    w=>{w.quotes.at(-1).payment_links=[{id:'fake'}];},
    w=>{w.quotes.push({...draft,id:'new-issued',status:'approved'});},
  ]){const blocked=structuredClone(current);change(blocked);assert.throws(()=>assertDesktopWorkspaceUpdate(current,blocked),e=>e.statusCode===403);}
  const empty=normalizeWorkspace(createEmptyWorkspace());const withPilot=normalizeWorkspace({...empty,templates:[...empty.templates,newsletterQuoteTemplate()]});assert.doesNotThrow(()=>assertDesktopWorkspaceUpdate(empty,withPilot));
  const forged=structuredClone(withPilot);forged.templates.at(-1).name='Forged';assert.throws(()=>assertDesktopWorkspaceUpdate(empty,forged),e=>e.statusCode===403);
});
