/**
 * Table names in one place so a rename is a single edit and typos surface at
 * compile time rather than as a runtime Supabase error.
 */
export const TABLES = {
  users: "users",
  rfqs: "rfqs",
  rfqLineItems: "rfq_line_items",
  questionnaireQuestions: "questionnaire_questions",
  rfqAssumptions: "rfq_assumptions",
  rfqClarifications: "rfq_clarifications",
  evaluationCriteria: "evaluation_criteria",
  vendors: "vendors",
  vendorResponses: "vendor_responses",
  documents: "documents",
  extractionRuns: "extraction_runs",
  vendorQuotes: "vendor_quotes",
  questionnaireAnswers: "questionnaire_answers",
  evidence: "evidence",
  commercialTruth: "commercial_truth",
  commercialIssues: "commercial_issues",
  awardScenarios: "award_scenarios",
  awardAllocations: "award_allocations",
  decisionBriefs: "decision_briefs",
  chatSessions: "chat_sessions",
  chatMessages: "chat_messages",
  aiOperationLog: "ai_operation_log",
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
