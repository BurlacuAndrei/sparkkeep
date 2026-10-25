package i18n

import "strings"

// SupportedLocales lists the six standard workspace interface locales.
var SupportedLocales = []string{"en", "ro", "es", "pt-BR", "fr", "de"}

// Headings defines Markdown section headings across exports and sinks.
type Headings struct {
	ExecutiveSummary string
	Summary          string
	ValueProposition string
	ProposedActions  string
	SourceNotes      string
	References       string
	ResearchDossier  string
	Playbook         string
	Completed        string
}

// Buttons defines interactive button labels across chat channels.
type Buttons struct {
	Research     string
	DeepResearch string
	Do           string
	Keep         string
	Shelve       string
	Dismiss      string
	Discard      string
	Playbook     string
	Retry        string
	Back         string
	Short        string
	Medium       string
	Long         string
}

// Messages defines outbound message templates, status feedback, and digests.
type Messages struct {
	AnalysisFailed         string
	ResearchComplete       string
	ResearchCompleteHeader string
	ResearchFailed         string
	ResearchFailedHeader   string
	ResearchFailedStep     string
	ResearchUpdate         string
	Researching            string
	ResearchAlreadyRunning string
	CardSaved              string
	FailedToCreateCard     string
	FailedToLoadPlaybooks  string
	CommittedTo            string
	NoActionableContent    string
	WorthResearching       string
	Horizon                string
	Tags                   string
	Verdict                string
	Confidence             string
	ConfidenceSuffix       string
	NextActions            string
	KeyClaims              string
	RecentSparks           string
	TopSparks              string
	OpenDashboard          string
	ActionsReplyWith       string
	TriggerDeepResearch    string
	SetShortTerm           string
	SetMediumTerm          string
	SetLongTerm            string
	DiscardCard            string
	ReadFullReport         string
	ResearchInterrupted    string
	StartedResearch        string
	MovedShortTerm         string
	MovedMediumTerm        string
	MovedLongTerm          string
	MovedInbox             string
	CardShelved            string
	HelpText               string
	InboxHeader            string
	NoInboxCards           string

	// Morning Research Digest
	MorningDigestTitle  string
	NoResearchOvernight string
	ReportsReady        string
	NoReportsReady      string
	MorningFailures     string
	UnknownError        string

	// Weekly Digest
	WeeklyDigestTitle        string
	IntelligenceDigestTitle  string
	WeeklyDigestSummary      string
	IntelligenceDigestWindow string
	StatusInbox              string
	StatusDoing              string
	StatusDone               string
	StatusShelved            string
	StatusInProgress         string
}

// Normalize sanitizes and returns one of the supported 6 locales, defaulting to "en".
func Normalize(loc string) string {
	s := strings.ToLower(strings.TrimSpace(loc))
	switch {
	case s == "ro" || strings.HasPrefix(s, "ro-"):
		return "ro"
	case s == "es" || strings.HasPrefix(s, "es-"):
		return "es"
	case s == "pt-br" || s == "pt_br" || s == "pt" || strings.HasPrefix(s, "pt-"):
		return "pt-BR"
	case s == "fr" || strings.HasPrefix(s, "fr-"):
		return "fr"
	case s == "de" || strings.HasPrefix(s, "de-"):
		return "de"
	default:
		return "en"
	}
}

var headingsCatalog = map[string]Headings{
	"en": {
		ExecutiveSummary: "Executive Summary",
		Summary:          "Summary",
		ValueProposition: "Value Proposition",
		ProposedActions:  "Proposed Actions",
		SourceNotes:      "Source Notes",
		References:       "References",
		ResearchDossier:  "Research Dossier",
		Playbook:         "Playbook",
		Completed:        "Completed",
	},
	"ro": {
		ExecutiveSummary: "Rezumat executiv",
		Summary:          "Rezumat",
		ValueProposition: "Propunere de valoare",
		ProposedActions:  "Acțiuni propuse",
		SourceNotes:      "Note sursă",
		References:       "Referințe",
		ResearchDossier:  "Dosar de cercetare",
		Playbook:         "Manual",
		Completed:        "Finalizat",
	},
	"es": {
		ExecutiveSummary: "Resumen ejecutivo",
		Summary:          "Resumen",
		ValueProposition: "Propuesta de valor",
		ProposedActions:  "Acciones propuestas",
		SourceNotes:      "Notas de la fuente",
		References:       "Referencias",
		ResearchDossier:  "Dossier de investigación",
		Playbook:         "Manual",
		Completed:        "Completado",
	},
	"pt-BR": {
		ExecutiveSummary: "Resumo executivo",
		Summary:          "Resumo",
		ValueProposition: "Proposta de valor",
		ProposedActions:  "Ações propostas",
		SourceNotes:      "Notas da fonte",
		References:       "Referências",
		ResearchDossier:  "Dossiê de pesquisa",
		Playbook:         "Manual",
		Completed:        "Concluído",
	},
	"fr": {
		ExecutiveSummary: "Résumé exécutif",
		Summary:          "Résumé",
		ValueProposition: "Proposition de valeur",
		ProposedActions:  "Actions proposées",
		SourceNotes:      "Notes de source",
		References:       "Références",
		ResearchDossier:  "Dossier de recherche",
		Playbook:         "Manuel",
		Completed:        "Terminé",
	},
	"de": {
		ExecutiveSummary: "Management-Zusammenfassung",
		Summary:          "Zusammenfassung",
		ValueProposition: "Wertversprechen",
		ProposedActions:  "Vorgeschlagene Aktionen",
		SourceNotes:      "Quellnotizen",
		References:       "Referenzen",
		ResearchDossier:  "Recherche-Dossier",
		Playbook:         "Playbook",
		Completed:        "Abgeschlossen",
	},
}

