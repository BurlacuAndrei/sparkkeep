import React, { useState, useMemo } from 'react';
import { Eye, Search, Sparkles, ExternalLink, Zap, CheckCircle2 } from 'lucide-react';
import { Card, PlaybookStep } from '../../types';
import { CORE_STEP_DESCRIPTIONS, getDefaultInputsForStep } from './constants';

export interface MockDryRunCard {
  id: number;
  title: string;
  url: string;
  type: string;
  content: string;
  sources: string[];
}

// oxlint-disable-next-line react/only-export-components
export const FALLBACK_TEST_CARDS: MockDryRunCard[] = [
  {
    id: -1,
    title: 'Neon Serverless Postgres',
    url: 'https://neon.tech',
    type: 'tool',
    content: 'Serverless Postgres database architecture separating storage and compute with instant branching and autoscaling to zero.',
    sources: [
      'https://neon.tech/docs/introduction/architecture',
      'https://github.com/neondatabase/neon',
      'https://news.ycombinator.com/item?id=31548177',
    ],
  },
  {
    id: -2,
    title: 'DeepSeek-R1 Technical Report',
    url: 'https://arxiv.org/abs/2501.12948',
    type: 'paper',
    content: 'Incentivizing reasoning capability in LLMs via large-scale reinforcement learning without supervised fine-tuning.',
    sources: [
      'https://arxiv.org/pdf/2501.12948.pdf',
      'https://github.com/deepseek-ai/DeepSeek-R1',
      'https://huggingface.co/deepseek-ai/DeepSeek-R1',
    ],
  },
  {
    id: -3,
    title: 'Stripe Agentic Commerce Protocol',
    url: 'https://stripe.com/blog/agentic-commerce',
    type: 'product',
    content: 'Framework and APIs enabling autonomous AI agents to initiate checkouts, sign transaction payloads, and execute multi-party settlements securely.',
    sources: [
      'https://docs.stripe.com/agents/overview',
      'https://stripe.com/newsroom/news/agentic-payments',
    ],
  },
];

export interface CompiledStepPreview {
  position: number;
  name: string;
  kind: string;
  heading: string;
  role: string;
  tool_policy: string;
  max_queries: number;
  plannedQueries: string[];
  compiledPrompt: string;
  simulatedOutput: string;
}

