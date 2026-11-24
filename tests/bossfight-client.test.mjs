import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answerPayload, categoryOptions, createBossfightClient, normalizeQuestion} from '../src/lib/student/bossfight-client.js';

test('all real question types preserve option codes and category values', () => {
  const q = {text:'Question',options:[{option_code:'C',option_text:'Three'},{option_code:'A',option_text:'One'}],answer_keys:{options:['A']}};
  assert.deepEqual(answerPayload(q,0),{option_codes:['C']});
  assert.deepEqual(answerPayload({...q,type:'PGK_MA'},[0,1]),{option_codes:['A','C']});
  assert.deepEqual(answerPayload({type:'PGK_KATEGORI'},{1:'Benar'}),{category_answers:{1:'Benar'}});
  assert.equal(normalizeQuestion(q,'Math').answer,1);
  assert.deepEqual(categoryOptions([{category_label:'Benar / Salah'},{category_label:'Benar / Salah'}]),['Benar','Salah']);
});
test('authenticated bootstrap and identical batch retry use no-store and unchanged body', async () => {
  const calls=[];
  const client=createBossfightClient(async () => 'token', async (url,init) => { calls.push({url,...init}); return {ok:true,json:async()=>({data:{used:1}})}; });
  await client();
  assert.equal(calls[0].method,'GET'); assert.equal(calls[0].headers.Authorization,'Bearer token');
  const payload={action:'batch',attempt_id:'attempt',records:[{question_id:'q',answer_payload:{},is_timeout:true,heal:false}]};
  await client(payload); await client(payload);
  assert.equal(calls[1].body,calls[2].body); assert.equal(calls[1].cache,'no-store');
});
test('missing session and API failures are surfaced, never fabricated success', async () => {
  await assert.rejects(createBossfightClient(async()=>null)(),/login/);
  const client=createBossfightClient(async()=> 'token', async()=>({ok:false,json:async()=>({error:'Conflict'})}));
  await assert.rejects(client({action:'start'}),/Conflict/);
});
test('arena removes mock rewards and only displays finished server results', () => {
  const ui=readFileSync(new URL('../src/components/student/fightboss/BossFightArena.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(ui,/MOCK_QUESTIONS|Hadiah demo|correctCount \* 50/);
  assert.match(ui,/serverResult && gameStatus/);
  assert.match(ui,/action: "finish"/);
  assert.match(ui,/Riwayat parsial/);
  assert.match(ui,/SHOW_TIPS: "0"/);
  assert.equal((ui.match(/onClick=\{resetToReady\}/g) || []).length, 2);
  const reset = ui.slice(ui.indexOf('function resetToReady()'), ui.indexOf('async function restart()'));
  assert.match(reset, /setSession\(null\)/);
  assert.match(reset, /setQuestionOpen\(false\)/);
  assert.match(reset, /setGameStatus\("playing"\)/);
  assert.doesNotMatch(reset, /request\(|restart\(/);
  assert.match(ui, /Tepat! Pukulan masuk/);
  assert.match(ui, /CRITICAL! Flying kick/);
  assert.match(ui, /Belum tepat! Boss membalas dengan double smash\./);
  assert.match(ui, /Waktu habis! Boss melakukan double smash\./);
  assert.match(ui,/setTimeout\(resolve, 2200\)/);
  assert.match(ui,/setQuestionOpen\(!next.terminal\)/);
  assert.match(ui,/Number\(settings.MAX_QUESTIONS \|\| 5\)/);
  const answer = ui.slice(ui.indexOf('const answer = async'), ui.indexOf('useEffect(() => {', ui.indexOf('const answer = async')));
  assert.ok(answer.indexOf('setQuestionOpen(false)') < answer.indexOf('setImpact('));
  assert.ok(answer.indexOf('setTimeout(resolve, 2200)') < answer.indexOf('await acceptSession(next)'));
});
