import React, { useMemo, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Plus,
  Sparkles,
  Globe,
  Layers,
  Clock,
} from 'lucide-react';
import { PlaybookStep } from '../../types';
import { PillarHealth, SoftLinterAdvisory } from './constants';

export interface PlaybookHealthInspectorProps {
  steps: PlaybookStep[];
  onUpdateSteps: (nextSteps: PlaybookStep[]) => void;
  showToast: (msg: string) => void;
}

export const PlaybookHealthInspector: React.FC<PlaybookHealthInspectorProps> = ({
  steps,
  onUpdateSteps,
  showToast,
}) => {
  // 1-Click Auto-Fix Step Inserters for Missing Pillars
  const insertGroundingStep = useCallback(() => {
    const newStep: PlaybookStep = {
      position: 1,
      kind: 'ground',
      name: 'Grounding',
      enabled: true,
      config: {
        output_heading: 'Grounding & Context',
        instruction: 'Anchor card context, source URL, note, and metadata into run memory.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture'],
      },
    };
    const nextSteps = [newStep, ...steps];
    nextSteps.forEach((s, i) => (s.position = i + 1));
    onUpdateSteps(nextSteps);
    showToast('Inserted Grounding step');
  }, [steps, onUpdateSteps, showToast]);

  const insertSearchStep = useCallback(() => {
    const newStep: PlaybookStep = {
      position: 1,
      kind: 'search',
      name: 'Web Search',
      enabled: true,
      config: {
        output_heading: 'Search Discoveries',
        instruction: 'Execute targeted web queries to locate primary sources and authoritative data.',
        tool_policy: 'search',
        max_queries: 2,
        role: 'research_plan',
        inputs: ['capture'],
      },
    };
    const nextSteps = [...steps];
    const groundIdx = nextSteps.findIndex((s) => s.kind === 'ground');
    const insertIdx = groundIdx >= 0 ? groundIdx + 1 : 0;
    nextSteps.splice(insertIdx, 0, newStep);
    nextSteps.forEach((s, i) => (s.position = i + 1));
    onUpdateSteps(nextSteps);
    showToast('Inserted Web Search step');
  }, [steps, onUpdateSteps, showToast]);

  const insertReaderStep = useCallback(() => {
    const newStep: PlaybookStep = {
      position: 1,
      kind: 'read',
      name: 'Source Reader',
      enabled: true,
      config: {
        output_heading: 'Extracted Sources',
        instruction: 'Scrape and extract content in round-robin fashion from discovered sources.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture', 'sources'],
      },
    };
    const nextSteps = [...steps];
    let searchIdx = -1;
    for (let i = nextSteps.length - 1; i >= 0; i--) {
      if (
        nextSteps[i].kind === 'search' ||
        nextSteps[i].kind === 'resolve_refs' ||
        (nextSteps[i].kind === 'custom' && nextSteps[i].config?.tool_policy === 'search')
      ) {
        searchIdx = i;
        break;
      }
    }
    const groundIdx = nextSteps.findIndex((s) => s.kind === 'ground');
    const insertIdx =
      searchIdx >= 0 ? searchIdx + 1 : groundIdx >= 0 ? groundIdx + 1 : nextSteps.length;
    nextSteps.splice(insertIdx, 0, newStep);
    nextSteps.forEach((s, i) => (s.position = i + 1));
    onUpdateSteps(nextSteps);
    showToast('Inserted Source Reader step');
  }, [steps, onUpdateSteps, showToast]);

  const insertVerificationStep = useCallback(() => {
    const newStep: PlaybookStep = {
      position: 1,
      kind: 'verify_claims',
      name: 'Claims Verification',
      enabled: true,
      config: {
        output_heading: 'Claim Verification',
        instruction: 'Cross-check core claims against extracted sources with citations.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture', 'sources', 'previous_steps'],
      },
    };
    const nextSteps = [...steps];
    const endIdx = nextSteps.findIndex((s) => s.kind === 'verdict' || s.kind === 'report');
    const insertIdx = endIdx >= 0 ? endIdx : nextSteps.length;
    nextSteps.splice(insertIdx, 0, newStep);
    nextSteps.forEach((s, i) => (s.position = i + 1));
    onUpdateSteps(nextSteps);
    showToast('Inserted Claims Verification step');
  }, [steps, onUpdateSteps, showToast]);

  const insertReportStep = useCallback(() => {
    const newStep: PlaybookStep = {
      position: steps.length + 1,
      kind: 'report',
      name: 'Briefing Report',
      enabled: true,
      config: {
        output_heading: 'Executive Briefing',
        instruction: 'Compile finalized Markdown briefing report synthesizing all insights with citations.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture', 'sources', 'previous_steps'],
      },
    };
    const nextSteps = [...steps, newStep];
    nextSteps.forEach((s, i) => (s.position = i + 1));
    onUpdateSteps(nextSteps);
    showToast('Inserted Briefing Report step');
  }, [steps, onUpdateSteps, showToast]);

  // Active (enabled) steps for analysis and inspector
  const activeSteps = useMemo(() => {
    return (steps || []).filter((s) => s.enabled);
  }, [steps]);

  const hasGrounding = useMemo(() => {
    return activeSteps.some((s) => {
      if (s.kind === 'ground') return true;
      if (s.kind === 'custom') {
        const inputs = s.config?.inputs;
        return Array.isArray(inputs) && inputs.includes('capture') && !inputs.includes('previous_steps');
      }
      return false;
    });
  }, [activeSteps]);

  const hasRetrieval = useMemo(() => {
    return activeSteps.some((s) => {
      if (s.kind === 'search' || s.kind === 'resolve_refs') return true;
      if (s.kind === 'custom' && s.config?.tool_policy === 'search') return true;
      return false;
    });
  }, [activeSteps]);

  const hasExtraction = useMemo(() => {
    return activeSteps.some((s) => s.kind === 'read');
  }, [activeSteps]);

  const hasVerification = useMemo(() => {
    return activeSteps.some((s) => s.kind === 'verify_claims');
  }, [activeSteps]);

  const hasDelivery = useMemo(() => {
    return activeSteps.some((s) => s.kind === 'report' || s.kind === 'verdict');
  }, [activeSteps]);

  const pillars: PillarHealth[] = useMemo(
    () => [
      {
        id: 'grounding',
        name: 'Grounding',
        ready: hasGrounding,
        hint: hasGrounding ? 'Card context & note memory anchored' : 'Context not anchored',
      },
      {
        id: 'retrieval',
        name: 'Retrieval',
        ready: hasRetrieval,
        hint: hasRetrieval ? 'Active external search / refs' : 'Hallucination risk: no search',
      },
      {
        id: 'extraction',
        name: 'Extraction',
        ready: hasExtraction,
        hint: hasExtraction ? 'Deep source reader enabled' : 'Unextracted sources',
      },
      {
        id: 'verification',
        name: 'Verification',
        ready: hasVerification,
        hint: hasVerification ? 'Cross-checked citations' : 'Unverified claims',
      },
      {
        id: 'delivery',
        name: 'Delivery',
        ready: hasDelivery,
        hint: hasDelivery ? 'Synthesized briefing / verdict' : 'Fallback synthesizer active',
      },
    ],
    [hasGrounding, hasRetrieval, hasExtraction, hasVerification, hasDelivery]
  );

  const readyPillarsCount = useMemo(() => {
    return pillars.filter((p) => p.ready).length;
  }, [pillars]);

  // Soft Linter Advisory Notices with 1-Click Auto-Fix
  const advisories: SoftLinterAdvisory[] = useMemo(() => {
    const list: SoftLinterAdvisory[] = [];

    if (!hasGrounding) {
      list.push({
        id: 'grounding_missing',
        pillarId: 'grounding',
        title: 'Context Not Anchored',
        description: 'Context not anchored: Research run will lack card context, note body, and source URL metadata.',
        actionLabel: '+ Insert Grounding',
        onFix: insertGroundingStep,
      });
    }

    if (!hasRetrieval) {
      list.push({
        id: 'retrieval_missing',
        pillarId: 'retrieval',
        title: 'Hallucination Risk',
        description: 'Hallucination risk: No search or live retrieval configured to fetch external facts.',
        actionLabel: '+ Insert Web Search',
        onFix: insertSearchStep,
      });
    }

    if (!hasExtraction) {
      list.push({
        id: 'extraction_missing',
        pillarId: 'extraction',
        title: 'Unextracted Sources',
        description: 'Unextracted sources: Discovered web links will not be scraped or read into source context.',
        actionLabel: '+ Insert Source Reader',
        onFix: insertReaderStep,
      });
    }

    if (!hasVerification) {
      list.push({
        id: 'verification_missing',
        pillarId: 'verification',
        title: 'Unverified Claims',
        description: 'Unverified claims: Findings will not be cross-verified against source citations for factual rigor.',
        actionLabel: '+ Insert Claims Verification',
        onFix: insertVerificationStep,
      });
    }

    if (!hasDelivery) {
      list.push({
        id: 'delivery_missing',
        pillarId: 'delivery',
        title: 'No Delivery Step',
        description: 'Notice: Fallback Report Synthesizer will compile final outputs if omitted.',
        actionLabel: '+ Insert Briefing Report',
        onFix: insertReportStep,
      });
    }

    return list;
  }, [
    hasGrounding,
    hasRetrieval,
    hasExtraction,
    hasVerification,
    hasDelivery,
    insertGroundingStep,
    insertSearchStep,
    insertReaderStep,
    insertVerificationStep,
    insertReportStep,
  ]);

  // Dynamic Resource & Cost Estimator
  const estimates = useMemo(() => {
    if (activeSteps.length === 0) {
      return {
        llmCalls: 0,
        fetches: 0,
        tokenRange: '0 tokens',
        latency: '0s',
      };
    }

    let llm = 0;
    let fetches = 0;
    let minTokens = 600;
    let maxTokens = 1200;
    let minSec = 0;
    let maxSec = 0;

    activeSteps.forEach((st) => {
      switch (st.kind) {
        case 'ground':
          minTokens += 200;
          maxTokens += 500;
          break;
        case 'resolve_refs':
          fetches += 2;
          minTokens += 300;
          maxTokens += 800;
          minSec += 2;
          maxSec += 4;
          break;
        case 'plan':
          llm += 1;
          minTokens += 500;
          maxTokens += 1200;
          minSec += 3;
          maxSec += 6;
          break;
        case 'search': {
          const q = st.config?.max_queries ?? 2;
          fetches += q * 3;
          minTokens += 400;
          maxTokens += 900;
          minSec += 3;
          maxSec += 6;
          break;
        }
        case 'read':
          fetches += 5;
          minTokens += 1000;
          maxTokens += 2200;
          minSec += 4;
          maxSec += 8;
          break;
        case 'verify_claims':
          llm += 1;
          minTokens += 600;
          maxTokens += 1500;
          minSec += 4;
          maxSec += 7;
          break;
        case 'landscape':
          llm += 1;
          minTokens += 600;
          maxTokens += 1400;
          minSec += 3;
          maxSec += 6;
          break;
        case 'verdict':
          llm += 1;
          minTokens += 500;
          maxTokens += 1200;
          minSec += 3;
          maxSec += 6;
          break;
        case 'report':
          llm += 1;
          minTokens += 800;
          maxTokens += 2000;
          minSec += 4;
          maxSec += 8;
          break;
        case 'custom': {
          llm += 1;
          const isSearch = st.config?.tool_policy === 'search';
          if (isSearch) {
            const q = st.config?.max_queries ?? 2;
            fetches += q;
            minTokens += 800;
            maxTokens += 2000;
            minSec += 5;
            maxSec += 9;
          } else {
            minTokens += 500;
            maxTokens += 1400;
            minSec += 3;
            maxSec += 6;
          }
          break;
        }
      }
    });

    maxSec += 2;

    const formatK = (n: number) => `${(n / 1000).toFixed(1)}k`;

    return {
      llmCalls: llm,
      fetches,
      tokenRange: `~${formatK(minTokens)}–${formatK(maxTokens)} tokens`,
      latency: `~${minSec}–${maxSec}s`,
    };
  }, [activeSteps]);

  return (
    <aside className="pb-inspector-dock" aria-label="Research Health Inspector">
      <div className="pb-inspector-header">
        <div className="pb-inspector-title">
          <Activity size={16} className="pb-inspector-icon" />
          <span>Research Health Inspector</span>
        </div>
        <span
          className={`pb-health-score-badge ${readyPillarsCount === 5 ? 'ready' : 'incomplete'}`}
          data-testid="health-score-badge"
        >
          {readyPillarsCount === 5 ? '5 / 5 Pillars Ready' : `${readyPillarsCount} / 5 Incomplete`}
        </span>
      </div>

      {/* 5-Pillar Research Model Checklist */}
      <div className="pb-pillars-list" aria-label="5-Pillar Research Model">
        {pillars.map((p) => (
          <div key={p.id} className={`pb-pillar-item ${p.ready ? 'ready' : 'missing'}`}>
            <div className="pb-pillar-status">
              {p.ready ? (
                <CheckCircle2 size={14} className="pb-pillar-icon ready" />
              ) : (
                <AlertCircle size={14} className="pb-pillar-icon missing" />
              )}
              <span className="pb-pillar-name">{p.name}</span>
            </div>
            <span className="pb-pillar-tag">{p.ready ? 'Ready' : 'Missing'}</span>
          </div>
        ))}
      </div>

      {/* Health Linter Advisories */}
      <div className="pb-inspector-section">
        <div className="pb-inspector-section-title">
          <AlertCircle size={13} className="pb-section-icon" />
          <span>Health Linter Advisories</span>
        </div>

        {advisories.length === 0 ? (
          <div className="pb-linter-clean">
            <CheckCircle2 size={15} className="pb-clean-icon" />
            <span>All 5 research pillars ready. Rigorous, hallucination-resistant methodology verified.</span>
          </div>
        ) : (
          <div className="pb-advisories-list">
            {advisories.map((adv) => (
              <div key={adv.id} className="pb-advisory-card">
                <div className="pb-adv-header">
                  <span className="pb-adv-title">{adv.title}</span>
                </div>
                <p className="pb-adv-desc">{adv.description}</p>
                <button
                  type="button"
                  className="btn-secondary btn-sm pb-adv-action"
                  onClick={adv.onFix}
                >
                  <Plus size={12} />
                  <span>{adv.actionLabel}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dynamic Resource & Cost Estimator */}
      <div className="pb-inspector-section">
        <div className="pb-inspector-section-title">
          <Sparkles size={13} className="pb-section-icon" />
          <span>Dynamic Cost & Resource Estimator</span>
        </div>
        <div className="pb-cost-grid">
          <div className="pb-cost-card">
            <span className="pb-cost-label">
              <Sparkles size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              LLM Calls
            </span>
            <span className="pb-cost-val" data-testid="est-llm-calls">≈ {estimates.llmCalls}</span>
          </div>
          <div className="pb-cost-card">
            <span className="pb-cost-label">
              <Globe size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Web Fetches
            </span>
            <span className="pb-cost-val" data-testid="est-fetches">≈ {estimates.fetches}</span>
          </div>
          <div className="pb-cost-card">
            <span className="pb-cost-label">
              <Layers size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Estimated Tokens
            </span>
            <span className="pb-cost-val" data-testid="est-tokens">{estimates.tokenRange}</span>
          </div>
          <div className="pb-cost-card">
            <span className="pb-cost-label">
              <Clock size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Est. Latency
            </span>
            <span className="pb-cost-val" data-testid="est-latency">{estimates.latency}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
