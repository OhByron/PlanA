import { useState } from 'react';
import { Button, Input } from '@projecta/ui';
import type { AcceptanceCriterion } from '@projecta/types';
import type { UseMutationResult } from '@tanstack/react-query';
import { ContextHelp } from './context-help';

interface AiSuggestion {
  given: string;
  when: string;
  then: string;
}

export interface AcceptanceCriteriaSectionProps {
  criteria: AcceptanceCriterion[];
  createAC: UseMutationResult<AcceptanceCriterion, Error, { given_clause: string; when_clause: string; then_clause: string }>;
  updateAC: UseMutationResult<AcceptanceCriterion, Error, { acId: string; data: Record<string, unknown> }>;
  deleteAC: UseMutationResult<void, Error, string>;
  aiLoading: boolean;
  aiSuggestions: AiSuggestion[];
  aiQuestions: string[];
  onSuggestAC: () => void;
  onSetAiSuggestions: (suggestions: AiSuggestion[]) => void;
}

export function AcceptanceCriteriaSection({
  criteria,
  createAC,
  updateAC,
  deleteAC,
  aiLoading,
  aiSuggestions,
  aiQuestions,
  onSuggestAC,
  onSetAiSuggestions,
}: AcceptanceCriteriaSectionProps) {
  const [showACForm, setShowACForm] = useState(false);
  const [acDraft, setAcDraft] = useState({ given: '', when: '', then: '' });
  const [editingACId, setEditingACId] = useState<string | null>(null);
  const [editingACData, setEditingACData] = useState({ given: '', when: '', then: '' });

  const submitAC = () => {
    if (acDraft.given || acDraft.when || acDraft.then) {
      createAC.mutate({
        given_clause: acDraft.given,
        when_clause: acDraft.when,
        then_clause: acDraft.then,
      });
      setAcDraft({ given: '', when: '', then: '' });
      setShowACForm(false);
    }
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Acceptance Criteria
          </h2>
          <ContextHelp>
            Acceptance Criteria define when this item is truly "done." Written in
            <strong> Given / When / Then</strong> format (BDD), they make expectations
            explicit and testable. Each criterion is a specific, verifiable condition —
            not a vague wish.
          </ContextHelp>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowACForm(!showACForm)}
          >
            + Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSuggestAC}
            disabled={aiLoading}
          >
            {aiLoading ? 'Thinking...' : '\u2728 Suggest AC'}
          </Button>
        </div>
      </div>

      {criteria.length === 0 && !showACForm && (
        <p className="text-sm text-gray-400">
          No acceptance criteria yet. Define the conditions for "done".
        </p>
      )}

      {criteria.map((ac) =>
        editingACId === ac.id ? (
          <div key={ac.id} className="mb-3 rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-12 text-right text-xs font-medium text-gray-400">Given</span>
              <Input value={editingACData.given} onChange={(e) => setEditingACData({ ...editingACData, given: e.target.value })} className="flex-1" aria-label="Given clause" />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-right text-xs font-medium text-gray-400">When</span>
              <Input value={editingACData.when} onChange={(e) => setEditingACData({ ...editingACData, when: e.target.value })} className="flex-1" aria-label="When clause" />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-right text-xs font-medium text-gray-400">Then</span>
              <Input value={editingACData.then} onChange={(e) => setEditingACData({ ...editingACData, then: e.target.value })} className="flex-1" aria-label="Then clause" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => {
                updateAC.mutate({
                  acId: ac.id,
                  data: { given_clause: editingACData.given, when_clause: editingACData.when, then_clause: editingACData.then },
                });
                setEditingACId(null);
              }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingACId(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div
            key={ac.id}
            className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 cursor-pointer hover:border-gray-300"
            onClick={() => {
              setEditingACId(ac.id);
              setEditingACData({ given: ac.given, when: ac.when, then: ac.then });
            }}
          >
            <div className="flex justify-between">
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-medium text-gray-500">Given </span>
                  <span className="text-gray-900">{ac.given}</span>
                </p>
                <p>
                  <span className="font-medium text-gray-500">When </span>
                  <span className="text-gray-900">{ac.when}</span>
                </p>
                <p>
                  <span className="font-medium text-gray-500">Then </span>
                  <span className="text-gray-900">{ac.then}</span>
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteAC.mutate(ac.id); }}
                className="ml-2 self-start text-gray-400 hover:text-red-500"
                title="Delete"
                aria-label="Delete acceptance criterion"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ),
      )}

      {showACForm && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-2">
          <Input
            placeholder="Given..."
            value={acDraft.given}
            onChange={(e) => setAcDraft({ ...acDraft, given: e.target.value })}
            aria-label="Given clause"
          />
          <Input
            placeholder="When..."
            value={acDraft.when}
            onChange={(e) => setAcDraft({ ...acDraft, when: e.target.value })}
            aria-label="When clause"
          />
          <Input
            placeholder="Then..."
            value={acDraft.then}
            onChange={(e) => setAcDraft({ ...acDraft, then: e.target.value })}
            aria-label="Then clause"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={submitAC}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowACForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {aiSuggestions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-brand-600">AI Suggestions — click to add:</p>
          {aiSuggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                createAC.mutate({ given_clause: s.given, when_clause: s.when, then_clause: s.then });
                onSetAiSuggestions(aiSuggestions.filter((_, j) => j !== i));
              }}
              className="w-full rounded-lg border border-brand-200 bg-brand-50/30 p-3 text-left text-sm hover:bg-brand-50"
            >
              <p><span className="font-medium text-gray-500">Given </span>{s.given}</p>
              <p><span className="font-medium text-gray-500">When </span>{s.when}</p>
              <p><span className="font-medium text-gray-500">Then </span>{s.then}</p>
            </button>
          ))}
        </div>
      )}

      {aiQuestions.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700 mb-1">The AI needs more information:</p>
          {aiQuestions.map((q, i) => (
            <p key={i} className="text-sm text-amber-800">{'\u2022'} {q}</p>
          ))}
        </div>
      )}
    </section>
  );
}