// oxlint-disable-next-line react/only-export-components
export function compileStepForDryRun(
  step: PlaybookStep,
  card: { title: string; url: string; type: string; content: string; sources: string[] },
  prevStepNames: string[]
): CompiledStepPreview {
  const role = step.config?.role || (step.kind === 'plan' ? 'research_plan' : 'research_synthesis');
  const toolPolicy = step.config?.tool_policy || (step.kind === 'search' ? 'search' : 'none');
  const maxQueries = step.config?.max_queries ?? 2;
  const heading = step.config?.output_heading || step.name;

  // Planned queries compilation
  const plannedQueries: string[] = [];
  if (toolPolicy === 'search') {
    plannedQueries.push(`"${card.title}" ${card.type} architecture`);
    if (maxQueries >= 2) {
      plannedQueries.push(`"${card.title}" alternatives pricing reviews`);
    }
    if (maxQueries >= 3) {
      let host = card.url;
      try {
        host = new URL(card.url).hostname;
      } catch {
        // ignore
      }
      plannedQueries.push(`site:${host} benchmarks whitepaper`);
    }
    for (let q = 4; q <= maxQueries; q++) {
      plannedQueries.push(`"${card.title}" query plan ${q}`);
    }
  }

  // Raw instruction
  const rawInstruction =
    step.config?.instruction ||
    CORE_STEP_DESCRIPTIONS[step.kind] ||
    'Synthesize analysis from input context.';

  // Variable substitutions ({card_title}, {card_url}, {card_content}, {card_type}, {sources}, {source_urls}, {previous_steps})
  const compiled = rawInstruction
    .replace(/\{card_title\}/g, card.title)
    .replace(/\{card_url\}/g, card.url)
    .replace(/\{card_content\}/g, card.content)
    .replace(/\{card_type\}/g, card.type)
    .replace(/\{sources\}/g, card.sources.map((s, i) => `[S${i + 1}] ${s}`).join('\n'))
    .replace(/\{source_urls\}/g, card.sources.join(', '))
    .replace(
      /\{previous_steps\}/g,
      prevStepNames.length > 0 ? prevStepNames.join(', ') : 'None'
    );

  // Active inputs context preamble
  const activeInputs = step.config?.inputs || getDefaultInputsForStep(step);
  const contextLines: string[] = [];
  if (activeInputs.includes('capture')) {
    contextLines.push(`[CARD CONTEXT]: "${card.title}" (${card.url})\n${card.content}`);
  }
  if (activeInputs.includes('sources') && card.sources.length > 0) {
    contextLines.push(
      `[EXTRACTED SOURCES]:\n${card.sources.map((s, i) => `[S${i + 1}] ${s}`).join('\n')}`
    );
  }
  if (activeInputs.includes('previous_steps') && prevStepNames.length > 0) {
    contextLines.push(`[PREVIOUS STEPS AVAILABLE]: ${prevStepNames.join(' → ')}`);
  }

  const fullPrompt =
    contextLines.length > 0
      ? `${contextLines.join('\n\n')}\n\n[INSTRUCTION]:\n${compiled}`
      : compiled;

  const simulatedOutput = `### ${heading}\n\nAnalysis for **${card.title}** synthesized according to pipeline specifications [S1]. Key takeaways and strategic implications verified against authoritative sources [S2].`;

  return {
    position: step.position,
    name: step.name,
    kind: step.kind,
    heading,
    role,
    tool_policy: toolPolicy,
    max_queries: maxQueries,
    plannedQueries,
    compiledPrompt: fullPrompt,
    simulatedOutput,
  };
}

export interface DryRunInspectorProps {
  steps: PlaybookStep[];
  cards?: Card[];
}

