import { z } from "zod";
export const StatusSchema=z.enum(["open","closed_fraud","closed_legitimate","escalated"]);
export const VerdictSchema=z.enum(["fraud","legitimate","uncertain"]);
export const PatternSchema=z.enum(["card_testing","card_not_present_fraud","card_not_present_new_device","out_of_region_use","account_takeover","undocumented","none"]);
export const ActionNameSchema=z.enum(["ALLOW_TRANSACTION","DECLINE_TRANSACTION","MONITOR_CARD","MONITOR_CONNECTED_CARDS","WARN_CUSTOMER","VERIFY_WITH_CUSTOMER","STEP_UP_AUTH","BLOCK_CARD","BLOCK_ALL_CARDS","GENERATE_REPORT","CREATE_CASE","FILE_REPORT","ESCALATE_TO_ANALYST","CLOSE_NO_FRAUD"]);
export const RouteSchema=z.enum(["auto","L1","L2"]);
const finiteNonnegative=z.number().finite().nonnegative(), nonnegativeInteger=z.number().int().nonnegative();
const DateSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,"Expected YYYY-MM-DD");
export const EvidenceSchema=z.strictObject({claim:z.string(),source:z.enum(["graph","document","customer","external"]),ref:z.string(),entity_ids:z.array(z.string())});
export const EvidenceRequestSchema=z.strictObject({type:z.enum(["customer_validation","step_up_auth","analyst_info"]),asked_after_step:nonnegativeInteger,assumed_response:z.string()});
export const ActionSchema=z.strictObject({action:ActionNameSchema,route:RouteSchema,reason:z.string()});
export const CaseSchema=z.strictObject({status:StatusSchema,verdict:VerdictSchema,fraud_probability:z.number().finite().min(0).max(1),pattern:PatternSchema,pattern_description:z.string(),affected_txn_ids:z.array(z.string()),first_suspicious_txn_id:z.string(),connected_card_ids:z.array(z.string()),connected_device_profiles:z.array(z.string()),exposure_usd:finiteNonnegative,evidence:z.array(EvidenceSchema),similar_prior_cases:z.array(z.string()),summary:z.string(),written_to_graph:z.boolean(),graph_case_id:z.string()});
export const SarSchema=z.strictObject({file:z.boolean(),reason:z.string(),narrative:z.string(),subjects:z.array(z.string()),total_amount_usd:finiteNonnegative,activity_dates:z.union([z.tuple([]),z.tuple([DateSchema,DateSchema])])});
export const AnswerSchema=z.strictObject({case_id:z.string(),case:CaseSchema,evidence_requests:z.array(EvidenceRequestSchema),next_best_actions:z.strictObject({initial:z.array(ActionSchema),final:z.array(ActionSchema),what_changed:z.string()}),sar:SarSchema,stop_reason:z.string(),tool_calls:nonnegativeInteger,tokens:nonnegativeInteger,latency_s:finiteNonnegative});
export type Answer=z.infer<typeof AnswerSchema>; export type ActionName=z.infer<typeof ActionNameSchema>; export type Route=z.infer<typeof RouteSchema>; export type Verdict=z.infer<typeof VerdictSchema>; export type Pattern=z.infer<typeof PatternSchema>;
export interface AnswerValidationError{path:string;code:string;message:string}
export type AnswerValidationResult={valid:true;value:Answer;errors:[]}|{valid:false;errors:AnswerValidationError[]};
export function validateAnswerShape(value:unknown):AnswerValidationResult{const parsed=AnswerSchema.safeParse(value);if(parsed.success)return{valid:true,value:parsed.data,errors:[]};return{valid:false,errors:parsed.error.issues.map(i=>({path:i.path.map(String).join("."),code:i.code,message:i.message}))};}
