#!/usr/bin/env python3
"""Analyze GitHub Actions runner minutes wasted on failing workflows."""

import json, sys, datetime, subprocess
from collections import defaultdict, Counter

def gh_api(endpoint):
    """Call gh api and return parsed JSON."""
    result = subprocess.run(
        ["gh", "api", endpoint, "--jq", "."],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        print(f"Error: {result.stderr}", file=sys.stderr)
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        print(f"JSON error: {e}", file=sys.stderr)
        print(f"Output: {result.stdout[:500]}", file=sys.stderr)
        return None

# Get all workflow names
workflows_data = gh_api("repos/adm01-debug/zapp-web-v3/actions/workflows?per_page=100")
if not workflows_data:
    sys.exit(1)

wf_names = {w['id']: w['name'] for w in workflows_data['workflows']}
print(f"Total workflows: {len(wf_names)}", file=sys.stderr)

# Get runs from pages 1-10 (1000 runs, ~1-2 days of data)
all_runs = []
for page in range(1, 11):
    endpoint = f"repos/adm01-debug/zapp-web-v3/actions/runs?per_page=100&page={page}"
    data = gh_api(endpoint)
    if not data or not data.get('workflow_runs'):
        print(f"Page {page}: empty, stopping", file=sys.stderr)
        break
    runs = data['workflow_runs']
    all_runs.extend(runs)
    print(f"Page {page}: {len(runs)} runs", file=sys.stderr)

# Also fetch specific workflow runs for the 3 stub workflows that always fail instantly
# (they often don't appear in the main list due to 0 duration)
print(f"\nTotal runs collected: {len(all_runs)}", file=sys.stderr)

# Collect duration info and summarize
wf_summaries = {}
for run in all_runs:
    wf_id = run['workflow_id']
    if wf_id not in wf_summaries:
        wf_summaries[wf_id] = {
            'name': wf_names.get(wf_id, run.get('name', f'ID:{wf_id}')),
            'total': 0, 'failed': 0, 'success': 0, 'cancelled': 0, 'other': 0,
            'fail_min': 0.0, 'suc_min': 0.0, 'total_min': 0.0,
            'runs': []
        }
    
    s = wf_summaries[wf_id]
    s['total'] += 1
    
    conclusion = run.get('conclusion')
    if conclusion == 'failure':
        s['failed'] += 1
    elif conclusion == 'success':
        s['success'] += 1
    elif conclusion == 'cancelled':
        s['cancelled'] += 1
    else:
        s['other'] += 1
    
    # Duration
    start = run.get('run_started_at')
    end = run.get('updated_at')
    if start and end:
        try:
            st = datetime.datetime.fromisoformat(start.replace('Z', '+00:00'))
            et = datetime.datetime.fromisoformat(end.replace('Z', '+00:00'))
            dur = round((et - st).total_seconds() / 60, 2)
        except:
            dur = 0.0
    else:
        dur = 0.0
    
    s['total_min'] += dur
    if conclusion == 'failure':
        s['fail_min'] += dur
    elif conclusion == 'success':
        s['suc_min'] += dur
    
    s['runs'].append({
        'id': run['id'],
        'conclusion': conclusion,
        'duration': dur,
        'created_at': run.get('created_at', ''),
        'event': run.get('event', '')
    })

# Get date range
all_dates = []
for run in all_runs:
    d = run.get('created_at', '')
    if d:
        all_dates.append(d[:10])
all_dates = sorted(set(all_dates))
span_days = max(len(all_dates), 1)

# Generate report rows
rows = []
for wf_id, s in wf_summaries.items():
    fail_rate = round(s['failed'] / s['total'] * 100, 1) if s['total'] > 0 else 0
    avg_fail = round(s['fail_min'] / s['failed'], 2) if s['failed'] > 0 else 0
    avg_suc = round(s['suc_min'] / s['success'], 2) if s['success'] > 0 else 0
    
    daily_fail_min = round(s['fail_min'] / span_days, 2)
    monthly_waste = round(daily_fail_min * 30, 1)
    
    rows.append({
        'wf_id': wf_id,
        'name': s['name'],
        'total': s['total'],
        'failed': s['failed'],
        'success': s['success'],
        'cancelled': s['cancelled'],
        'fail_rate': fail_rate,
        'avg_fail': avg_fail,
        'avg_suc': avg_suc,
        'fail_min': round(s['fail_min'], 2),
        'suc_min': round(s['suc_min'], 2),
        'total_min': round(s['total_min'], 2),
        'daily_fail_min': daily_fail_min,
        'monthly_waste': monthly_waste
    })

# Sort by fail_min desc
rows.sort(key=lambda r: r['fail_min'], reverse=True)

grand_fail_min = sum(r['fail_min'] for r in rows)
grand_all_min = sum(r['total_min'] for r in rows)

# Get workflows with NO runs in this dataset
wf_with_runs = set(wf_summaries.keys())
wf_no_runs = [(wid, name) for wid, name in sorted(wf_names.items()) if wid not in wf_with_runs]

# ==================== OUTPUT ====================

print(f"Date range: {all_dates[0]} to {all_dates[-1]} ({span_days} days)")
print(f"Total runs analyzed: {len(all_runs)}")
print(f"Unique workflows with runs: {len(wf_summaries)}")
print()

print("=== FAILING WORKFLOWS (sorted by wasted minutes) ===")
print(f"{'Rank':>4} {'Workflow Name':<58} {'Runs':>5} {'Fail':>5} {'Fail%':>6} {'F_avg':>6} {'S_avg':>6} {'Wasted':>8} {'Daily':>7} {'Mo.Waste':>9} {'%Total':>6}")
print("=" * 125)

rank = 0
for r in rows:
    if r['failed'] > 0:
        rank += 1
        pct = round(r['fail_min'] / grand_fail_min * 100, 1) if grand_fail_min > 0 else 0
        print(f"{rank:>4} {r['name'][:57]:<58} {r['total']:>5} {r['failed']:>5} {r['fail_rate']:>6}% {r['avg_fail']:>6} {r['avg_suc']:>6} {r['fail_min']:>8} {r['daily_fail_min']:>7} {r['monthly_waste']:>9} {pct:>6}%")

print()
print(f"Total wasted minutes (dataset): {grand_fail_min:.1f}")
print(f"Total all minutes (dataset): {grand_all_min:.1f}")
print(f"Waste as % of total CI time: {round(grand_fail_min/grand_all_min*100, 1) if grand_all_min > 0 else 0}%")

# Monthly projections
monthly_waste_proj = round(grand_fail_min / span_days * 30)
print(f"\nDaily waste rate: {round(grand_fail_min/span_days, 1)} min/day")
print(f"Estimated monthly waste: ~{monthly_waste_proj} min")

cost_per_min = 0.008  # GitHub hosted ubuntu-latest for private repos
monthly_cost = monthly_waste_proj * cost_per_min
print(f"Monthly cost waste: ~${monthly_cost:.2f}")
print(f"Annual cost waste: ~${monthly_cost*12:.2f}")

print()
print("=== TOP 5 MOST EXPENSIVE FAILURES ===")
top5 = [r for r in rows if r['failed'] > 0][:5]
top5_waste = sum(r['fail_min'] for r in top5)
top5_monthly_waste = sum(r['monthly_waste'] for r in top5)

for i, r in enumerate(top5, 1):
    pct = round(r['fail_min'] / grand_fail_min * 100, 1)
    mo_cost = r['monthly_waste'] * cost_per_min
    print(f"  {i}. {r['name']}")
    print(f"     {r['fail_min']} min wasted ({pct}% of total) | {r['daily_fail_min']} min/day | ~${mo_cost:.2f}/mo")
    print(f"     Fail rate: {r['fail_rate']}% | Avg fail run: {r['avg_fail']} min | Could save ~${round(r['monthly_waste']*cost_per_min,2):.2f}/mo if fixed")

cost_per_min = 0.008
print(f"\n  TOP 5 total waste: {top5_waste:.1f} min ({round(top5_waste/grand_fail_min*100,1)}% of all)")
print(f"  TOP 5 monthly waste: ~{sum(r['monthly_waste'] for r in top5):.1f} min")
print(f"  Potential savings from fixing TOP 5:")

# Scenario A: Fix (100% reduction)
print(f"    Scenario A (Fix them): ~${top5_monthly_waste*cost_per_min:.2f}/mo (${top5_monthly_waste*cost_per_min*12:.2f}/yr)")
# Scenario B: Disable (100% reduction, but lose signal)
print(f"    Scenario B (Disable them): ~${top5_monthly_waste*cost_per_min:.2f}/mo ($0 since runners are freed)")

print()
print("=== RECOMMENDATIONS ===")
print()

# Generate per-workflow recommendations
for r in top5:
    wf_id = r['wf_id']
    name = r['name']
    
    if r['fail_rate'] >= 80 and r['total'] >= 5:
        # Check if workflow is critical or has useful output
        if r['avg_fail'] > 1:
            print(f"  🛑 DISABLE or FIX: {name}")
            print(f"     Fails {r['fail_rate']}% of the time, wasting {r['daily_fail_min']} min/day")
            if r['fail_rate'] == 100:
                print(f"     ALWAYS FAILS — no value being produced, pure waste")
            print(f"     Action: Investigate root cause and fix, or disable until fixed")
        else:
            print(f"  ⚠️  FIX or TOLERATE: {name}")
            print(f"     Fails {r['fail_rate']}% but avg run is short ({r['avg_fail']} min)")
            print(f"     Fast failure = lower cost impact, but still 100% fail rate")
    else:
        print(f"  🔧 FIX: {name} (fail rate: {r['fail_rate']}%)")
    print()

# Workflows with 100% failure rate but zero duration (instant fails)
print("=== INSTANT-FAIL WORKFLOWS (zero duration, zero cost) ===")
for r in rows:
    if r['fail_rate'] == 100 and r['fail_min'] < 1:
        print(f"  ℹ️  {r['name']} — always fails instantly (0.{int(r['fail_min']*100)} min avg)")
        print(f"     No runner cost concern, but check if they serve any purpose")

print()
print("=== WORKFLOWS WITH NO RUNS IN DATASET ===")
print(f"Total: {len(wf_no_runs)}")
for wid, name in wf_no_runs:
    print(f"  {name}")

print()
print("=== WORKFLOWS WITH ZERO FAILURES ===")
for r in rows:
    if r['failed'] == 0 and r['success'] > 0:
        print(f"  ✓ {r['name']} — {r['total']} runs, all success")
