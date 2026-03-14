#!/usr/bin/env python3
"""
Parse LinkedIn connections from stdin (pasted tab-separated data) and write to TSV file.
Usage: python3 scripts/parse-paste.py < input.txt > scripts/linkedin-data.tsv
"""
import sys
import re

lines = sys.stdin.read().strip().split('\n')

# Find header
header_idx = None
for i, line in enumerate(lines):
    if 'First Name' in line and 'Last Name' in line and 'Connected On' in line:
        header_idx = i
        break

if header_idx is None:
    print("ERROR: Could not find header row", file=sys.stderr)
    sys.exit(1)

# Output header
print("First Name\tLast Name\tURL\tEmail Address\tCompany\tPosition\tConnected On")

count = 0
skipped = 0
for line in lines[header_idx + 1:]:
    line = line.rstrip()
    if not line:
        continue

    # Split by tab
    parts = line.split('\t')

    # Need at least first name and last name
    if len(parts) < 2:
        skipped += 1
        continue

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

    print(f"{first_name}\t{last_name}\t{url}\t{email}\t{company}\t{position}\t{connected_on}")
    count += 1

print(f"Processed {count} contacts, skipped {skipped} rows", file=sys.stderr)
