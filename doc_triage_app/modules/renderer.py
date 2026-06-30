from __future__ import annotations

from typing import Dict, List

from .utils import as_list


def analysis_to_markdown(analysis: Dict) -> str:
    criticality = analysis.get("criticality", {}) or {}
    lines: List[str] = []

    lines.append("# Important summary")
    lines.append(str(analysis.get("summary", "No summary available.")).strip())
    lines.append("")

    lines.append("# Results")
    lines.append(f"**Document type:** {analysis.get('document_type', 'Unknown')}")
    lines.append(f"**Urgency:** {criticality.get('label', 'Unknown')}")
    lines.append(f"**Criticality score:** {criticality.get('score', 'N/A')}/100")
    lines.append(f"**Recommended time window:** {criticality.get('time_window', 'N/A')}")
    lines.append("")

    reasons = as_list(criticality.get("reasons"))
    if reasons:
        lines.append("## Why this may be urgent")
        for reason in reasons:
            lines.append(f"- {reason}")
        lines.append("")

    dates = as_list(analysis.get("key_dates"))
    money = as_list(analysis.get("money_amounts"))
    phones = as_list(analysis.get("phone_numbers"))

    lines.append("## Details found")
    lines.append("- **Dates:** " + (", ".join(dates) if dates else "None detected"))
    lines.append("- **Money amounts:** " + (", ".join(money) if money else "None detected"))
    lines.append("- **Phone numbers:** " + (", ".join(phones) if phones else "None detected"))
    lines.append("")

    actions = as_list(analysis.get("action_plan"))
    if actions:
        lines.append("## Action plan")
        for idx, action in enumerate(actions, start=1):
            lines.append(f"{idx}. {action}")
        lines.append("")

    resources = as_list(analysis.get("resource_search_terms"))
    if resources:
        lines.append("## Search terms for local help")
        for term in resources:
            lines.append(f"- {term}")
        lines.append("")

    disclaimer = analysis.get("disclaimer")
    if disclaimer:
        lines.append("## Safety note")
        lines.append(str(disclaimer).strip())

    return "\n".join(lines).strip()
