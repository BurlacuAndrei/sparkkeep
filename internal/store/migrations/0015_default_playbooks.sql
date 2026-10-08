-- 0015_default_playbooks.sql
-- Seed built-in curated default playbooks:
-- 1. Tech Stack Evaluator
-- 2. Competitor Comparison
-- 3. Fact & Claim Checker
-- 4. Quick Executive Briefing

INSERT OR IGNORE INTO playbooks (id, name, description, is_builtin, card_types, version, created_at, updated_at) VALUES
(3, 'Tech Stack Evaluator', 'Evaluates architecture, repo health, license, and alternatives', 1, '[]', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
(4, 'Competitor Comparison', 'Builds a feature matrix, pricing comparison, and pros/cons', 1, '[]', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
(5, 'Fact & Claim Checker', 'Verifies specific claims against authoritative sources', 1, '[]', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
(6, 'Quick Executive Briefing', 'Fast 2-minute synthesis (TL;DR, target audience, key takeaways)', 1, '[]', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Tech Stack Evaluator steps (playbook 3)
INSERT OR IGNORE INTO playbook_steps (playbook_id, position, kind, name, enabled, config) VALUES
(3, 1, 'ground', 'Grounding', 1, '{}'),
(3, 2, 'resolve_refs', 'Resolve References', 1, '{}'),
(3, 3, 'plan', 'Architecture & Repo Health Planning', 1, '{"instruction":"Formulate technical evaluation questions focusing on architecture, dependencies, repo health, license viability, and ecosystem alternatives.","role":"research_plan"}'),
(3, 4, 'search', 'Technical & Ecosystem Search', 1, '{"instruction":"Search for repository activity, maintainer reputation, security advisories, benchmarks, and competing libraries or tools.","tool_policy":"search","max_queries":5}'),
(3, 5, 'read', 'Documentation & Source Reading', 1, '{"instruction":"Read repository documentation, architecture diagrams, benchmark results, and community discussions."}'),
(3, 6, 'landscape', 'Ecosystem & Alternatives Matrix', 1, '{"instruction":"Compare against leading alternative frameworks and libraries on maintenance, performance, and ergonomics."}'),
(3, 7, 'verdict', 'Architecture Assessment & Verdict', 1, '{"instruction":"Synthesize findings into an architectural assessment covering maintainability, production readiness, license risks, and recommended adoption path.","role":"research_synthesis"}'),
(3, 8, 'report', 'Report Generation', 1, '{}');

-- Competitor Comparison steps (playbook 4)
INSERT OR IGNORE INTO playbook_steps (playbook_id, position, kind, name, enabled, config) VALUES
(4, 1, 'ground', 'Grounding', 1, '{}'),
(4, 2, 'resolve_refs', 'Resolve References', 1, '{}'),
(4, 3, 'plan', 'Market & Feature Planning', 1, '{"instruction":"Identify key product vectors: core capabilities, target customer profile, pricing tiers, and differentiation points.","role":"research_plan"}'),
(4, 4, 'search', 'Competitor Intelligence Search', 1, '{"instruction":"Search for direct and indirect competitors, pricing pages, feature comparison breakdowns, and user reviews.","tool_policy":"search","max_queries":5}'),
(4, 5, 'read', 'Product & Review Deep Dive', 1, '{"instruction":"Read competitive teardowns, pricing structures, customer complaints, and feature matrices."}'),
(4, 6, 'landscape', 'Competitive Feature & Pricing Matrix', 1, '{"instruction":"Construct a comprehensive feature and pricing comparison matrix highlighting strengths, weaknesses, and unique selling points."}'),
(4, 7, 'verdict', 'Competitive Advantage Verdict', 1, '{"instruction":"Deliver a clear competitive verdict evaluating market positioning, moat, threats, and strategic opportunities.","role":"research_synthesis"}'),
(4, 8, 'report', 'Report Generation', 1, '{}');

-- Fact & Claim Checker steps (playbook 5)
INSERT OR IGNORE INTO playbook_steps (playbook_id, position, kind, name, enabled, config) VALUES
(5, 1, 'ground', 'Grounding', 1, '{}'),
(5, 2, 'resolve_refs', 'Resolve References', 1, '{}'),
(5, 3, 'plan', 'Claim Extraction & Verification Plan', 1, '{"instruction":"Deconstruct the primary assertions, quantitative metrics, and causal claims to be verified against primary sources.","role":"research_plan"}'),
(5, 4, 'search', 'Authoritative Source Search', 1, '{"instruction":"Search peer-reviewed papers, primary documentation, official statistics, and reputable investigative sources.","tool_policy":"search","max_queries":5}'),
(5, 5, 'read', 'Primary Evidence Reading', 1, '{"instruction":"Examine primary evidence, statistical context, methodologies, and original source citations."}'),
(5, 6, 'verify_claims', 'Claim Verification & Evidence Rating', 1, '{"instruction":"Evaluate veracity, nuance, potential misrepresentations, and confidence level for each claim."}'),
(5, 7, 'verdict', 'Factual Accuracy Verdict', 1, '{"instruction":"Issue an authoritative truth-rating verdict with supporting evidence, caveats, and identified falsehoods or exaggerations.","role":"research_synthesis"}'),
(5, 8, 'report', 'Report Generation', 1, '{}');

-- Quick Executive Briefing steps (playbook 6)
INSERT OR IGNORE INTO playbook_steps (playbook_id, position, kind, name, enabled, config) VALUES
(6, 1, 'ground', 'Grounding', 1, '{}'),
(6, 2, 'plan', 'Executive Focus Plan', 1, '{"instruction":"Frame essential executive inquiries: business impact, target audience, urgency, and strategic ROI.","role":"research_plan"}'),
(6, 3, 'search', 'Rapid Context Search', 1, '{"instruction":"Quickly gather macro industry context, market size, and primary stakeholder commentary.","tool_policy":"search","max_queries":3}'),
(6, 4, 'read', 'High-Signal Synthesis Reading', 1, '{"instruction":"Filter for high-signal summaries, executive announcements, and core data points."}'),
(6, 5, 'verdict', 'Executive Synthesis & Action Points', 1, '{"instruction":"Synthesize a high-impact executive briefing: 2-sentence executive summary, target stakeholders, 3 key takeaways, and immediate actionable decision points.","role":"research_synthesis"}'),
(6, 6, 'report', 'Report Generation', 1, '{}');
