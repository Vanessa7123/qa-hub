"""
Parse Atlassian Document Format (ADF) nodes and extract test case (CT) data.

ADF is the rich-text format used by Jira Cloud for issue descriptions.
This module converts ADF to plain text and extracts structured CT metadata
(ID, summary, status, Gherkin steps, linked bugs) from subtask descriptions.
"""

import copy
import re

from .config import CT_STATUS_MAP, CT_STATUS_KEY_TO_LABEL


# ── Plain-text extraction ──────────────────────────────────────────────────────

def adf_to_text(node):
    """Recursively extract plain text from an ADF node."""
    if not node:
        return ""
    if node.get("type") == "text":
        return node.get("text", "")
    parts = [adf_to_text(child) for child in node.get("content", [])]
    return " ".join(p for p in parts if p)


def _adf_para_to_lines(para_node):
    """Split a paragraph ADF node on hardBreak elements, yielding one string per line."""
    parts, current = [], []
    for inline in para_node.get("content", []):
        if inline.get("type") == "hardBreak":
            text = " ".join(current).strip()
            if text:
                parts.append(text)
            current = []
        else:
            t = adf_to_text(inline)
            if t:
                current.append(t)
    text = " ".join(current).strip()
    if text:
        parts.append(text)
    return parts


def adf_to_lines(node):
    """Convert top-level ADF content to a list of (text, node_type) pairs."""
    if not node:
        return []
    result = []
    for child in node.get("content", []):
        ntype = child.get("type", "")
        if ntype in ("bulletList", "orderedList"):
            for item in child.get("content", []):
                t = adf_to_text(item).strip()
                if t:
                    result.append((t, "listitem"))
        elif ntype == "codeBlock":
            # Code blocks may store full Gherkin with real \n separators.
            t = adf_to_text(child)
            for line in t.split("\n"):
                line = line.strip()
                if line:
                    result.append((line, "codeblock"))
        elif ntype == "paragraph":
            for line in _adf_para_to_lines(child):
                result.append((line, "paragraph"))
        else:
            t = adf_to_text(child).strip()
            if t:
                result.append((t, ntype))
    return result


# ── CT parsing ─────────────────────────────────────────────────────────────────

def parse_cts_from_description(description):
    """
    Parse individual test cases (CTs) from an ADF description.

    Expects lines formatted as:
        CT01 – Summary text [Status] [BUGS:KEY-1,KEY-2]

    Emoji in the CT line sets criticality: 🔴 = critical, 🟡/🟠 = medium, else low.
    Headings become category labels for subsequent CTs.

    Returns a list of CT dicts.
    """
    if not description:
        return []

    lines = adf_to_lines(description)
    cts = []
    current_category = None
    current_ct = None

    def flush_ct():
        if current_ct is not None:
            cts.append(current_ct)

    for text, ntype in lines:
        ct_match = re.search(r'\bCT(\d+)\b\s*[-–]\s*(.+)', text)
        if ct_match:
            flush_ct()
            num         = ct_match.group(1)
            summary_raw = ct_match.group(2).strip()

            if '🔴' in text:
                criticality = 'critical'
            elif '🟡' in text or '🟠' in text:
                criticality = 'medium'
            else:
                criticality = 'low'

            # Extract optional [BUGS:key1,key2] tag.
            bugs_tag = re.search(r'\[BUGS:([^\]]+)\]', summary_raw)
            if bugs_tag:
                linked_bugs = [k.strip() for k in bugs_tag.group(1).split(',') if k.strip()]
                summary_raw = re.sub(r'\s*\[BUGS:[^\]]+\]\s*', ' ', summary_raw).strip()
            else:
                linked_bugs = []

            # Extract optional [Status] tag (must not match [BUGS:...]).
            status_tag = re.search(r'\[(?!BUGS:)([^\]]+)\]', summary_raw)
            if status_tag:
                ct_status = CT_STATUS_MAP.get(status_tag.group(1).lower().strip(), 'nao_iniciado')
                summary   = re.sub(r'\s*\[(?!BUGS:)[^\]]+\]\s*', ' ', summary_raw).strip()
            else:
                ct_status = 'nao_iniciado'
                summary   = summary_raw

            current_ct = {
                'id':          f'CT{int(num):02d}',
                'summary':     summary,
                'category':    current_category,
                'criticality': criticality,
                'ct_status':   ct_status,
                'linked_bugs': linked_bugs,
                'gherkin':     [],
            }

        elif ntype == "heading":
            flush_ct()
            current_ct = None
            clean = re.sub(r'^[\s✅❌⚠️🔥💡📊🔴🟡🟢🟠]+', '', text).strip()
            if clean:
                current_category = clean

        else:
            if current_ct is not None:
                stripped = text.strip()
                if stripped:
                    current_ct['gherkin'].append(stripped)

    flush_ct()
    return cts


