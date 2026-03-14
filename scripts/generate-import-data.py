#!/usr/bin/env python3
"""
Read LinkedIn paste from stdin, output a TypeScript data file.
Usage: cat paste.txt | python3 scripts/generate-import-data.py > scripts/linkedin-contacts.json
"""
import sys
import json

lines = sys.stdin.read().strip().split('\n')

# Find header
header_idx = None
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('First Name') and 'Last Name' in stripped:
        header_idx = i
        break

if header_idx is None:
    print("ERROR: Could not find header row", file=sys.stderr)
    sys.exit(1)

contacts = []
skipped = 0

for line in lines[header_idx + 1:]:
    line = line.rstrip()
    if not line.strip():
        continue

    # Split by tab
    parts = line.split('\t')

    first_name = parts[0].strip() if len(parts) > 0 else ''
    last_name = parts[1].strip() if len(parts) > 1 else ''
    url = parts[2].strip() if len(parts) > 2 else ''
    email = parts[3].strip() if len(parts) > 3 else ''
    company = parts[4].strip() if len(parts) > 4 else ''
    position = parts[5].strip() if len(parts) > 5 else ''
    connected_on = parts[6].strip() if len(parts) > 6 else ''

    if not first_name or not last_name:
        skipped += 1
        continue

    contacts.append({
        'firstName': first_name,
        'lastName': last_name,
        'linkedinUrl': url or None,
        'email': email or None,
        'company': company or None,
        'position': position or None,
        'connectedOn': connected_on or None,
    })

json.dump(contacts, sys.stdout, indent=None, ensure_ascii=False)
print(f"\nGenerated {len(contacts)} contacts, skipped {skipped} rows", file=sys.stderr)
