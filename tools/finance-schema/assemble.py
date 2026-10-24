#!/usr/bin/env python3
"""Phase F2: appends the transformed finance section to the foundation schema and adds the
back-relations Prisma needs on Company, Membership, and Location.

Usage: assemble.py <foundation schema> <finance section> <back-relations json>  (rewrites the schema)
"""
import json
import re
import sys

schema_path, section_path, back_path = sys.argv[1:4]
schema = open(schema_path, encoding="utf-8").read()
section = open(section_path, encoding="utf-8").read()
back = json.load(open(back_path, encoding="utf-8"))

MARK = "// ===== Finance module (phase F2) ====="
if MARK in schema:
    raise SystemExit("finance section already present")


def add_fields(text, model, lines):
    m = re.search(rf"^model {model} \{{\n(.*?)\n\n(  @@)", text, re.S | re.M)
    if not m:
        raise SystemExit(f"cannot place back-relations in {model}")
    insert_at = m.start(2) - 1
    block = "\n  // Finance (phase F2)\n" + "\n".join(lines) + "\n"
    return text[:insert_at] + block + text[insert_at:]


def relation_line(entry):
    name = f' @relation("{entry["relation"]}")' if entry.get("relation") else ""
    suffix = entry.get("suffix", "[]")
    return f'  {entry["field"]} {entry["type"]}{suffix}{name}'


schema = add_fields(schema, "Company", [relation_line({**e, "suffix": "[]"}) for e in back["Company"]])
schema = add_fields(schema, "Membership", [relation_line(e) for e in back["Membership"]])
schema = add_fields(schema, "Location", [relation_line(e) for e in back["Location"]])

header = f"""
{MARK}
// Generated from Reference/erp-finance (77ce653) by tools/finance-schema/transform.py, then owned here.
// - Every table has company_id, a foreign key to companies, and a unique (company_id, id).
// - Every relation is composite (company_id, x_id) -> (company_id, id): no row can point at another company.
// - employee_id, requester_id, supervisor_id, voided_by_id, and owner_id reference memberships (decision A).
// - location_id references the foundation locations table.
// - Hand-written rules Prisma does not model are in migration 20261024100000_finance_schema:
//   the partial unique index on product barcodes and the journal_lines_center_guard trigger.
"""
open(schema_path, "w", encoding="utf-8").write(schema.rstrip() + "\n" + header + "\n" + section)
print("assembled")