var buttonsCatalog = map[string]Buttons{
	"en": {
		Research:     "Research",
		DeepResearch: "🔬 Deep Research",
		Do:           "Do",
		Keep:         "Keep",
		Shelve:       "Shelve",
		Dismiss:      "Dismiss",
		Discard:      "✕ Discard",
		Playbook:     "Playbook",
		Retry:        "Retry",
		Back:         "« Back",
		Short:        "Short",
		Medium:       "Medium",
		Long:         "Long",
	},
	"ro": {
		Research:     "Cercetează",
		DeepResearch: "🔬 Cercetare profundă",
		Do:           "Fă",
		Keep:         "Păstrează",
		Shelve:       "Pune deoparte",
		Dismiss:      "Respinge",
		Discard:      "✕ Respinge",
		Playbook:     "Manual",
		Retry:        "Reîncearcă",
		Back:         "« Înapoi",
		Short:        "Scurt",
		Medium:       "Mediu",
		Long:         "Lung",
	},
	"es": {
		Research:     "Investigar",
		DeepResearch: "🔬 Investigación profunda",
		Do:           "Hacer",
		Keep:         "Conservar",
		Shelve:       "Posponer",
		Dismiss:      "Descartar",
		Discard:      "✕ Descartar",
		Playbook:     "Manual",
		Retry:        "Reintentar",
		Back:         "« Volver",
		Short:        "Corto",
		Medium:       "Medio",
		Long:         "Largo",
	},
	"pt-BR": {
		Research:     "Pesquisar",
		DeepResearch: "🔬 Pesquisa profunda",
		Do:           "Fazer",
		Keep:         "Manter",
		Shelve:       "Engavetar",
		Dismiss:      "Descartar",
		Discard:      "✕ Descartar",
		Playbook:     "Manual",
		Retry:        "Tentar novamente",
		Back:         "« Voltar",
		Short:        "Curto",
		Medium:       "Médio",
		Long:         "Longo",
	},
	"fr": {
		Research:     "Rechercher",
		DeepResearch: "🔬 Recherche approfondie",
		Do:           "Faire",
		Keep:         "Garder",
		Shelve:       "Mettre de côté",
		Dismiss:      "Ignorer",
		Discard:      "✕ Rejeter",
		Playbook:     "Manuel",
		Retry:        "Réessayer",
		Back:         "« Retour",
		Short:        "Court",
		Medium:       "Moyen",
		Long:         "Long",
	},
	"de": {
		Research:     "Recherchieren",
		DeepResearch: "🔬 Tiefenforschung",
		Do:           "Tun",
		Keep:         "Behalten",
		Shelve:       "Zurückstellen",
		Dismiss:      "Verwerfen",
		Discard:      "✕ Verwerfen",
		Playbook:     "Playbook",
		Retry:        "Wiederholen",
		Back:         "« Zurück",
		Short:        "Kurz",
		Medium:       "Mittel",
		Long:         "Lang",
	},
}

