#!/usr/bin/env python3
"""Phase F2: turns the finance Prisma schema into a section of the foundation schema.

Rules (docs/FINANCE_MERGE_PLAN.md, decisions A and E, phase F2):
  1. Drop the finance login and branch models (Employee, Location) and enums (Role, RecordStatus).
     RecordStatus is identical in the foundation and is reused.
  2. Every finance table carries company_id, with no default, and a foreign key to companies.
     Line tables that had no company_id get one.
  3. Every finance table gets a unique (company_id, id), so any table can be referenced together
     with its company.
  4. Every relation is composite: (company_id, x_id) -> (company_id, id). A row can never point at
     a row of another company; the database refuses it.
  5. Employee becomes Membership (the acting user, decision A). Location becomes the foundation Location.
     Field and column names stay (employee_id, requester_id, ...), so finance code changes less.
  6. Optional relations get onDelete: Restrict. SET NULL on a composite key would also clear company_id.
     Finance deletes are already guarded by usage checks.
  7. One-to-one relations get a unique (company_id, x_id) as Prisma requires.

Usage: transform.py <finance schema.prisma>  -> prints the models and enums to stdout,
and writes the back-relations for Company, Membership, and Location to stderr as JSON.
"""
import json
import re
import sys

DROP_MODELS = {"Employee", "Location"}
DROP_ENUMS = {"Role", "RecordStatus"}
FOUNDATION_TARGETS = {"Employee": "Membership", "Location": "Location"}


def blocks(text):
    """Yields (kind, name, header_comment, body_lines) for each model or enum."""
    lines = text.splitlines()
    i = 0
    comment = []
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^(model|enum)\s+(\w+)\s*\{", line)
        if m:
            body = []
            i += 1
            while not lines[i].startswith("}"):
                body.append(lines[i])
                i += 1
            yield m.group(1), m.group(2), comment, body
            comment = []
        elif line.startswith("///") or line.startswith("//"):
            comment.append(line)
        elif line.strip() == "":
            comment = [] if not comment or comment[-1] != "" else comment
        i += 1


def plural(name):
    lower = name[0].lower() + name[1:]
    if lower.endswith("y") and not lower.endswith("ey"):
        return lower[:-1] + "ies"
    if lower.endswith("s"):
        return lower + "es"
    return lower + "s"


RELATION = re.compile(r"^(\s*)(\w+)(\s+)(\w+)(\??)(\s+)@relation\((.*)\)(.*)$")


def main():
    source = open(sys.argv[1], encoding="utf-8").read()
    parsed = list(blocks(source))
    finance_models = {name for kind, name, _, _ in parsed if kind == "model" and name not in DROP_MODELS}

    # Back-relations the removed Employee and Location models held. They move to Membership and Location.
    moved_back = {"Membership": [], "Location": []}
    for kind, name, _, body in parsed:
        if kind == "model" and name in DROP_MODELS:
            target = FOUNDATION_TARGETS[name]
            for line in body:
                m = re.match(r"^\s*(\w+)\s+(\w+)(\[\]|\?)\s*(@relation\(\"(\w+)\"\))?\s*$", line)
                if m and m.group(2) in finance_models:
                    moved_back[target].append(
                        {"field": m.group(1), "type": m.group(2), "suffix": m.group(3), "relation": m.group(5)}
                    )

    out = []
    company_back = []
    for kind, name, comment, body in parsed:
        if kind == "enum":
            if name in DROP_ENUMS:
                continue
            out.extend(comment)
            out.append(f"enum {name} {{")
            out.extend(body)
            out.append("}")
            out.append("")
            continue
        if name in DROP_MODELS:
            continue

        fields = []
        model_attrs = []
        has_company = any(re.match(r"^\s*companyId\s", line) for line in body)
        unique_fields = set()
        one_to_one = []
        for line in body:
            if re.match(r"^\s*@@", line):
                model_attrs.append(line)
                continue
            fm = re.match(r"^\s*(\w+)\s+\w+", line)
            if fm and "@unique" in line and "@relation" not in line:
                unique_fields.add(fm.group(1))
            if re.match(r"^\s*companyId\s", line):
                line = line.replace(' @default("tradivia")', "")
            rm = RELATION.match(line)
            if rm:
                indent, field, sp1, target, optional, sp2, args, rest = rm.groups()
                target_out = FOUNDATION_TARGETS.get(target, target)
                if (target in finance_models or target in FOUNDATION_TARGETS) and "fields:" in args:
                    fm2 = re.search(r"fields:\s*\[(\w+)\]", args)
                    if not fm2:
                        raise SystemExit(f"{name}.{field}: relation without one field: {args}")
                    fk = fm2.group(1)
                    args = re.sub(r"fields:\s*\[\w+\]", f"fields: [companyId, {fk}]", args)
                    args = re.sub(r"references:\s*\[id\]", "references: [companyId, id]", args)
                    if optional and "onDelete" not in args:
                        args += ", onDelete: Restrict"
                    args = args.replace("onDelete: SetNull", "onDelete: Restrict")
                    if fk in unique_fields:
                        one_to_one.append(fk)
                line = f"{indent}{field}{sp1}{target_out}{optional}{sp2}@relation({args}){rest}"
            fields.append(line)

        # Unique fields declared after the relation line are found in a second pass.
        for line in body:
            fm = re.match(r"^\s*(\w+)\s+\w+", line)
            if fm and "@unique" in line and "@relation" not in line:
                unique_fields.add(fm.group(1))
        for line in fields:
            rm = RELATION.match(line)
            if rm:
                fk = re.search(r"fields:\s*\[companyId,\s*(\w+)\]", rm.group(7))
                if fk and fk.group(1) in unique_fields and fk.group(1) not in one_to_one:
                    one_to_one.append(fk.group(1))

        if not has_company:
            # Insert company_id after the primary key.
            fields.insert(1, '  companyId String @map("company_id")')
        fields.append("  company Company @relation(fields: [companyId], references: [id])")
        company_back.append({"field": plural(name), "type": name})

        attrs = ["  @@unique([companyId, id])"]
        for fk in one_to_one:
            attrs.append(f"  @@unique([companyId, {fk}])")
        if not has_company and not any("@@index([companyId" in a for a in model_attrs):
            attrs.append("  @@index([companyId])")
        # Keep @@map last, as the foundation does.
        map_attr = [a for a in model_attrs if a.strip().startswith("@@map")]
        other = [a for a in model_attrs if not a.strip().startswith("@@map")]

        out.extend(comment)
        out.append(f"model {name} {{")
        out.extend(fields)
        out.append("")
        out.extend(other + attrs + map_attr)
        out.append("}")
        out.append("")

    print("\n".join(out).rstrip() + "\n")
    json.dump({"Company": company_back, **moved_back}, sys.stderr, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