# ── CT tag mutation ────────────────────────────────────────────────────────────

def _walk_adf_texts(node, callback):
    """Recursively walk all ADF text nodes and invoke callback(node, parent_list, index)."""
    if not node:
        return
    content = node.get("content", [])
    for i, child in enumerate(content):
        if child.get("type") == "text":
            callback(child, content, i)
        else:
            _walk_adf_texts(child, callback)


def adf_update_ct_tag(adf, ct_id_str, tag_type, value):
    """
    Return a deep copy of *adf* with the tag for *ct_id_str* updated.

    tag_type='status' → replace or insert the [Status] bracket tag.
    tag_type='bugs'   → replace or insert the [BUGS:key1,key2] tag.
    """
    adf_copy    = copy.deepcopy(adf)
    ct_pattern  = re.compile(r'\b' + re.escape(ct_id_str) + r'\b')

    def update_node(node, _content_list, _idx):
        text = node.get("text", "")
        if not ct_pattern.search(text):
            return
        if tag_type == "status":
            text  = re.sub(r'\s*\[(?!BUGS:)[^\]]+\]', '', text)
            label = CT_STATUS_KEY_TO_LABEL.get(value, value)
            text  = re.sub(
                r'(\b' + re.escape(ct_id_str) + r'\b\s*[-–]\s*)',
                r'\1[' + label + '] ',
                text,
            )
        elif tag_type == "bugs":
            text = re.sub(r'\s*\[BUGS:[^\]]*\]', '', text)
            if value:
                text = text.rstrip() + ' [BUGS:' + ','.join(value) + ']'
        node["text"] = text

    _walk_adf_texts(adf_copy, update_node)
    return adf_copy


# ── Relationship extraction ────────────────────────────────────────────────────

def parse_relationships(issue_fields):
    """Extract linked issues and the parent issue as a flat list of relationship dicts."""
    rels = []
    for link in issue_fields.get("issuelinks", []):
        other = link.get("outwardIssue") or link.get("inwardIssue")
        if not other:
            continue
        other_f = other.get("fields", {})
        rels.append({
            "key":       other["key"],
            "summary":   other_f.get("summary", ""),
            "type":      other_f.get("issuetype", {}).get("name", ""),
            "link_type": link.get("type", {}).get("outward") or link.get("type", {}).get("name", ""),
        })
    parent = issue_fields.get("parent")
    if parent:
        parent_f = parent.get("fields", {})
        rels.append({
            "key":       parent["key"],
            "summary":   parent_f.get("summary", ""),
            "type":      parent_f.get("issuetype", {}).get("name", ""),
            "link_type": "subtarefa de",
        })
    return rels


# ── Execution progress ─────────────────────────────────────────────────────────

def parse_execution_progress(description):
    """
    Extract cumulative test progress from an execution subtask description.

    Looks for lines like: 'Validados até o ciclo atual: X/Y'
    Returns (done, total) from the last (most recent) match found.
    """
    if not description:
        return 0, 0
    text    = adf_to_text(description)
    matches = re.findall(r'[Vv]alidados até o c\w+ atual[:\s]*(\d+)/(\d+)', text)
    if not matches:
        return 0, 0
    done, total = int(matches[-1][0]), int(matches[-1][1])
    return done, total
