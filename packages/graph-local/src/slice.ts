// Shape of the case slice written by pipelines/src/fraud_data/case_slice.py.
export interface SliceTransaction {
  id: string; amount_cents: number; product_cd: string | null;
  card_fields: Record<string, string | null>;
  region: string | null; country: string | null; dist1: string | null;
  purchaser_email_domain: string | null; recipient_email_domain: string | null;
  customer_id: string; ts: string; channel: string; risk_score: number | null;
}
export interface SliceClosedCase {
  id: string; customer_id: string; card_id: string; opened_at: string; closed_at: string;
  outcome: "confirmed_fraud" | "cleared"; pattern: string; first_fraud_txn_id: string | null;
  txn_ids: string[]; exposure_cents: number; connected_card_ids: string[]; actions_taken: string[];
  report_filed: boolean; analyst_notes: string;
}
export interface CaseSlice {
  schema: "graphsentinel.case-slice/v1";
  case: { id: string; opened_at: string; trigger_type: "risk_score" | "customer_report" | "analyst_request"; trigger_text: string;
    flagged_txn_id: string; card_id: string; customer_id: string; risk_score: number | null };
  scope: { mode: "strict_replay"; effective_as_of: string; neighborhood_start: string; neighborhood_hours: number; time_semantics: string };
  customer_transactions: SliceTransaction[];
  neighbor_transactions: SliceTransaction[];
  region_window: { region: string | null; transactions: number; other_customers: number };
  identity: Record<string, { device_type: string | null; device_profile: string | null }>;
  closed_cases: SliceClosedCase[];
  history_stats: { visible_closed_cases: number; cardholder_reported: { confirmed_fraud: number; cleared: number }; model_scored: { confirmed_fraud: number; cleared: number } };
  manifest: { sources: Record<string, { bytes: number; sha256: string | null }>; quarantined_rows: number; closed_cases_hidden_as_future: number; card_link_rule: string };
}