var messagesCatalog = map[string]Messages{
	"en": {
		AnalysisFailed:         "Analysis failed",
		ResearchComplete:       "Research complete",
		ResearchCompleteHeader: "🔬 *Research Complete*",
		ResearchFailed:         "Research failed",
		ResearchFailedHeader:   "❌ *Research Failed*",
		ResearchFailedStep:     "*Failed step:* %s",
		ResearchUpdate:         "Research update",
		Researching:            "⏳ Researching...",
		ResearchAlreadyRunning: "Research already running",
		CardSaved:              "Card saved!",
		FailedToCreateCard:     "Failed to create card",
		FailedToLoadPlaybooks:  "Failed to load playbooks",
		CommittedTo:            "Committed to %s",
		NoActionableContent:    "No actionable content found.",
		WorthResearching:       "Worth researching",
		Horizon:                "Horizon",
		Tags:                   "Tags",
		Verdict:                "Verdict",
		Confidence:             "Confidence",
		ConfidenceSuffix:       " (%s confidence)",
		NextActions:            "Next actions",
		KeyClaims:              "Key claims:",
		RecentSparks:           "*Recent Sparks:*",
		TopSparks:              "*Top Sparks:*",
		OpenDashboard:          "Open dashboard: %s",
		ActionsReplyWith:       "Actions (reply with):",
		TriggerDeepResearch:    "Trigger Deep Research",
		SetShortTerm:           "Set Short-term (Now)",
		SetMediumTerm:          "Set Medium-term (Next)",
		SetLongTerm:            "Set Long-term (Later)",
		DiscardCard:            "Discard card",
		ReadFullReport:         "Read full report: %s",
		ResearchInterrupted:    "⚠️ Research interrupted for: %s",
		StartedResearch:        "Started Deep Research for card %d",
		MovedShortTerm:         "Card %d moved to Short-term (Doing)",
		MovedMediumTerm:        "Card %d moved to Medium-term (To Do)",
		MovedLongTerm:          "Card %d moved to Long-term",
		MovedInbox:             "Card %d moved to Inbox",
		CardShelved:            "Card %d shelved",
		HelpText: "👋 *Sparkkeep* — send me anything and it becomes a card.\n\n" +
			"*What to share:*\n" +
			"• A link → fetched and analyzed\n" +
			"• A photo, video or file → analyzed from the media\n" +
			"• A voice note → transcribed, then analyzed\n" +
			"• Plain text → captured as a note\n\n" +
			"*What you can do:*\n" +
			"• Tap Doing / Done / Shelve on a card\n" +
			"• Reply to a card with text or #tags to update it in place\n" +
			"• /digest — the last 7 days: counts by status and your 5 most recent sparks\n" +
			"• /morning — instant morning research digest\n" +
			"• /inbox — review inbox cards",
		InboxHeader:  "📥 *Inbox Cards (%d):*",
		NoInboxCards: "Inbox is clear! No unprocessed cards.",

		MorningDigestTitle:  "☀️ <b>Morning Research Digest</b>",
		NoResearchOvernight: "No research reports completed overnight.",
		ReportsReady:        "%d report(s) ready:\n\n",
		NoReportsReady:      "0 completed reports ready.\n",
		MorningFailures:     "⚠️ <b>Failures (%d):</b>\n",
		UnknownError:        "unknown error",

		WeeklyDigestTitle:        "📊 *Sparkkeep Weekly Digest*",
		IntelligenceDigestTitle:  "📊 *Sparkkeep Intelligence Digest*",
		WeeklyDigestSummary:      "Last %d days: %d cards captured",
		IntelligenceDigestWindow: "Window: Last %d days • Total: %d sparks",
		StatusInbox:              "• 📥 Inbox: %d",
		StatusDoing:              "• ⚡ Doing: %d",
		StatusDone:               "• ✅ Done: %d",
		StatusShelved:            "• 📦 Shelved: %d",
		StatusInProgress:         "• ⚡ In Progress: %d",
	},
	"ro": {
		AnalysisFailed:         "Analiza a eșuat",
		ResearchComplete:       "Cercetare finalizată",
		ResearchCompleteHeader: "🔬 *Cercetare finalizată*",
		ResearchFailed:         "Cercetarea a eșuat",
		ResearchFailedHeader:   "❌ *Cercetarea a eșuat*",
		ResearchFailedStep:     "*Pas eșuat:* %s",
		ResearchUpdate:         "Actualizare cercetare",
		Researching:            "⏳ Se cercetează...",
		ResearchAlreadyRunning: "Cercetarea rulează deja",
		CardSaved:              "Card salvat!",
		FailedToCreateCard:     "Crearea cardului a eșuat",
		FailedToLoadPlaybooks:  "Încărcarea manualelor a eșuat",
		CommittedTo:            "Asumat pentru %s",
		NoActionableContent:    "Nu s-a găsit conținut acționabil.",
		WorthResearching:       "Merită cercetat",
		Horizon:                "Orizont",
		Tags:                   "Etichete",
		Verdict:                "Verdict",
		Confidence:             "Încredere",
		ConfidenceSuffix:       " (încredere %s)",
		NextActions:            "Următoarele acțiuni",
		KeyClaims:              "Afirmații cheie:",
		RecentSparks:           "*Scântei recente:*",
		TopSparks:              "*Scântei principale:*",
		OpenDashboard:          "Deschide panoul: %s",
		ActionsReplyWith:       "Acțiuni (răspunde cu):",
		TriggerDeepResearch:    "Declanșează cercetarea profundă",
		SetShortTerm:           "Setează pe termen scurt (Acum)",
		SetMediumTerm:          "Setează pe termen mediu (Următorul)",
		SetLongTerm:            "Setează pe termen lung (Mai târziu)",
		DiscardCard:            "Respinge cardul",
		ReadFullReport:         "Citește raportul complet: %s",
		ResearchInterrupted:    "⚠️ Cercetare întreruptă pentru: %s",
		StartedResearch:        "A început cercetarea profundă pentru cardul %d",
		MovedShortTerm:         "Cardul %d a fost mutat la Termen scurt (În lucru)",
		MovedMediumTerm:        "Cardul %d a fost mutat la Termen mediu (De făcut)",
		MovedLongTerm:          "Cardul %d a fost mutat la Termen lung",
		MovedInbox:             "Cardul %d a fost mutat în Inbox",
		CardShelved:            "Cardul %d a fost pus deoparte",
		HelpText: "👋 *Sparkkeep* — trimite-mi orice și devine un card.\n\n" +
			"*Ce poți partaja:*\n" +
			"• Un link → preluat și analizat\n" +
			"• O fotografie, video sau fișier → analizat din conținutul media\n" +
			"• O notă vocală → transcrisă, apoi analizată\n" +
			"• Text simplu → salvat ca notă\n\n" +
			"*Ce poți face:*\n" +
			"• Apasă Fă / Finalizat / Pune deoparte pe un card\n" +
			"• Răspunde la un card cu text sau #etichete pentru a-l actualiza direct\n" +
			"• /digest — ultimele 7 zile: numărători pe stare și cele mai recente 5 scântei\n" +
			"• /morning — rezumat matinal de cercetare instant\n" +
			"• /inbox — consultă cardurile din inbox",
		InboxHeader:  "📥 *Carduri în Inbox (%d):*",
		NoInboxCards: "Inbox-ul este gol! Niciun card neprocesat.",

		MorningDigestTitle:  "☀️ <b>Rezumat de cercetare de dimineață</b>",
		NoResearchOvernight: "Niciun raport de cercetare nu a fost finalizat peste noapte.",
		ReportsReady:        "%d raport(e) gata:\n\n",
		NoReportsReady:      "0 rapoarte finalizate gata.\n",
		MorningFailures:     "⚠️ <b>Eșecuri (%d):</b>\n",
		UnknownError:        "eroare necunoscută",

		WeeklyDigestTitle:        "📊 *Rezumat săptămânal Sparkkeep*",
		IntelligenceDigestTitle:  "📊 *Rezumat de inteligență Sparkkeep*",
		WeeklyDigestSummary:      "Ultimele %d zile: %d carduri capturate",
		IntelligenceDigestWindow: "Interval: Ultimele %d zile • Total: %d scântei",
		StatusInbox:              "• 📥 Inbox: %d",
		StatusDoing:              "• ⚡ În lucru: %d",
		StatusDone:               "• ✅ Finalizat: %d",
		StatusShelved:            "• 📦 Pus deoparte: %d",
		StatusInProgress:         "• ⚡ În desfășurare: %d",
	},
	"es": {
		AnalysisFailed:         "Análisis fallido",
		ResearchComplete:       "Investigación completada",
		ResearchCompleteHeader: "🔬 *Investigación completada*",
		ResearchFailed:         "Investigación fallida",
		ResearchFailedHeader:   "❌ *Investigación fallida*",
		ResearchFailedStep:     "*Paso fallido:* %s",
		ResearchUpdate:         "Actualización de investigación",
		Researching:            "⏳ Investigando...",
		ResearchAlreadyRunning: "La investigación ya se está ejecutando",
		CardSaved:              "¡Tarjeta guardada!",
		FailedToCreateCard:     "Error al crear la tarjeta",
		FailedToLoadPlaybooks:  "Error al cargar manuales",
		CommittedTo:            "Comprometido a %s",
		NoActionableContent:    "No se encontró contenido procesable.",
		WorthResearching:       "Vale la pena investigar",
		Horizon:                "Horizonte",
		Tags:                   "Etiquetas",
		Verdict:                "Veredicto",
		Confidence:             "Confianza",
		ConfidenceSuffix:       " (confianza %s)",
		NextActions:            "Próximas acciones",
		KeyClaims:              "Afirmaciones clave:",
		RecentSparks:           "*Chispas recientes:*",
		TopSparks:              "*Chispas principales:*",
		OpenDashboard:          "Abrir panel: %s",
		ActionsReplyWith:       "Acciones (responde con):",
		TriggerDeepResearch:    "Iniciar investigación profunda",
		SetShortTerm:           "Fijar a corto plazo (Ahora)",
		SetMediumTerm:          "Fijar a medio plazo (Siguiente)",
		SetLongTerm:            "Fijar a largo plazo (Más tarde)",
		DiscardCard:            "Descartar tarjeta",
		ReadFullReport:         "Leer informe completo: %s",
		ResearchInterrupted:    "⚠️ Investigación interrumpida para: %s",
		StartedResearch:        "Se inició la investigación profunda para la tarjeta %d",
		MovedShortTerm:         "Tarjeta %d movida a Corto plazo (En curso)",
		MovedMediumTerm:        "Tarjeta %d movida a Medio plazo (Por hacer)",
		MovedLongTerm:          "Tarjeta %d movida a Largo plazo",
		MovedInbox:             "Tarjeta %d movida a Bandeja de entrada",
		CardShelved:            "Tarjeta %d pospuesta",
		HelpText: "👋 *Sparkkeep* — envíame cualquier cosa y se convertirá en una tarjeta.\n\n" +
			"*Qué compartir:*\n" +
			"• Un enlace → obtenido y analizado\n" +
			"• Una foto, video o archivo → analizado desde el medio\n" +
			"• Una nota de voz → transcrita y analizada\n" +
			"• Texto plano → capturado como nota\n\n" +
			"*Qué puedes hacer:*\n" +
			"• Toca Hacer / Completado / Posponer en una tarjeta\n" +
			"• Responde a una tarjeta con texto o #etiquetas para actualizarla directamente\n" +
			"• /digest — últimos 7 días: recuentos por estado y tus 5 chispas más recientes\n" +
			"• /morning — resumen matutino de investigación al instante\n" +
			"• /inbox — revisar tarjetas en bandeja de entrada",
		InboxHeader:  "📥 *Tarjetas en Bandeja de entrada (%d):*",
		NoInboxCards: "¡Bandeja de entrada despejada! No hay tarjetas pendientes.",

		MorningDigestTitle:  "☀️ <b>Resumen matutino de investigación</b>",
		NoResearchOvernight: "No se completaron informes de investigación durante la noche.",
		ReportsReady:        "%d informe(s) listo(s):\n\n",
		NoReportsReady:      "0 informes completados listos.\n",
		MorningFailures:     "⚠️ <b>Fallos (%d):</b>\n",
		UnknownError:        "error desconocido",

		WeeklyDigestTitle:        "📊 *Resumen semanal de Sparkkeep*",
		IntelligenceDigestTitle:  "📊 *Resumen de inteligencia de Sparkkeep*",
		WeeklyDigestSummary:      "Últimos %d días: %d tarjetas capturadas",
		IntelligenceDigestWindow: "Ventana: Últimos %d días • Total: %d chispas",
		StatusInbox:              "• 📥 Bandeja de entrada: %d",
		StatusDoing:              "• ⚡ En curso: %d",
		StatusDone:               "• ✅ Completado: %d",
		StatusShelved:            "• 📦 Pospuesto: %d",
		StatusInProgress:         "• ⚡ En progreso: %d",
	},
	"pt-BR": {
		AnalysisFailed:         "Falha na análise",
		ResearchComplete:       "Pesquisa concluída",
		ResearchCompleteHeader: "🔬 *Pesquisa concluída*",
		ResearchFailed:         "Falha na pesquisa",
		ResearchFailedHeader:   "❌ *Falha na pesquisa*",
		ResearchFailedStep:     "*Etapa com falha:* %s",
		ResearchUpdate:         "Atualização da pesquisa",
		Researching:            "⏳ Pesquisando...",
		ResearchAlreadyRunning: "A pesquisa já está em execução",
		CardSaved:              "Cartão salvo!",
		FailedToCreateCard:     "Falha ao criar cartão",
		FailedToLoadPlaybooks:  "Falha ao carregar manuais",
		CommittedTo:            "Comprometido com %s",
		NoActionableContent:    "Nenhum conteúdo acionável encontrado.",
		WorthResearching:       "Vale a pena pesquisar",
		Horizon:                "Horizonte",
		Tags:                   "Tags",
		Verdict:                "Veredito",
		Confidence:             "Confiança",
		ConfidenceSuffix:       " (confiança %s)",
		NextActions:            "Próximas ações",
		KeyClaims:              "Afirmações principais:",
		RecentSparks:           "*Faíscas recentes:*",
		TopSparks:              "*Principais faíscas:*",
		OpenDashboard:          "Abrir painel: %s",
		ActionsReplyWith:       "Ações (responda com):",
		TriggerDeepResearch:    "Iniciar pesquisa profunda",
		SetShortTerm:           "Definir Curto prazo (Agora)",
		SetMediumTerm:          "Definir Médio prazo (A seguir)",
		SetLongTerm:            "Definir Longo prazo (Depois)",
		DiscardCard:            "Descartar cartão",
		ReadFullReport:         "Ler relatório completo: %s",
		ResearchInterrupted:    "⚠️ Pesquisa interrompida para: %s",
		StartedResearch:        "Pesquisa profunda iniciada para o cartão %d",
		MovedShortTerm:         "Cartão %d movido para Curto prazo (Em andamento)",
		MovedMediumTerm:        "Cartão %d movido para Médio prazo (A fazer)",
		MovedLongTerm:          "Cartão %d movido para Longo prazo",
		MovedInbox:             "Cartão %d movido para Caixa de entrada",
		CardShelved:            "Cartão %d engavetado",
		HelpText: "👋 *Sparkkeep* — envie-me qualquer coisa e se tornará um cartão.\n\n" +
			"*O que compartilhar:*\n" +
			"• Um link → obtido e analisado\n" +
			"• Uma foto, vídeo ou arquivo → analisado a partir da mídia\n" +
			"• Uma nota de voz → transcrita e depois analisada\n" +
			"• Texto simples → capturado como nota\n\n" +
			"*O que você pode fazer:*\n" +
			"• Toque em Fazer / Concluído / Engavetar em um cartão\n" +
			"• Responda a um cartão com texto ou #tags para atualizá-lo diretamente\n" +
			"• /digest — últimos 7 dias: contagens por status e suas 5 faíscas mais recentes\n" +
			"• /morning — resumo matinal de pesquisa instantâneo\n" +
			"• /inbox — revisar cartões na caixa de entrada",
		InboxHeader:  "📥 *Cartões na Caixa de Entrada (%d):*",
		NoInboxCards: "Caixa de entrada limpa! Nenhum cartão pendente.",

		MorningDigestTitle:  "☀️ <b>Resumo matinal de pesquisa</b>",
		NoResearchOvernight: "Nenhum relatório de pesquisa concluído durante a noite.",
		ReportsReady:        "%d relatório(s) pronto(s):\n\n",
		NoReportsReady:      "0 relatórios concluídos prontos.\n",
		MorningFailures:     "⚠️ <b>Falhas (%d):</b>\n",
		UnknownError:        "erro desconhecido",

		WeeklyDigestTitle:        "📊 *Resumo semanal do Sparkkeep*",
		IntelligenceDigestTitle:  "📊 *Resumo de inteligência do Sparkkeep*",
		WeeklyDigestSummary:      "Últimos %d dias: %d cartões capturados",
		IntelligenceDigestWindow: "Janela: Últimos %d dias • Total: %d faíscas",
		StatusInbox:              "• 📥 Entrada: %d",
		StatusDoing:              "• ⚡ Em andamento: %d",
		StatusDone:               "• ✅ Concluído: %d",
		StatusShelved:            "• 📦 Engavetado: %d",
		StatusInProgress:         "• ⚡ Em progresso: %d",
	},
	"fr": {
		AnalysisFailed:         "Échec de l'analyse",
		ResearchComplete:       "Recherche terminée",
		ResearchCompleteHeader: "🔬 *Recherche terminée*",
		ResearchFailed:         "Échec de la recherche",
		ResearchFailedHeader:   "❌ *Échec de la recherche*",
		ResearchFailedStep:     "*Étape ayant échoué :* %s",
		ResearchUpdate:         "Mise à jour de la recherche",
		Researching:            "⏳ Recherche en cours...",
		ResearchAlreadyRunning: "Recherche déjà en cours",
		CardSaved:              "Carte enregistrée !",
		FailedToCreateCard:     "Échec de création de la carte",
		FailedToLoadPlaybooks:  "Échec de chargement des manuels",
		CommittedTo:            "Engagé pour %s",
		NoActionableContent:    "Aucun contenu exploitable trouvé.",
		WorthResearching:       "Vaut la peine d'être recherché",
		Horizon:                "Horizon",
		Tags:                   "Tags",
		Verdict:                "Verdict",
		Confidence:             "Confiance",
		ConfidenceSuffix:       " (confiance %s)",
		NextActions:            "Prochaines actions",
		KeyClaims:              "Affirmations clés :",
		RecentSparks:           "*Étincelles récentes :*",
		TopSparks:              "*Meilleures étincelles :*",
		OpenDashboard:          "Ouvrir le tableau de bord : %s",
		ActionsReplyWith:       "Actions (répondez avec) :",
		TriggerDeepResearch:    "Déclencher la recherche approfondie",
		SetShortTerm:           "Définir Court terme (Maintenant)",
		SetMediumTerm:          "Définir Moyen terme (Ensuite)",
		SetLongTerm:            "Définir Long terme (Plus tard)",
		DiscardCard:            "Rejeter la carte",
		ReadFullReport:         "Lire le rapport complet : %s",
		ResearchInterrupted:    "⚠️ Recherche interrompue pour : %s",
		StartedResearch:        "Recherche approfondie démarrée pour la carte %d",
		MovedShortTerm:         "Carte %d déplacée vers Court terme (En cours)",
		MovedMediumTerm:        "Carte %d déplacée vers Moyen terme (À faire)",
		MovedLongTerm:          "Carte %d déplacée vers Long terme",
		MovedInbox:             "Carte %d déplacée vers Boîte de réception",
		CardShelved:            "Carte %d mise de côté",
		HelpText: "👋 *Sparkkeep* — envoyez-moi n'importe quoi et cela deviendra une carte.\n\n" +
			"*Que partager :*\n" +
			"• Un lien → récupéré et analysé\n" +
			"• Une photo, vidéo ou fichier → analysé depuis le média\n" +
			"• Une note vocale → transcrite puis analysée\n" +
			"• Texte brut → capturé comme note\n\n" +
			"*Ce que vous pouvez faire :*\n" +
			"• Touchez Faire / Terminé / Mettre de côté sur une carte\n" +
			"• Répondez à une carte avec du texte ou des #tags pour la mettre à jour sur place\n" +
			"• /digest — les 7 derniers jours : décomptes par statut et vos 5 étincelles les plus récentes\n" +
			"• /morning — synthèse matinale de recherche instantanée\n" +
			"• /inbox — consulter les cartes de la boîte de réception",
		InboxHeader:  "📥 *Cartes dans la boîte de réception (%d) :*",
		NoInboxCards: "Boîte de réception vide ! Aucune carte en attente.",

		MorningDigestTitle:  "☀️ <b>Synthèse matinale de recherche</b>",
		NoResearchOvernight: "Aucun rapport de recherche terminé pendant la nuit.",
		ReportsReady:        "%d rapport(s) prêt(s) :\n\n",
		NoReportsReady:      "0 rapport terminé prêt.\n",
		MorningFailures:     "⚠️ <b>Échecs (%d) :</b>\n",
		UnknownError:        "erreur inconnue",

		WeeklyDigestTitle:        "📊 *Synthèse hebdomadaire Sparkkeep*",
		IntelligenceDigestTitle:  "📊 *Synthèse d'intelligence Sparkkeep*",
		WeeklyDigestSummary:      "%d derniers jours : %d cartes capturées",
		IntelligenceDigestWindow: "Période : %d derniers jours • Total : %d étincelles",
		StatusInbox:              "• 📥 Boîte de réception : %d",
		StatusDoing:              "• ⚡ En cours : %d",
		StatusDone:               "• ✅ Terminé : %d",
		StatusShelved:            "• 📦 Mis de côté : %d",
		StatusInProgress:         "• ⚡ En cours : %d",
	},
	"de": {
		AnalysisFailed:         "Analyse fehlgeschlagen",
		ResearchComplete:       "Recherche abgeschlossen",
		ResearchCompleteHeader: "🔬 *Recherche abgeschlossen*",
		ResearchFailed:         "Recherche fehlgeschlagen",
		ResearchFailedHeader:   "❌ *Recherche fehlgeschlagen*",
		ResearchFailedStep:     "*Fehlgeschlagener Schritt:* %s",
		ResearchUpdate:         "Recherche-Update",
		Researching:            "⏳ Recherche läuft...",
		ResearchAlreadyRunning: "Recherche läuft bereits",
		CardSaved:              "Karte gespeichert!",
		FailedToCreateCard:     "Kartenerstellung fehlgeschlagen",
		FailedToLoadPlaybooks:  "Playbooks konnten nicht geladen werden",
		CommittedTo:            "Festgelegt auf %s",
		NoActionableContent:    "Kein handlungsrelevanter Inhalt gefunden.",
		WorthResearching:       "Recherche lohnt sich",
		Horizon:                "Horizont",
		Tags:                   "Tags",
		Verdict:                "Urteil",
		Confidence:             "Zuversicht",
		ConfidenceSuffix:       " (%s Zuversicht)",
		NextActions:            "Nächste Aktionen",
		KeyClaims:              "Zentrale Behauptungen:",
		RecentSparks:           "*Neueste Impulse:*",
		TopSparks:              "*Top-Impulse:*",
		OpenDashboard:          "Dashboard öffnen: %s",
		ActionsReplyWith:       "Aktionen (antworte mit):",
		TriggerDeepResearch:    "Tiefenforschung starten",
		SetShortTerm:           "Auf Kurzfristig (Jetzt) setzen",
		SetMediumTerm:          "Auf Mittelfristig (Als Nächstes) setzen",
		SetLongTerm:            "Auf Langfristig (Später) setzen",
		DiscardCard:            "Karte verwerfen",
		ReadFullReport:         "Vollständigen Bericht lesen: %s",
		ResearchInterrupted:    "⚠️ Recherche unterbrochen für: %s",
		StartedResearch:        "Tiefenforschung für Karte %d gestartet",
		MovedShortTerm:         "Karte %d auf Kurzfristig (In Bearbeitung) gesetzt",
		MovedMediumTerm:        "Karte %d auf Mittelfristig (Zu erledigen) gesetzt",
		MovedLongTerm:          "Karte %d auf Langfristig gesetzt",
		MovedInbox:             "Karte %d in den Posteingang verschoben",
		CardShelved:            "Karte %d zurückgestellt",
		HelpText: "👋 *Sparkkeep* — sende mir beliebige Inhalte und daraus wird eine Karte.\n\n" +
			"*Was du teilen kannst:*\n" +
			"• Ein Link → wird abgerufen und analysiert\n" +
			"• Ein Foto, Video oder eine Datei → wird anhand der Medien analysiert\n" +
			"• Eine Sprachnachricht → wird transkribiert und analysiert\n" +
			"• Einfacher Text → wird als Notiz erfasst\n\n" +
			"*Was du tun kannst:*\n" +
			"• Tippe auf Tun / Erledigt / Zurückstellen auf einer Karte\n" +
			"• Antworte auf eine Karte mit Text oder #Tags, um sie direkt zu aktualisieren\n" +
			"• /digest — die letzten 7 Tage: Anzahlen nach Status und deine 5 neuesten Impulse\n" +
			"• /morning — sofortiger morgendlicher Recherche-Digest\n" +
			"• /inbox — ausstehende Karten im Posteingang prüfen",
		InboxHeader:  "📥 *Karten im Posteingang (%d):*",
		NoInboxCards: "Posteingang ist leer! Keine unverarbeiteten Karten.",

		MorningDigestTitle:  "☀️ <b>Morgen-Recherche-Digest</b>",
		NoResearchOvernight: "Über Nacht wurden keine Recherche-Berichte abgeschlossen.",
		ReportsReady:        "%d Bericht(e) bereit:\n\n",
		NoReportsReady:      "0 fertige Berichte bereit.\n",
		MorningFailures:     "⚠️ <b>Fehlschläge (%d):</b>\n",
		UnknownError:        "unbekannter Fehler",

		WeeklyDigestTitle:        "📊 *Wöchentlicher Sparkkeep-Digest*",
		IntelligenceDigestTitle:  "📊 *Sparkkeep Intelligence-Digest*",
		WeeklyDigestSummary:      "Letzte %d Tage: %d Karten erfasst",
		IntelligenceDigestWindow: "Zeitraum: Letzte %d Tage • Gesamt: %d Impulse",
		StatusInbox:              "• 📥 Posteingang: %d",
		StatusDoing:              "• ⚡ In Bearbeitung: %d",
		StatusDone:               "• ✅ Erledigt: %d",
		StatusShelved:            "• 📦 Zurückgestellt: %d",
		StatusInProgress:         "• ⚡ In Bearbeitung: %d",
	},
}

// GetHeadings returns localized Markdown headings for knowledge sinks.
func GetHeadings(loc string) Headings {
	norm := Normalize(loc)
	if h, ok := headingsCatalog[norm]; ok {
		return h
	}
	return headingsCatalog["en"]
}

// GetButtons returns localized interactive button labels.
func GetButtons(loc string) Buttons {
	norm := Normalize(loc)
	if b, ok := buttonsCatalog[norm]; ok {
		return b
	}
	return buttonsCatalog["en"]
}

// GetMessages returns localized message chrome, feedback, and digest templates.
func GetMessages(loc string) Messages {
	norm := Normalize(loc)
	if m, ok := messagesCatalog[norm]; ok {
		return m
	}
	return messagesCatalog["en"]
}
