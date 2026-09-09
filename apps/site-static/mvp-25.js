const els = {
  session: document.querySelector("#session-card"), workoutsOut: document.querySelector("#workouts-output"), detail: document.querySelector("#execution-detail"),
  executionsOut: document.querySelector("#executions-output"), finishForm: document.querySelector("#finish-form"), finishOut: document.querySelector("#finish-output"),
  search: document.querySelector("#search"), status: document.querySelector("#status-filter"), refresh: document.querySelector("#refresh"), loadWorkouts: document.querySelector("#load-workouts"),
};
let currentExecutionId = null;
function safe(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
async function api(path, options = {}) {
  const res = await fetch(path, { cache: "no-store", credentials: "include", headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const text = await res.text(); const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.mensagem || data.erro || `HTTP ${res.status}`); return data;
}
function formBody(form) { const raw = Object.fromEntries(new FormData(form).entries()); return Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, String(v || "").trim()]).filter(([,v]) => v)); }
async function refreshSession() {
  try { const data = await api(`/api/mvp-15/session?v=${Date.now()}`); const s = data.current_session;
    if (!s) { els.session.innerHTML = `<strong>Login necessário</strong><span>Entre para executar treino.</span><a class="button secondary" href="/mvp-19.html">Entrar</a>`; return null; }
    els.session.innerHTML = `<strong>${safe(s.actor_role)} · ${safe(s.actor_name)}</strong><span>tenant ${safe(s.tenant_slug)} · sessão assinada · RBAC ativo</span>`; return s;
  } catch (e) { els.session.innerHTML = `<strong>Erro</strong><span>${safe(e.message)}</span>`; return null; }
}
function renderExecutions(data, target = els.executionsOut) {
  const items = data.executions || [];
  target.innerHTML = `<div class="item"><strong>Tenant ${safe(data.tenant_slug)}</strong><span>${safe(data.total)} execução(ões) · ${safe(data.em_execucao || 0)} em andamento · ${safe(data.concluidos || 0)} concluída(s)</span></div>` +
    (items.map((item) => `<div class="item"><span class="badge">${safe(item.status)}</span><strong>${safe(item.nome_treino)}</strong><span>${safe(item.student_name || "aluno")} · ${safe(item.progresso_percentual)}% · esforço ${safe(item.percepcao_esforco || "-")}/10</span><small>${safe(item.exercicios_feitos)}/${safe(item.exercicios_total)} exercícios · ${safe(item.duracao_minutos || "-")} min</small><button type="button" data-execution-id="${safe(item.id)}">Ver execução</button></div>`).join("") || '<div class="item">Nenhuma execução encontrada.</div>');
}
function renderWorkouts(data) {
  const items = data.prescriptions || [];
  els.workoutsOut.innerHTML = items.map((item) => `<div class="item"><span class="badge">${safe(item.status)}</span><strong>${safe(item.nome_treino)}</strong><span>${safe(item.student_name)} · ${safe(item.objetivo)} · ${safe(item.dias_semana)}x/semana</span><button type="button" data-start-workout="${safe(item.id)}">Iniciar treino</button></div>`).join("") || '<div class="item">Nenhum treino aprovado para este aluno.</div>';
}
function renderExecution(execution) {
  currentExecutionId = execution.id;
  els.detail.innerHTML = `<strong>${safe(execution.nome_treino)}</strong><span>${safe(execution.status)} · ${safe(execution.progresso_percentual)}% concluído · ${safe(execution.exercicios_feitos)}/${safe(execution.exercicios_total)}</span><small>${safe(execution.orientacoes || "Sem orientação extra.")}</small>` +
    (execution.exercise_progress || []).map((ex) => `<div class="exercise-row"><span><strong>${safe(ex.nome)}</strong><br><small>${safe(ex.status)} ${ex.feito_em ? '· ' + safe(ex.feito_em) : ''}</small></span><button type="button" data-done-index="${safe(ex.index)}" ${ex.status === 'feito' || execution.status !== 'em_execucao' ? 'disabled' : ''}>Marcar feito</button></div>`).join("");
}
async function loadWorkouts() { try { renderWorkouts(await api('/api/mvp-24/my-workouts?status=aprovado&limit=30')); } catch(e) { els.workoutsOut.innerHTML = `<div class="item"><strong>Não carregou</strong><span>${safe(e.message)}</span><a class="button secondary" href="/mvp-19.html">Entrar</a></div>`; } }
async function loadExecutions() { try { const p = new URLSearchParams(); if (els.search.value.trim()) p.set('search', els.search.value.trim()); if (els.status.value) p.set('status', els.status.value); p.set('limit','40'); renderExecutions(await api(`/api/mvp-25/executions?${p}`)); } catch(e) { els.executionsOut.innerHTML = `<div class="item"><strong>Acompanhamento indisponível</strong><span>${safe(e.message)}</span></div>`; } }
async function loadMyExecutions() { try { renderExecutions(await api('/api/mvp-25/my-executions?limit=20'), els.executionsOut); } catch {} }
async function startWorkout(id) { const data = await api('/api/mvp-25/executions/start', { method:'POST', body: JSON.stringify({ workout_id: id }) }); renderExecution(data.execution); await loadMyExecutions(); }
async function loadExecution(id) { const data = await api(`/api/mvp-25/executions/${encodeURIComponent(id)}?v=${Date.now()}`); renderExecution(data.execution); }
async function markDone(index) { const data = await api(`/api/mvp-25/executions/${encodeURIComponent(currentExecutionId)}/exercises/${index}/done`, { method:'POST', body: JSON.stringify({ observacao: 'marcado na interface do aluno' }) }); renderExecution(data.execution); await loadMyExecutions(); }
async function finish(e) { e.preventDefault(); if (!currentExecutionId) { els.finishOut.textContent = 'Inicie ou selecione uma execução.'; return; } try { const data = await api(`/api/mvp-25/executions/${encodeURIComponent(currentExecutionId)}/finish`, { method:'POST', body: JSON.stringify(formBody(els.finishForm)) }); renderExecution(data.execution); els.finishOut.innerHTML = `<strong>Treino concluído</strong><span>${safe(data.execution.duracao_minutos)} min · esforço ${safe(data.execution.percepcao_esforco)}/10</span>`; await loadMyExecutions(); } catch(err) { els.finishOut.innerHTML = `<strong>Erro</strong><span>${safe(err.message)}</span>`; } }
document.addEventListener('click', async (event) => { const start = event.target.closest('[data-start-workout]'); if (start) await startWorkout(start.dataset.startWorkout); const done = event.target.closest('[data-done-index]'); if (done) await markDone(done.dataset.doneIndex); const ex = event.target.closest('[data-execution-id]'); if (ex) await loadExecution(ex.dataset.executionId); });
els.refresh?.addEventListener('click', loadExecutions); els.loadWorkouts?.addEventListener('click', loadWorkouts); els.finishForm?.addEventListener('submit', finish);
refreshSession().then((s) => { if (s?.actor_role === 'aluno') { loadWorkouts(); loadMyExecutions(); } else { loadExecutions(); } });
