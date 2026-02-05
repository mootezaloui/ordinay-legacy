'use strict';

/**
 * Legal Research - Example Traces and Artifacts
 *
 * Demonstrates complete research workflows including:
 * - Multi-step research plans
 * - Research execution traces
 * - Output artifacts with proper citations
 */

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 1: Contract Termination Research
// ═══════════════════════════════════════════════════════════════════

/**
 * Example: Research plan for contract termination rights
 */
const EXAMPLE_RESEARCH_PLAN = {
  planId: 'plan_1707130800000_abc123',
  query: 'Außerordentliche Kundigung Dauerschuldverhaltnis wichtiger Grund',
  jurisdiction: 'DE',
  researchType: 'comprehensive',
  depth: 'standard',
  detectedDomains: ['zivilrecht'],
  estimatedSteps: 5,
  steps: [
    {
      stepId: 'step_1',
      type: 'legal_research',
      phase: 'statutory',
      name: 'Gesetzesrecherche / Statutory Research',
      description: 'Search relevant statutes and regulations',
      tool: 'legalResearch',
      params: {
        query: 'Außerordentliche Kundigung Dauerschuldverhaltnis wichtiger Grund',
        researchType: 'statute',
        jurisdiction: 'DE',
        sources: ['gesetze', 'verordnung'],
        maxResults: 10,
        language: 'de',
      },
      purpose: 'Identify applicable legal norms',
      dependsOn: [],
    },
    {
      stepId: 'step_2',
      type: 'legal_research',
      phase: 'primary_jurisprudence',
      name: 'Hochstrichterliche Rechtsprechung / High Court Jurisprudence',
      description: 'Search decisions from highest courts',
      tool: 'legalResearch',
      params: {
        query: 'Außerordentliche Kundigung Dauerschuldverhaltnis wichtiger Grund',
        researchType: 'jurisprudence',
        jurisdiction: 'DE',
        sources: ['bgh', 'olg', 'lg'],
        maxResults: 15,
        language: 'de',
      },
      purpose: 'Find authoritative precedents',
      dependsOn: ['step_1'],
    },
    {
      stepId: 'step_3',
      type: 'legal_research',
      phase: 'secondary_jurisprudence',
      name: 'Instanzrechtsprechung / Lower Court Jurisprudence',
      description: 'Search decisions from appellate and regional courts',
      tool: 'legalResearch',
      params: {
        query: 'Außerordentliche Kundigung wichtiger Grund Abwagung',
        researchType: 'jurisprudence',
        jurisdiction: 'DE',
        sources: ['olg', 'lg'],
        maxResults: 10,
        language: 'de',
      },
      purpose: 'Find supporting precedents and trends',
      dependsOn: ['step_2'],
    },
    {
      stepId: 'step_4',
      type: 'legal_research',
      phase: 'commentary',
      name: 'Kommentarliteratur / Legal Commentary',
      description: 'Search legal doctrine and commentary',
      tool: 'legalResearch',
      params: {
        query: '§ 314 BGB außerordentliche Kundigung',
        researchType: 'comprehensive',
        jurisdiction: 'DE',
        sources: ['commentary'],
        maxResults: 5,
        language: 'de',
      },
      purpose: 'Gather doctrinal analysis and interpretation',
      dependsOn: ['step_3'],
    },
    {
      stepId: 'step_5',
      type: 'synthesis',
      phase: 'synthesis',
      name: 'Synthese / Synthesis',
      description: 'Combine and analyze all findings',
      actions: [
        'Cluster results by legal issue',
        'Identify consensus and conflicts',
        'Note uncertainties and open questions',
        'Build citation list',
      ],
      outputType: 'legal_research_artifact',
      dependsOn: ['step_1', 'step_2', 'step_3', 'step_4'],
    },
  ],
  metadata: {
    createdAt: '2026-02-05T10:00:00Z',
    language: 'de',
  },
};

/**
 * Example: Research execution trace
 */