export const DryRunInspector: React.FC<DryRunInspectorProps> = ({ steps, cards = [] }) => {
  const [selectedCardId, setSelectedCardId] = useState<string>(
    cards.length > 0 ? String(cards[0].id) : '-1'
  );

  // Resolved test card
  const activeCard = useMemo(() => {
    const numId = parseInt(selectedCardId, 10);
    const existingCard = cards.find((c) => c.id === numId);
    if (existingCard) {
      const cardUrl = existingCard.source_url || 'https://example.com';
      const refUrls = (existingCard.references || [])
        .map((r) => r.url)
        .filter((u): u is string => Boolean(u));
      const allSources = refUrls.length > 0 ? refUrls : [cardUrl];

      return {
        id: existingCard.id,
        title: existingCard.title,
        url: cardUrl,
        type: existingCard.type || 'tool',
        content:
          existingCard.source_note ||
          existingCard.summary ||
          existingCard.executive_summary ||
          'Saved card research context.',
        sources: allSources,
      };
    }
    const fallback = FALLBACK_TEST_CARDS.find((f) => f.id === numId);
    return fallback || FALLBACK_TEST_CARDS[0];
  }, [selectedCardId, cards]);

  // Compile enabled steps sequentially
  const compiledSteps = useMemo(() => {
    const enabled = steps.filter((s) => s.enabled);
    const results: CompiledStepPreview[] = [];
    const prevNames: string[] = [];

    for (const step of enabled) {
      const compiled = compileStepForDryRun(step, activeCard, [...prevNames]);
      results.push(compiled);
      prevNames.push(step.name);
    }
    return results;
  }, [steps, activeCard]);

  return (
    <div className="pb-dryrun-container" aria-label="Dry-Run Inspector Panel">
      <div className="pb-dryrun-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={18} className="pb-dryrun-icon" />
          <div>
            <h4 className="pb-dryrun-title">Dry-Run & Prompt Inspector</h4>
            <p className="pb-dryrun-subtitle">
              Simulate prompt compilation and search queries before running pipelines.
            </p>
          </div>
        </div>
        <div className="pb-dryrun-guarantee-badge">
          <Zap size={12} />
          <span>$0 Token Cost · 0ms Latency</span>
        </div>
      </div>

      {/* Card Context Picker */}
      <div className="pb-dryrun-card-picker">
        <label htmlFor="dryrun-card-select" className="pb-dryrun-picker-label">
          Test Card Context:
        </label>
        <select
          id="dryrun-card-select"
          className="input-select pb-dryrun-select"
          aria-label="Select Card for Dry-Run"
          value={selectedCardId}
          onChange={(e) => setSelectedCardId(e.target.value)}
        >
          <optgroup label="Fallback Archetype Cards">
            {FALLBACK_TEST_CARDS.map((fc) => (
              <option key={fc.id} value={String(fc.id)}>
                {fc.title} ({fc.type})
              </option>
            ))}
          </optgroup>
          {cards.length > 0 && (
            <optgroup label="Your Saved Cards">
              {cards.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.title} ({c.type || 'note'})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Selected Card Context Summary Card */}
      <div className="pb-dryrun-card-summary">
        <div className="pb-dryrun-card-meta">
          <span className="pb-card-badge">{activeCard.type}</span>
          <span className="pb-dryrun-card-title">{activeCard.title}</span>
          <a
            href={activeCard.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pb-dryrun-card-link"
            title={activeCard.url}
          >
            <ExternalLink size={11} />
            <span>{activeCard.url}</span>
          </a>
        </div>
        <p className="pb-dryrun-card-snippet">{activeCard.content}</p>
      </div>

      {/* Step by Step Compiled Instructions */}
      <div className="pb-dryrun-steps-deck">
        <div className="pb-dryrun-steps-count">
          <span>Compiled Pipeline Sequence ({compiledSteps.length} active steps):</span>
        </div>

        {compiledSteps.map((cs, idx) => (
          <div key={idx} className="pb-dryrun-step-card" data-testid={`dryrun-step-${cs.position}`}>
            <div className="pb-dryrun-step-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="pb-step-num">#{cs.position}</span>
                <span className="pb-step-name">{cs.name}</span>
                <span className="pb-step-stage-tag">{cs.heading}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  className={`pb-policy-chip ${cs.tool_policy === 'search' ? 'search' : 'none'}`}
                >
                  {cs.tool_policy === 'search'
                    ? `🔍 Search (${cs.max_queries} queries)`
                    : '🧠 Reasoning Only'}
                </span>
                <span className="pb-role-chip">
                  {cs.role === 'research_plan' ? '⚡ Planning' : '🧠 Synthesis'}
                </span>
              </div>
            </div>

            {/* Planned Tool Queries */}
            {cs.tool_policy === 'search' && cs.plannedQueries.length > 0 && (
              <div className="pb-dryrun-queries-box">
                <span className="pb-dryrun-queries-label">
                  <Search size={11} />
                  <span>Planned Web Queries ({cs.plannedQueries.length}):</span>
                </span>
                <div className="pb-dryrun-queries-list">
                  {cs.plannedQueries.map((q, qIdx) => (
                    <div key={qIdx} className="pb-dryrun-query-pill">
                      <code>{q}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compiled Prompt Instructions */}
            <div className="pb-dryrun-prompt-box">
              <span className="pb-dryrun-prompt-label">
                <Sparkles size={11} />
                <span>Compiled LLM Prompt:</span>
              </span>
              <pre className="pb-dryrun-prompt-code">{cs.compiledPrompt}</pre>
            </div>

            {/* Simulated Section Draft */}
            <div className="pb-dryrun-sim-output">
              <div className="pb-dryrun-sim-header">
                <CheckCircle2 size={11} />
                <span>Simulated Output Heading:</span>
                <strong>{cs.heading}</strong>
              </div>
              <div className="pb-dryrun-sim-text">{cs.simulatedOutput}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
