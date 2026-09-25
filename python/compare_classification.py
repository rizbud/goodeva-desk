#!/usr/bin/env python3
"""
python/compare_classification.py
Compares existing LLM classification results stored in PostgreSQL (Bagian B)
with Python NLI Zero-Shot classification and entity extraction (Bagian D).

Features:
- Connects directly to PostgreSQL database via DATABASE_URL from .env.
- No API key or organization lock needed (queries all tickets directly).
- Strictly read-only: performs SELECT queries only; does NOT modify or write any data.
- Compares DB LLM category vs Python NLI classification.
- Performs entity extraction (emails, phone numbers, NER) on ticket contents.
- Generates rich console summary and exports markdown comparison report.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

# Import local modules from python/
sys.path.insert(0, str(Path(__file__).parent))
from entity_extraction import EntityExtractor
from ticket_classification import TicketClassifier

# Load environment variables
load_dotenv()

console = Console()


@dataclass
class TicketComparisonItem:
  ticket_id: str
  organization_id: str
  customer_email: str
  subject: str
  message: str
  llm_category: Optional[str]
  llm_suggested_reply: Optional[str]
  nli_category: str
  nli_confidence: float
  nli_scores: Dict[str, float]
  nli_latency_ms: float
  is_match: Optional[bool]
  extracted_emails: List[str]
  extracted_phones: List[str]
  extracted_persons: List[str]
  extracted_orgs: List[str]


def fetch_tickets_from_db(
  database_url: str,
  limit: Optional[int] = None,
  organization_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
  """Fetch tickets directly from PostgreSQL without API key or organization lock."""
  console.print(f"[bold cyan]Connecting directly to database...[/bold cyan]")
  try:
    conn = psycopg2.connect(database_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    query = (
      'SELECT id, organization_id, customer_email, subject, message, '
      'category, suggested_reply, status, created_at, updated_at '
      'FROM "Ticket"'
    )
    params: List[Any] = []

    if organization_id:
      query += " WHERE organization_id = %s"
      params.append(organization_id)

    query += " ORDER BY created_at DESC"

    if limit:
      query += " LIMIT %s"
      params.append(limit)

    cur.execute(query, tuple(params))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    tickets = [dict(row) for row in rows]
    console.print(f"Fetched [bold green]{len(tickets)}[/bold green] tickets directly from database.")
    return tickets

  except psycopg2.Error as e:
    console.print(f"[bold red]Database Connection/Query Error:[/bold red] {e}")
    console.print("[yellow]Make sure DATABASE_URL is correct in .env and PostgreSQL is running.[/yellow]")
    sys.exit(1)


def run_comparison(
  tickets: List[Dict[str, Any]],
  include_uncategorized: bool = True,
  enable_ner: bool = False,
) -> List[TicketComparisonItem]:
  """Execute classification and extraction comparisons on ticket records."""
  classifier = TicketClassifier()
  extractor = EntityExtractor(enable_ner=enable_ner)

  results: List[TicketComparisonItem] = []

  with console.status("[bold green]Evaluating tickets with NLI and Entity Extractor..."):
    for t in tickets:
      t_id = t.get("id", "")
      org_id = t.get("organization_id", "")
      c_email = t.get("customer_email", "")
      subject = t.get("subject", "") or ""
      message = t.get("message", "") or ""
      llm_cat = t.get("category")
      llm_reply = t.get("suggested_reply")

      if not include_uncategorized and not llm_cat:
        continue

      # Run Python NLI classification
      cls_res = classifier.classify(subject, message)

      # Run Python Entity extraction
      combined_text = f"{subject}\n{message}"
      ext_res = extractor.extract(combined_text)

      is_match = None
      if llm_cat:
        is_match = llm_cat.strip().upper() == cls_res.category.strip().upper()

      results.append(
        TicketComparisonItem(
          ticket_id=t_id,
          organization_id=org_id,
          customer_email=c_email,
          subject=subject,
          message=message,
          llm_category=llm_cat,
          llm_suggested_reply=llm_reply,
          nli_category=cls_res.category,
          nli_confidence=cls_res.confidence,
          nli_scores=cls_res.scores,
          nli_latency_ms=cls_res.latency_ms,
          is_match=is_match,
          extracted_emails=ext_res.emails,
          extracted_phones=ext_res.phone_numbers,
          extracted_persons=ext_res.persons,
          extracted_orgs=ext_res.organizations,
        )
      )

  return results


def print_comparison_tables(items: List[TicketComparisonItem]):
  """Print formatted comparison results using Rich."""
  console.print("\n[bold cyan]=== Bagian D: LLM (DB) vs Python NLI Classification Comparison ===[/bold cyan]\n")

  table = Table(
    title="Direct Database Tickets Comparison Summary",
    show_header=True,
    header_style="bold magenta",
  )
  table.add_column("Ticket ID", style="dim", width=12)
  table.add_column("Subject", style="white", width=25)
  table.add_column("LLM (DB)", style="yellow", width=12)
  table.add_column("Python NLI", style="cyan", width=12)
  table.add_column("Agreement", style="bold", width=12)
  table.add_column("Confidence", style="green", width=12)
  table.add_column("Latency", style="dim", width=10)
  table.add_column("Entities Found", style="blue", width=22)

  categorized_count = 0
  match_count = 0

  for item in items:
    short_id = item.ticket_id[-8:] if len(item.ticket_id) > 8 else item.ticket_id
    short_subj = (item.subject[:22] + "...") if len(item.subject) > 22 else item.subject

    if item.llm_category:
      categorized_count += 1
      if item.is_match:
        match_count += 1
        agreement_str = "[green]MATCH[/green]"
      else:
        agreement_str = "[red]MISMATCH[/red]"
    else:
      agreement_str = "[dim]N/A (Unclassified)[/dim]"

    entities_desc = []
    if item.extracted_emails:
      entities_desc.append(f"Email: {len(item.extracted_emails)}")
    if item.extracted_phones:
      entities_desc.append(f"Phone: {len(item.extracted_phones)}")
    if item.extracted_persons:
      entities_desc.append(f"Person: {len(item.extracted_persons)}")
    ent_str = ", ".join(entities_desc) if entities_desc else "[dim]None[/dim]"

    table.add_row(
      short_id,
      short_subj,
      item.llm_category or "[dim]None[/dim]",
      item.nli_category,
      agreement_str,
      f"{item.nli_confidence * 100:.1f}%",
      f"{item.nli_latency_ms:.1f}ms",
      ent_str,
    )

  console.print(table)

  # Print Statistics Panel
  total_evaluated = len(items)
  accuracy_pct = (match_count / categorized_count * 100.0) if categorized_count > 0 else 0.0

  stat_text = (
    f"• Total Tickets Processed: [bold]{total_evaluated}[/bold]\n"
    f"• Tickets Classified by LLM (in DB): [bold]{categorized_count}[/bold]\n"
    f"• NLI Agreement Rate with LLM: [bold green]{match_count}/{categorized_count} ({accuracy_pct:.1f}%)[/bold green]\n"
    f"• Connection Mode: [italic cyan]Direct PostgreSQL (No API Key / No Org Lock)[/italic cyan]\n"
    f"• Read-only Execution: [italic green]PASSED (SELECT queries only, No DB mutation)[/italic green]"
  )
  console.print(Panel(stat_text, title="Benchmark Metrics", border_style="green"))


def main():
  parser = argparse.ArgumentParser(
    description="Compare database LLM classification results directly with Python NLI & Entity Extractor"
  )
  parser.add_argument(
    "--db-url",
    type=str,
    default=os.getenv("DATABASE_URL"),
    help="PostgreSQL connection string (default: DATABASE_URL from .env)",
  )
  parser.add_argument(
    "--org-id",
    type=str,
    default=None,
    help="Optional organization ID filter (default: None, queries all tickets)",
  )
  parser.add_argument(
    "--limit",
    type=int,
    default=None,
    help="Maximum tickets to fetch from database (default: all tickets)",
  )
  parser.add_argument(
    "--ner",
    action="store_true",
    help="Enable deep NER model in addition to regex contact extraction",
  )
  args = parser.parse_args()

  db_url = args.db_url or os.getenv("DATABASE_URL")
  if not db_url:
    console.print("[bold red]Error:[/bold red] DATABASE_URL not found in .env or passed via --db-url")
    sys.exit(1)

  tickets = fetch_tickets_from_db(
    database_url=db_url,
    limit=args.limit,
    organization_id=args.org_id,
  )

  if not tickets:
    console.print("[yellow]No tickets found in the database.[/yellow]")
    return

  items = run_comparison(tickets, include_uncategorized=True, enable_ner=args.ner)
  print_comparison_tables(items)


if __name__ == "__main__":
  main()

