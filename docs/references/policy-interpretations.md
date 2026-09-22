# Policy interpretations

## R2 and R7 conflict

When a customer denial and a fully supported recurring-pattern match exist in the same scope, R7 is treated as the more specific exception: create a case, verify with and warn the customer, and do not block yet. The contradiction remains visible and can trigger R8 escalation. This is an implementation interpretation because the source gives no full precedence table.

## Evidence independence

Evidence-family tags and distinct underlying fact IDs prevent obvious double counting. They are a review aid, not a statistical proof of independence. Two paraphrases, two vector hits to one case, or two claims grounded in the same transaction do not satisfy the two-evidence stop condition.

## Operational stops

Budget exhaustion, provider timeout and graph outage are operational pauses. They never establish a legitimate or fraudulent verdict.
