import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaybookManager } from '../PlaybookManager';
import { UserProfileTab } from '../settings/UserProfileTab';
import { LocaleProvider } from '../../i18n';
import type { Locale } from '../../i18n';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    fetchPlaybooks: vi.fn(),
    fetchStepLibrary: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({
      settings: {
        default_playbook_id: 1,
        card_types: ['tool', 'product', 'article'],
      },
    }),
    createPlaybook: vi.fn(),
    duplicatePlaybook: vi.fn(),
    patchSettings: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe('Localized System Seeds, Built-in Playbook Cloning, and Starter Archetypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const builtinPlaybooksMock = [
    {
      id: 1,
      name: 'Default Research Pipeline',
      description: 'Standard deep research pipeline (grounding, plan, search, read, claims, landscape, verdict)',
      is_builtin: true,
      card_types: [],
      version: 1,
      steps: [
        { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
        { position: 2, kind: 'resolve_refs', name: 'Resolve References', enabled: true, config: {} },
        { position: 3, kind: 'report', name: 'Report Generation', enabled: true, config: {} },
      ],
    },
    {
      id: 3,
      name: 'Tech Stack Evaluator',
      description: 'Evaluates architecture, repo health, license, and alternatives',
      is_builtin: true,
      card_types: [],
      version: 1,
      steps: [
        { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
        { position: 2, kind: 'plan', name: 'Architecture & Repo Health Planning', enabled: true, config: {} },
        { position: 3, kind: 'verdict', name: 'Architecture Assessment & Verdict', enabled: true, config: {} },
      ],
    },
  ];

  it('dynamically displays localized name, description, and step flow titles in German', async () => {
    vi.mocked(api.fetchPlaybooks).mockResolvedValue(builtinPlaybooksMock);

    render(
      <LocaleProvider locale="de">
        <PlaybookManager showToast={vi.fn()} />
      </LocaleProvider>
    );

    await waitFor(() => {
      // German localized names
      expect(screen.getByText('Standard-Recherche-Pipeline')).toBeDefined();
      expect(screen.getByText('Tech-Stack-Evaluator')).toBeDefined();
    });

    // German descriptions
    expect(
      screen.getByText(
        'Standardmäßige Tiefenrecherche-Pipeline (Verankerung, Plan, Suche, Lesen, Behauptungen, Landschaft, Urteil)'
      )
    ).toBeDefined();
    expect(
      screen.getByText('Bewertet Architektur, Repository-Zustand, Lizenz und Alternativen')
    ).toBeDefined();

    // German flow step badges
    expect(screen.getAllByText('Kontext-Verankerung').length).toBeGreaterThan(0);
    expect(screen.getByText('Referenzen auflösen')).toBeDefined();
    expect(screen.getByText('Planung von Architektur & Repository-Zustand')).toBeDefined();
    expect(screen.getByText('Architekturbewertung & Urteil')).toBeDefined();
  });

  it('dynamically displays localized name, description, and step flow titles in French', async () => {
    vi.mocked(api.fetchPlaybooks).mockResolvedValue(builtinPlaybooksMock);

    render(
      <LocaleProvider locale="fr">
        <PlaybookManager showToast={vi.fn()} />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pipeline de recherche par défaut')).toBeDefined();
      expect(screen.getByText('Évaluateur de stack technique')).toBeDefined();
    });

    expect(screen.getAllByText('Ancrage du contexte').length).toBeGreaterThan(0);
    expect(screen.getByText('Résolution des références')).toBeDefined();
    expect(screen.getByText('Génération de rapport')).toBeDefined();
  });

  it('materializes localized custom playbook name, description, and step titles when cloning a built-in playbook in Romanian', async () => {
    vi.mocked(api.fetchPlaybooks).mockResolvedValue(builtinPlaybooksMock);

    const createdPlaybook = {
      id: 101,
      name: 'Evaluator de stivă tehnologică (clonă)',
      description: 'Evaluează arhitectura, sănătatea depozitului, licența și alternativele',
      is_builtin: false,
      card_types: [],
      version: 1,
      steps: [
        { position: 1, kind: 'ground', name: 'Înrădăcinare context', enabled: true, config: {} },
        { position: 2, kind: 'plan', name: 'Planificare arhitectură și sănătate depozit', enabled: true, config: {} },
        { position: 3, kind: 'verdict', name: 'Evaluare arhitectură și decizie', enabled: true, config: {} },
      ],
    };
    vi.mocked(api.createPlaybook).mockResolvedValue(createdPlaybook);

    render(
      <LocaleProvider locale="ro">
        <PlaybookManager showToast={vi.fn()} />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Evaluator de stivă tehnologică')).toBeDefined();
    });

    // Find duplicate buttons on the cards
    const duplicateBtns = screen.getAllByRole('button', { name: /Duplică/i });
    expect(duplicateBtns.length).toBe(2);

    // Click duplicate on Playbook 3 (Tech Stack Evaluator)
    fireEvent.click(duplicateBtns[1]);

    await waitFor(() => {
      expect(api.createPlaybook).toHaveBeenCalledTimes(1);
    });

    const callArg = vi.mocked(api.createPlaybook).mock.calls[0][0];
    expect(callArg.name).toBe('Evaluator de stivă tehnologică (Copie)');
    expect(callArg.description).toBe(
      'Evaluează arhitectura, sănătatea depozitului, licența și alternativele'
    );
    expect(callArg.is_builtin).toBe(false);
    expect(callArg.steps).toEqual([
      { position: 1, kind: 'ground', name: 'Înrădăcinare context', enabled: true, config: {} },
      { position: 2, kind: 'plan', name: 'Planificare arhitectură și sănătate depozit', enabled: true, config: {} },
      { position: 3, kind: 'verdict', name: 'Evaluare arhitectură și decizie', enabled: true, config: {} },
    ]);
  });

  it('materializes localized custom playbook name and step titles when cloning via template gallery in Spanish', async () => {
    vi.mocked(api.fetchPlaybooks).mockResolvedValue(builtinPlaybooksMock);

    render(
      <LocaleProvider locale="es">
        <PlaybookManager showToast={vi.fn()} />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Canal de investigación predeterminado')).toBeDefined();
    });

    // Enter builder by clicking "Nuevo manual"
    fireEvent.click(screen.getByRole('button', { name: /Nuevo manual/i }));

    // Open template gallery modal
    fireEvent.click(screen.getByRole('button', { name: /Cargar plantilla/i }));

    // Verify built-in section displays localized name in modal
    expect(screen.getByText('Evaluador de pila tecnológica')).toBeDefined();

    // Find and click the clone button for Tech Stack Evaluator in gallery
    const cloneBtns = screen.getAllByRole('button', { name: /Clonar.*pasos.*integrados/i });
    expect(cloneBtns.length).toBe(2);
    fireEvent.click(cloneBtns[1]);

    // Canvas should now be populated with localized cloned name and step titles
    expect(
      (screen.getByLabelText(/Nombre del manual/i) as HTMLInputElement).value
    ).toBe('Evaluador de pila tecnológica (copia)');

    expect(screen.getByText('Planificación de arquitectura y salud del repositorio')).toBeDefined();
    expect(screen.getByText('Evaluación de arquitectura y veredicto')).toBeDefined();
  });

  describe('Starter Profile Archetypes Prefill Localization', () => {
    const testCases: { locale: Locale; expectedGoalsSubstring: string; expectedSkillsSubstring: string }[] = [
      {
        locale: 'ro',
        expectedGoalsSubstring: 'Fondator la început de drum',
        expectedSkillsSubstring: 'Vânzări B2B, Strategie de produs',
      },
      {
        locale: 'es',
        expectedGoalsSubstring: 'Fundador en etapa temprana',
        expectedSkillsSubstring: 'Ventas B2B, Estrategia de producto',
      },
      {
        locale: 'pt-BR',
        expectedGoalsSubstring: 'Fundador em estágio inicial',
        expectedSkillsSubstring: 'Vendas B2B, Estratégia de produto',
      },
      {
        locale: 'fr',
        expectedGoalsSubstring: 'Fondateur en phase initiale',
        expectedSkillsSubstring: 'Vente B2B, Stratégie produit',
      },
      {
        locale: 'de',
        expectedGoalsSubstring: 'Gründer in der Frühphase',
        expectedSkillsSubstring: 'B2B-Vertrieb, Produktstrategie',
      },
      {
        locale: 'en',
        expectedGoalsSubstring: 'Early-stage founder scaling',
        expectedSkillsSubstring: 'B2B Sales, Product Strategy',
      },
    ];

    for (const { locale, expectedGoalsSubstring, expectedSkillsSubstring } of testCases) {
      it(`prefills archetype fields in active locale: ${locale}`, () => {
        const setGoals = vi.fn();
        const setSkills = vi.fn();
        const setStack = vi.fn();
        const setInterests = vi.fn();
        const setConstraints = vi.fn();

        render(
          <LocaleProvider locale={locale}>
            <UserProfileTab
              goals=""
              setGoals={setGoals}
              skills=""
              setSkills={setSkills}
              stack=""
              setStack={setStack}
              interests=""
              setInterests={setInterests}
              constraints=""
              setConstraints={setConstraints}
              language="Same as source / English"
              setLanguage={vi.fn()}
              showToast={vi.fn()}
            />
          </LocaleProvider>
        );

        // Click the founder archetype button
        const archetypeBtn = screen.getByTestId('archetype-founder');
        fireEvent.click(archetypeBtn);

        expect(setGoals).toHaveBeenCalled();
        const calledGoals = setGoals.mock.calls[0][0];
        expect(calledGoals).toContain(expectedGoalsSubstring);

        expect(setSkills).toHaveBeenCalled();
        const calledSkills = setSkills.mock.calls[0][0];
        expect(calledSkills).toContain(expectedSkillsSubstring);

        expect(setStack).toHaveBeenCalled();
        expect(setInterests).toHaveBeenCalled();
        expect(setConstraints).toHaveBeenCalled();
      });
    }
  });
});
