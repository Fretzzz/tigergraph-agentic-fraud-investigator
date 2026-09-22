from __future__ import annotations
import csv,hashlib,json
from collections import Counter
from pathlib import Path

def _profile(path:Path)->dict:
 h=hashlib.sha256();rows=0;nulls=Counter();dupes=0;ids=set();minimum={};maximum={}
 with path.open('rb') as raw:
  for chunk in iter(lambda:raw.read(1024*1024),b''):h.update(chunk)
 with path.open(newline='',encoding='utf-8') as f:
  reader=csv.DictReader(f);columns=reader.fieldnames or []
  idcol='TransactionID' if 'TransactionID' in columns else ('case_id' if 'case_id' in columns else None)
  for row in reader:
   rows+=1
   for k,v in row.items():
    if v=='':nulls[k]+=1
   if idcol:
    value=row[idcol]
    if value in ids:dupes+=1
    ids.add(value)
   for key in ('ts','opened_at','closed_at'):
    value=row.get(key)
    if value:minimum[key]=min(minimum.get(key,value),value);maximum[key]=max(maximum.get(key,value),value)
 return {'file':path.name,'rows':rows,'columns':columns,'nulls':dict(nulls),'duplicate_ids':dupes,'date_min':minimum,'date_max':maximum,'sha256':h.hexdigest()}

def inspect_sources(directory:Path|str)->dict:
 directory=Path(directory);required={'transactions':'transactions.csv','identity':'identity.csv','case_pack':'case_pack.csv','closed_cases':'closed_cases_history.csv'}
 return {name:_profile(directory/file) for name,file in required.items()}

def audit_semantics(profile:dict)->dict:
 tx=set(profile['transactions']['columns'])
 explicit_card=any(x in tx for x in ('card_id','canonical_card_id'))
 merchant=any(x in tx for x in ('merchant_id','merchant_name','recipient_email'))
 status=any(x in tx for x in ('authorization_status','settlement_status','status'))
 return {'card_mapping':'resolved' if explicit_card else 'ambiguous','merchant_identity':'resolved' if merchant else 'unknown','authorization_status':'resolved' if status else 'unknown','timezone':'unknown','evidence_cutoff':'strict_replay'}

def main():
 import argparse
 p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('--output');a=p.parse_args();profile=inspect_sources(a.directory);result={'profile':profile,'decisions':audit_semantics(profile)};text=json.dumps(result,indent=2)
 if a.output:Path(a.output).write_text(text+'\n')
 else:print(text)
if __name__=='__main__':main()
