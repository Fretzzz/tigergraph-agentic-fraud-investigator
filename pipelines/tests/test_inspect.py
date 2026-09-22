import csv
from pathlib import Path
from fraud_data.inspect import inspect_sources,audit_semantics

def write(path,rows):
 with open(path,'w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)

def test_inspect_and_semantic_audit(tmp_path:Path):
 write(tmp_path/'transactions.csv',[{'TransactionID':str(i),'TransactionAmt':'1.00','customer_id':'C1','ts':'2016-01-01 00:00:00','card1':'1'} for i in range(6)])
 write(tmp_path/'identity.csv',[{'TransactionID':'0','DeviceInfo':'A'},{'TransactionID':'1','DeviceInfo':'B'}])
 write(tmp_path/'case_pack.csv',[{'case_id':'TEST-1','flagged_txn_id':'0','card_id':'C1-K1'}])
 write(tmp_path/'closed_cases_history.csv',[{'case_id':'CC-1','card_id':'C1-K1','txn_ids':'0|1'}])
 profile=inspect_sources(tmp_path)
 assert profile['transactions']['rows']==6
 assert profile['identity']['rows']==2
 assert 'merchant_id' not in profile['transactions']['columns']
 checks=audit_semantics(profile)
 assert checks['merchant_identity']=='unknown'
 assert checks['authorization_status']=='unknown'
 assert checks['card_mapping']=='ambiguous'
