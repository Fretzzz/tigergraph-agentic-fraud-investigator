# Dataset decisions and blockers

Source: organizer Drive folder `1YDJUW1fiE7Jx8R9KqknC4IcsED9zll2A`, read through the user's connected Google Drive. Raw CSVs are local-only and not committed.

- Transactions have 397 columns: the original 393 plus `customer_id`, `ts`, `channel`, and `risk_score`. There is no canonical `card_id`, merchant identity, recipient identity, authorization status, or settlement status field.
- Identity has 41 columns and joins on `TransactionID`.
- D01 remains blocked. The 14,955 unique transaction IDs named by closed-case history all resolve, but 42 canonical historical card IDs map to more than one observed raw `card1`-`card6` tuple. Sorting a customer's observed tuples by raw fields also disagrees with 38 otherwise single-tuple canonical cards. Therefore suffix ordering or raw tuple sorting is not a valid canonical mapping rule.
- D03 remains dataset-local. Actual `ts` strings have no timezone.
- D04 remains unknown: `ProductCD` and email domains are not merchant/recipient identity.
- D05 remains unknown: no pending/settled status exists.

Organizer clarification or an explicit mapping artifact is required before constructing the authoritative canonical card graph and benchmark outputs. Independent fixture contracts and deterministic policy work remain valid.
