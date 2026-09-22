import json
from decimal import Decimal
from pathlib import Path

def test_shared_primitive_fixture_is_exact():
    data=json.loads(Path("pipelines/tests/fixtures/primitives.json").read_text())
    for row in data["money"]:
        assert int(Decimal(row["input"])*100)==row["cents"]
    for row in data["ids"]:
        assert row["input"]==row["output"]
    for row in data["timeComparisons"]:
        actual=(row["a"]>row["b"])-(row["a"]<row["b"])
        assert actual==row["result"]