const EXAMPLE_RESEARCH_TRACE = {
  planId: 'plan_1707130800000_abc123',
  startedAt: '2026-02-05T10:00:00Z',
  completedAt: '2026-02-05T10:00:15Z',
  status: 'completed',
  steps: [
    {
      stepId: 'step_1',
      name: 'Gesetzesrecherche / Statutory Research',
      startedAt: '2026-02-05T10:00:00Z',
      completedAt: '2026-02-05T10:00:02Z',
      status: 'completed',
      result: {
        resultCount: 3,
        primarySources: [
          {
            citation: 'BGB § 314',
            title: 'Kundigung von Dauerschuldverhaltnissen aus wichtigem Grund',
            summary: '(1) Dauerschuldverhaltnisse kann jeder Vertragsteil aus wichtigem Grund ohne Einhaltung einer Kundigungsfrist kundigen...',
            sourceType: 'gesetze',
            sourceWeight: 1.0,
          },
        ],
      },
    },
    {
      stepId: 'step_2',
      name: 'Hochstrichterliche Rechtsprechung / High Court Jurisprudence',
      startedAt: '2026-02-05T10:00:02Z',
      completedAt: '2026-02-05T10:00:06Z',
      status: 'completed',
      result: {
        resultCount: 8,
        clusters: [
          {
            topic: 'Kundigung / Termination',
            consensus: 'High court consensus established',
            results: [
              {
                citation: 'BGH, 2024-03-15 - I ZR 123/23',
                title: 'Zur außerordentlichen Kundigung bei Vertrauensverlust',
                sourceWeight: 1.0,
              },
            ],
          },
        ],
      },
    },
    {
      stepId: 'step_3',
      name: 'Instanzrechtsprechung / Lower Court Jurisprudence',
      startedAt: '2026-02-05T10:00:06Z',
      completedAt: '2026-02-05T10:00:09Z',
      status: 'completed',
      result: {
        resultCount: 5,
      },
    },
    {
      stepId: 'step_4',
      name: 'Kommentarliteratur / Legal Commentary',
      startedAt: '2026-02-05T10:00:09Z',
      completedAt: '2026-02-05T10:00:12Z',
      status: 'completed',
      result: {
        resultCount: 3,
      },
    },
    {
      stepId: 'step_5',
      name: 'Synthese / Synthesis',
      startedAt: '2026-02-05T10:00:12Z',
      completedAt: '2026-02-05T10:00:15Z',
      status: 'completed',
      result: {
        totalSources: 19,
        uniqueCitations: 15,
        domains: ['zivilrecht'],
      },
    },
  ],
  errors: [],
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 2: Output Artifact
// ═══════════════════════════════════════════════════════════════════

/**
 * Example: Legal research output artifact
 *
 * This is the final structured output that the agent presents to the user.
 */
const EXAMPLE_OUTPUT_ARTIFACT = {
  artifactType: 'legal_research',
  version: '1.0',
  generatedAt: '2026-02-05T10:00:15Z',

  // Query and scope
  query: {
    original: 'Wann kann ich einen Vertrag außerordentlich kundigen?',
    normalized: 'Außerordentliche Kundigung Dauerschuldverhaltnis wichtiger Grund',
    jurisdiction: 'DE',
    domains: ['Zivilrecht'],
  },

  // Executive summary
  summary: {
    de: `Die außerordentliche Kundigung eines Dauerschuldverhaltnisses ist nach § 314 BGB bei Vorliegen eines wichtigen Grundes moglich. Ein wichtiger Grund liegt vor, wenn dem kundigenden Teil unter Berucksichtigung aller Umstande des Einzelfalls und unter Abwagung der beiderseitigen Interessen die Fortsetzung des Vertragsverhaltnisses bis zur vereinbarten Beendigung oder bis zum Ablauf einer Kundigungsfrist nicht zugemutet werden kann.`,
    en: `Extraordinary termination of a continuing obligation is possible under § 314 BGB when there is an important reason. An important reason exists when, considering all circumstances of the individual case and weighing the mutual interests, continuation of the contractual relationship until the agreed end or until expiration of a notice period cannot be expected of the terminating party.`,
  },

  // Legal basis
  legalBasis: {
    primaryNorm: {
      citation: 'BGB § 314',
      title: 'Kundigung von Dauerschuldverhaltnissen aus wichtigem Grund',
      text: '(1) Dauerschuldverhaltnisse kann jeder Vertragsteil aus wichtigem Grund ohne Einhaltung einer Kundigungsfrist kundigen. Ein wichtiger Grund liegt vor, wenn dem kundigenden Teil unter Berucksichtigung aller Umstande des Einzelfalls und unter Abwagung der beiderseitigen Interessen die Fortsetzung des Vertragsverhaltnisses bis zur vereinbarten Beendigung oder bis zum Ablauf einer Kundigungsfrist nicht zugemutet werden kann.',
      url: 'https://www.gesetze-im-internet.de/bgb/__314.html',
    },
    relatedNorms: [
      { citation: 'BGB § 626', title: 'Fristlose Kundigung aus wichtigem Grund (Dienstvertrag)' },
      { citation: 'BGB § 543', title: 'Außerordentliche fristlose Kundigung (Mietvertrag)' },
      { citation: 'BGB § 569', title: 'Außerordentliche fristlose Kundigung (Wohnraum)' },
    ],
  },

  // Key findings
  findings: [
    {
      topic: 'Definition "Wichtiger Grund"',
      content: 'Ein wichtiger Grund liegt vor, wenn die Fortsetzung des Vertrags unter Berucksichtigung aller Umstande und Abwagung der Interessen unzumutbar ist.',
      consensus: 'Herrschende Meinung',
      sources: ['BGH, 2024-03-15 - I ZR 123/23', 'MuKoBGB/Gaier, § 314 Rn. 15'],
    },
    {
      topic: 'Abmahnungserfordernis',
      content: 'In der Regel ist vor einer außerordentlichen Kundigung eine Abmahnung erforderlich, es sei denn, diese ist entbehrlich (§ 314 Abs. 2 BGB).',
      consensus: 'Herrschende Meinung mit Ausnahmen',
      sources: ['BGH, 2023-11-22 - II ZR 456/22', 'Palandt/Grunewald, § 314 Rn. 8'],
    },
    {
      topic: 'Kundigungserklarungsfrist',
      content: 'Die Kundigung muss innerhalb angemessener Frist nach Kenntniserlangung vom Kundigungsgrund erfolgen (§ 314 Abs. 3 BGB).',
      consensus: 'Einheitliche Rechtsprechung',
      sources: ['BGH, 2024-01-10 - III ZR 789/23'],
    },
  ],

  // Uncertainties
  uncertainties: [
    {
      issue: 'Angemessene Frist fur Kundigungserklarung',
      description: 'Die Lange der "angemessenen Frist" nach § 314 Abs. 3 BGB ist nicht gesetzlich definiert und hangt vom Einzelfall ab.',
      guideline: 'In der Praxis wird oft eine Frist von 2 Wochen bis 2 Monaten als angemessen angesehen.',
      sources: ['Verschiedene OLG-Entscheidungen'],
    },
    {
      issue: 'Entbehrlichkeit der Abmahnung',
      description: 'Wann eine Abmahnung entbehrlich ist, ist einzelfallabhangig und nicht immer eindeutig.',
      guideline: 'Entbehrlich bei besonders schwerwiegenden Vertrauensverletzungen oder offensichtlicher Erfolglosigkeit.',
      sources: ['BGH, unterschiedliche Entscheidungen'],
    },
  ],

  // Full citations
  citations: [
    {
      index: 1,
      type: 'statute',
      citation: 'BGB § 314',
      title: 'Kundigung von Dauerschuldverhaltnissen aus wichtigem Grund',
      url: 'https://www.gesetze-im-internet.de/bgb/__314.html',
      accessedAt: '2026-02-05T10:00:00Z',
    },
    {
      index: 2,
      type: 'jurisprudence',
      citation: 'BGH, 2024-03-15 - I ZR 123/23',
      title: 'Zur außerordentlichen Kundigung bei Vertrauensverlust',
      court: 'Bundesgerichtshof',
      url: 'https://www.rechtsprechung-im-internet.de/bgh/example',
      accessedAt: '2026-02-05T10:00:03Z',
    },
    {
      index: 3,
      type: 'jurisprudence',
      citation: 'BGH, 2023-11-22 - II ZR 456/22',
      title: 'Abmahnungserfordernis bei außerordentlicher Kundigung',
      court: 'Bundesgerichtshof',
      url: 'https://www.rechtsprechung-im-internet.de/bgh/example2',
      accessedAt: '2026-02-05T10:00:04Z',
    },
    {
      index: 4,
      type: 'commentary',
      citation: 'MuKoBGB/Gaier, 9. Aufl. 2026, § 314 Rn. 15-23',
      title: 'Munchener Kommentar zum BGB',
      url: 'https://beck-online.beck.de/example',
      accessedAt: '2026-02-05T10:00:10Z',
    },
    {
      index: 5,
      type: 'commentary',
      citation: 'Palandt/Grunewald, 85. Aufl. 2026, § 314 Rn. 8',
      title: 'Palandt Burgerliches Gesetzbuch',
      url: 'https://beck-online.beck.de/example2',
      accessedAt: '2026-02-05T10:00:11Z',
    },
  ],

  // Research metadata
  metadata: {
    researchDepth: 'standard',
    sourcesSearched: ['gesetze', 'bgh', 'olg', 'lg', 'commentary'],
    totalResultsFound: 19,
    uniqueSourcesCited: 5,
    researchDuration: 15000,
    planId: 'plan_1707130800000_abc123',
  },

  // Mandatory disclaimer
  disclaimer: {
    de: 'WICHTIGER HINWEIS: Diese Rechercheergebnisse stellen keine Rechtsberatung dar und ersetzen nicht die Konsultation eines Rechtsanwalts. Die Informationen wurden aus offentlich zuganglichen Quellen zusammengestellt und konnen unvollstandig oder nicht auf Ihren spezifischen Fall anwendbar sein. Fur rechtsverbindliche Auskunfte wenden Sie sich bitte an einen zugelassenen Rechtsanwalt.',
    en: 'IMPORTANT NOTICE: These research results do not constitute legal advice and do not replace consultation with an attorney. The information has been compiled from publicly available sources and may be incomplete or not applicable to your specific case. For legally binding information, please consult a licensed attorney.',
  },
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 3: Agent Response Format
// ═══════════════════════════════════════════════════════════════════

/**
 * Example: How the agent formats the research for the user
 */
const EXAMPLE_AGENT_RESPONSE = `
## Rechtliche Recherche: Außerordentliche Kundigung

### Zusammenfassung

Die außerordentliche Kundigung eines Dauerschuldverhaltnisses ist nach **§ 314 BGB** bei Vorliegen eines wichtigen Grundes moglich.

### Rechtsgrundlage

**§ 314 BGB - Kundigung von Dauerschuldverhaltnissen aus wichtigem Grund**

> (1) Dauerschuldverhaltnisse kann jeder Vertragsteil aus wichtigem Grund ohne Einhaltung einer Kundigungsfrist kundigen. Ein wichtiger Grund liegt vor, wenn dem kundigenden Teil unter Berucksichtigung aller Umstande des Einzelfalls und unter Abwagung der beiderseitigen Interessen die Fortsetzung des Vertragsverhaltnisses bis zur vereinbarten Beendigung oder bis zum Ablauf einer Kundigungsfrist nicht zugemutet werden kann.

### Wesentliche Erkenntnisse

1. **Definition "Wichtiger Grund"**: Ein wichtiger Grund liegt vor, wenn die Fortsetzung des Vertrags unter Berucksichtigung aller Umstande und Abwagung der Interessen unzumutbar ist. [1, 4]

2. **Abmahnungserfordernis**: In der Regel ist vor einer außerordentlichen Kundigung eine Abmahnung erforderlich, es sei denn, diese ist entbehrlich (§ 314 Abs. 2 BGB). [2, 5]

3. **Kundigungserklarungsfrist**: Die Kundigung muss innerhalb angemessener Frist nach Kenntniserlangung vom Kundigungsgrund erfolgen (§ 314 Abs. 3 BGB). [3]

### Offene Fragen / Rechtsunsicherheiten

- **Angemessene Frist**: Die Lange der "angemessenen Frist" ist einzelfallabhangig (oft 2 Wochen bis 2 Monate).
- **Entbehrlichkeit der Abmahnung**: Bei besonders schwerwiegenden Vertrauensverletzungen kann eine Abmahnung entbehrlich sein.

### Quellen

[1] BGB § 314 - https://www.gesetze-im-internet.de/bgb/__314.html
[2] BGH, 2024-03-15 - I ZR 123/23
[3] BGH, 2023-11-22 - II ZR 456/22
[4] MuKoBGB/Gaier, 9. Aufl. 2026, § 314 Rn. 15-23
[5] Palandt/Grunewald, 85. Aufl. 2026, § 314 Rn. 8

---

⚠️ **Hinweis**: Diese Informationen stellen keine Rechtsberatung dar. Fur rechtsverbindliche Auskunfte konsultieren Sie bitte einen Rechtsanwalt.
`;

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  EXAMPLE_RESEARCH_PLAN,
  EXAMPLE_RESEARCH_TRACE,
  EXAMPLE_OUTPUT_ARTIFACT,
  EXAMPLE_AGENT_RESPONSE,
};
