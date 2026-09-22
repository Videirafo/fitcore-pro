'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Json = Record<string, any>;

type ExerciseDraft = {
  name: string;
  slug: string;
  sets: number;
  reps: string;
  load: string;
  restSeconds: number;
  rir: string;
  rpe: string;
};

const blankExercise = (): ExerciseDraft => ({
  name: '',
  slug: '',
  sets: 3,
  reps: '8-12',
  load: '',
  restSeconds: 90,
  rir: '2',
  rpe: '8',
});

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.mensagem || data.erro || `HTTP ${response.status}`);
  return data;
}

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export function WorkoutBuilderVNextClient() {
  const [students, setStudents] = useState<Json[]>([]);
  const [templates, setTemplates] = useState<Json[]>([]);
  const [studentId, setStudentId] = useState('');
  const [title, setTitle] = useState('Treino VNext');
  const [objective, setObjective] = useState('hipertrofia');
  const [protocol, setProtocol] = useState('hypertrophy');
  const [periodization, setPeriodization] = useState('undulating');
  const [weeks, setWeeks] = useState(6);
  const [frequency, setFrequency] = useState(4);
  const [dayTitle, setDayTitle] = useState('A — Superior');
  const [dayFocus, setDayFocus] = useState('upper');
  const [blockTitle, setBlockTitle] = useState('Principal');
  const [exercises, setExercises] = useState<ExerciseDraft[]>([blankExercise()]);
  const [preview, setPreview] = useState<Json | null>(null);
  const [published, setPublished] = useState<Json | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([
      api('/api/mvp-23/students?limit=100').catch(() => ({ students: [] })),
      api('/api/vnext/workout-builder/templates').catch(() => ({ templates: [] })),
    ]).then(([studentResult, templateResult]) => {
      const list = studentResult.students || [];
      setStudents(list);
      setStudentId((current) => current || list[0]?.id || '');
      setTemplates(templateResult.templates || []);
    });
  }, []);

  const builder = useMemo(() => ({
    schema_version: 1,
    title,
    objective,
    frequency_per_week: frequency,
    protocol_code: protocol,
    periodization: { type: periodization, weeks },
    days: [{
      code: 'day_1',
      title: dayTitle,
      focus: dayFocus,
      blocks: [{
        code: 'main_block',
        title: blockTitle,
        type: 'main',
        exercises: exercises
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            slug: item.slug.trim() || slug(item.name),
            progression: { kind: 'load', step: 0, unit: 'kg' },
            sets: Array.from({ length: Math.max(1, Math.min(item.sets, 12)) }, (_, index) => ({
              order: index + 1,
              reps: item.reps || '8-12',
              load: item.load || null,
              rest_seconds: Math.max(0, Math.min(Number(item.restSeconds) || 90, 900)),
              rir_target: item.rir === '' ? null : Number(item.rir),
              rpe_target: item.rpe === '' ? null : Number(item.rpe),
            })),
          })),
      }],
    }],
  }), [blockTitle, dayFocus, dayTitle, exercises, frequency, objective, periodization, protocol, title, weeks]);

  function updateExercise(index: number, patch: Partial<ExerciseDraft>) {
    setExercises((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  }

  async function previewBuilder() {
    setState('loading');
    setMessage('');
    try {
      const result = await api('/api/vnext/workout-builder/preview', {
        method: 'POST',
        body: JSON.stringify(builder),
      });
      setPreview(result);
      setState('idle');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o preview.');
    }
  }

  async function publishPrescription(event: FormEvent) {
    event.preventDefault();
    if (!studentId) {
      setState('error');
      setMessage('Selecione um aluno.');
      return;
    }
    setState('loading');
    setMessage('');
    try {
      const result = await api('/api/vnext/workout-builder/prescriptions', {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId, builder }),
      });
      setPublished(result);
      setState('idle');
      setMessage('Prescrição criada e enviada para revisão.');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível publicar.');
    }
  }

  async function cloneTemplate(templateKey: string, version: number) {
    setState('loading');
    setMessage('');
    try {
      const result = await api(
        `/api/vnext/workout-builder/templates/${encodeURIComponent(templateKey)}/clone?version=${version}`,
      );
      const cloned = result.workout || {};
      setTitle(cloned.title || title);
      setObjective(cloned.objective || objective);
      setProtocol(cloned.protocol_code || protocol);
      setPeriodization(cloned.periodization?.type || periodization);
      setWeeks(Number(cloned.periodization?.weeks || weeks));
      setFrequency(Number(cloned.frequency_per_week || frequency));
      setPreview(result);
      setState('idle');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível clonar o template.');
    }
  }

  return (
    <div className="console-main-grid">
      <form className="panel console-primary-panel" onSubmit={publishPrescription}>
        <div className="panel-title">
          <div>
            <p className="eyebrow">Workout Builder VNext</p>
            <h2>Monte a prescrição</h2>
          </div>
          <button className="button secondary" type="button" onClick={previewBuilder} disabled={state === 'loading'}>
            Preview
          </button>
        </div>

        <div className="form-grid">
          <label>Aluno
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)} required>
              <option value="">Selecione</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.nome_publico}</option>)}
            </select>
          </label>
          <label>Nome do treino
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required />
          </label>
          <label>Objetivo
            <input value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={160} required />
          </label>
          <label>Frequência semanal
            <input type="number" min={1} max={7} value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} />
          </label>
          <label>Protocolo
            <select value={protocol} onChange={(event) => setProtocol(event.target.value)}>
              <option value="general">Geral</option>
              <option value="strength">Força</option>
              <option value="hypertrophy">Hipertrofia</option>
              <option value="conditioning">Condicionamento</option>
              <option value="mobility">Mobilidade</option>
            </select>
          </label>
          <label>Periodização
            <select value={periodization} onChange={(event) => setPeriodization(event.target.value)}>
              <option value="none">Sem periodização</option>
              <option value="linear">Linear</option>
              <option value="undulating">Ondulatória</option>
              <option value="block">Blocos</option>
            </select>
          </label>
          <label>Semanas
            <input type="number" min={1} max={52} value={weeks} onChange={(event) => setWeeks(Number(event.target.value))} />
          </label>
        </div>

        <div className="form-grid">
          <label>Dia
            <input value={dayTitle} onChange={(event) => setDayTitle(event.target.value)} />
          </label>
          <label>Foco do dia
            <input value={dayFocus} onChange={(event) => setDayFocus(event.target.value)} />
          </label>
          <label>Bloco
            <input value={blockTitle} onChange={(event) => setBlockTitle(event.target.value)} />
          </label>
        </div>

        <div className="rich-list37">
          {exercises.map((exercise, index) => (
            <article key={index}>
              <div className="form-grid">
                <label>Exercício
                  <input value={exercise.name} onChange={(event) => updateExercise(index, { name: event.target.value })} placeholder="Ex.: Supino reto" />
                </label>
                <label>Séries
                  <input type="number" min={1} max={12} value={exercise.sets} onChange={(event) => updateExercise(index, { sets: Number(event.target.value) })} />
                </label>
                <label>Repetições
                  <input value={exercise.reps} onChange={(event) => updateExercise(index, { reps: event.target.value })} />
                </label>
                <label>Carga alvo
                  <input value={exercise.load} onChange={(event) => updateExercise(index, { load: event.target.value })} placeholder="Ex.: 70kg" />
                </label>
                <label>Descanso
                  <input type="number" min={0} max={900} value={exercise.restSeconds} onChange={(event) => updateExercise(index, { restSeconds: Number(event.target.value) })} />
                </label>
                <label>RIR alvo
                  <input type="number" min={0} max={10} step="0.5" value={exercise.rir} onChange={(event) => updateExercise(index, { rir: event.target.value })} />
                </label>
                <label>RPE alvo
                  <input type="number" min={1} max={10} step="0.5" value={exercise.rpe} onChange={(event) => updateExercise(index, { rpe: event.target.value })} />
                </label>
              </div>
              {exercises.length > 1 ? (
                <button type="button" className="button secondary" onClick={() => setExercises((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  Remover exercício
                </button>
              ) : null}
            </article>
          ))}
        </div>

        <div className="hero-actions-inline">
          <button type="button" className="button secondary" onClick={() => setExercises((current) => [...current, blankExercise()])}>
            Adicionar exercício
          </button>
          <button type="submit" className="primary-pill" disabled={state === 'loading'}>
            Enviar para revisão
          </button>
        </div>
        {message ? <p role={state === 'error' ? 'alert' : 'status'}>{message}</p> : null}
      </form>

      <aside className="console-side-stack">
        <section className="panel">
          <h2>Preview</h2>
          {preview?.summary ? (
            <div className="rich-list37">
              <article><b>{preview.workout?.title || title}</b><span>{preview.summary.exercises} exercícios · {preview.summary.sets} séries</span></article>
              <article><b>{preview.summary.periodization_type}</b><span>{preview.summary.periodization_weeks} semanas · {preview.summary.frequency_per_week}x/semana</span></article>
            </div>
          ) : <p>Use Preview antes de publicar.</p>}
        </section>

        <section className="panel">
          <h2>Templates</h2>
          <div className="rich-list37">
            {templates.slice(0, 8).map((template) => (
              <article key={`${template.template_key}:${template.version}`}>
                <b>{template.title}</b>
                <span>{template.template_key} · v{template.version}</span>
                <button type="button" className="button secondary" onClick={() => cloneTemplate(template.template_key, template.version)}>
                  Clonar
                </button>
              </article>
            ))}
            {!templates.length ? <p>Nenhum template publicado.</p> : null}
          </div>
        </section>

        {published?.prescription ? (
          <section className="panel">
            <h2>Prescrição criada</h2>
            <p>Versão {published.prescription.prescription_version} · {published.prescription.exercises} exercícios · {published.prescription.sets} séries.</p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
