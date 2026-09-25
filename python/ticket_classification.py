#!/usr/bin/env python3
"""
python/ticket_classification.py
Zero-Shot / NLI classification module for Goodeva Desk support tickets.

Inference-only module: does NOT modify or update any database records.
Classifies tickets into Prisma TicketCategory: GENERAL, BILLING, TECHNICAL.
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ticket_classification")
console = Console()

SUPPORTED_CATEGORIES = ["GENERAL", "BILLING", "TECHNICAL"]

# Descriptive candidate labels for Zero-Shot NLI models
CATEGORY_DESCRIPTIONS: Dict[str, str] = {
  "BILLING": "billing, payment, deposit, invoice, subscription, pricing, refund, transaction",
  "TECHNICAL": "technical issue, bug, error, api problem, outage, crash, system failure",
  "GENERAL": "general inquiry, feature request, question, feedback, account assistance, greeting",
}

KEYWORD_RULES: Dict[str, List[str]] = {
  "BILLING": [
    "deposit", "billing", "tagihan", "invoice", "bayar", "payment", "refund",
    "saldo", "rekening", "transfer", "biaya", "harga", "langganan", "subscription",
    "topup", "top up", "charge", "pembayaran",
  ],
  "TECHNICAL": [
    "error", "bug", "gagal", "500", "crash", "timeout", "api", "database",
    "down", "exception", "server", "endpoint", "stack trace", "glitch",
    "tidak bisa login", "login gagal", "connection", "http",
  ],
  "GENERAL": [
    "halo", "tanya", "informasi", "info", "cara", "help", "panduan",
    "jadwal", "konsultasi", "demo", "fitur", "partnership", "rekomendasi",
  ],
}


@dataclass
class ClassificationResult:
  category: str
  confidence: float
  scores: Dict[str, float]
  latency_ms: float
  method: str

  def to_dict(self) -> Dict[str, Any]:
    return asdict(self)


class TicketClassifier:
  """
  Zero-Shot Natural Language Inference (NLI) classifier for support tickets.
  Read-only & inference-only: will never update the database.
  """

  def __init__(
    self,
    model_name: str = "typeform/distilbert-base-uncased-mnli",
    use_fallback_keywords: bool = True,
  ):
    self.model_name = model_name
    self.use_fallback_keywords = use_fallback_keywords
    self._pipeline = None

  def _get_pipeline(self):
    if self._pipeline is None:
      try:
        from transformers import pipeline

        logger.info("Loading Zero-Shot NLI pipeline (%s)...", self.model_name)
        self._pipeline = pipeline(
          "zero-shot-classification",
          model=self.model_name,
        )
        logger.info("Zero-Shot NLI model loaded successfully.")
      except Exception as e:
        logger.warning(
          "Could not load NLI pipeline (%s): %s. Will fallback to keyword/rule baseline.",
          self.model_name,
          e,
        )
        self._pipeline = False
    return self._pipeline if self._pipeline is not False else None

  def classify_keywords(self, text: str) -> ClassificationResult:
    """Fast keyword/heuristic baseline classifier."""
    start_time = time.perf_counter()
    lower_text = text.lower()

    scores = {"BILLING": 0.0, "TECHNICAL": 0.0, "GENERAL": 0.0}

    for cat, keywords in KEYWORD_RULES.items():
      for kw in keywords:
        if kw in lower_text:
          scores[cat] += 1.0

    total = sum(scores.values())
    if total > 0:
      normalized_scores = {k: round(v / total, 3) for k, v in scores.items()}
      best_cat = max(normalized_scores, key=normalized_scores.get)
      confidence = normalized_scores[best_cat]
    else:
      normalized_scores = {"GENERAL": 0.34, "BILLING": 0.33, "TECHNICAL": 0.33}
      best_cat = "GENERAL"
      confidence = 0.34

    latency = (time.perf_counter() - start_time) * 1000.0

    return ClassificationResult(
      category=best_cat,
      confidence=round(confidence, 3),
      scores=normalized_scores,
      latency_ms=round(latency, 2),
      method="Keyword Baseline",
    )

  def classify(
    self,
    subject: str,
    message: str,
    force_keywords: bool = False,
  ) -> ClassificationResult:
    """
    Classifies ticket into GENERAL, BILLING, or TECHNICAL.
    Strictly inference-only without mutating database state.
    """
    full_text = f"Subject: {subject}\nMessage: {message}".strip()
    start_time = time.perf_counter()

    if force_keywords:
      return self.classify_keywords(full_text)

    pipe = self._get_pipeline()
    if pipe is None:
      # Fallback when offline or model is downloading/unavailable
      return self.classify_keywords(full_text)

    try:
      # Map descriptive candidate labels to category keys
      candidate_labels = list(CATEGORY_DESCRIPTIONS.values())
      res = pipe(
        full_text,
        candidate_labels,
        hypothesis_template="This customer support ticket is about {}.",
        multi_label=False,
      )

      # Map descriptive labels back to enum keys
      label_to_cat = {v: k for k, v in CATEGORY_DESCRIPTIONS.items()}
      scores = {}
      for label, score in zip(res["labels"], res["scores"]):
        cat_key = label_to_cat.get(label, "GENERAL")
        scores[cat_key] = round(float(score), 4)

      # Check keyword evidence for multilingual domain grounding
      kw_res = self.classify_keywords(full_text)
      has_domain_keywords = (kw_res.scores.get("BILLING", 0) > 0.4 or kw_res.scores.get("TECHNICAL", 0) > 0.4)

      if has_domain_keywords:
        # Fuse domain keyword priors with deep NLI representations
        fused_scores = {}
        for k in SUPPORTED_CATEGORIES:
          fused_scores[k] = round(0.65 * kw_res.scores.get(k, 0.0) + 0.35 * scores.get(k, 0.0), 4)
        # Re-normalize
        total_fused = sum(fused_scores.values()) or 1.0
        fused_scores = {k: round(v / total_fused, 4) for k, v in fused_scores.items()}
        best_cat = max(fused_scores, key=fused_scores.get)
        confidence = fused_scores[best_cat]
        method = f"Hybrid NLI + Domain Prior ({self.model_name.split('/')[-1]})"
        scores = fused_scores
      else:
        best_cat = max(scores, key=scores.get)
        confidence = scores[best_cat]
        method = f"NLI Zero-Shot ({self.model_name.split('/')[-1]})"

      latency = (time.perf_counter() - start_time) * 1000.0

      return ClassificationResult(
        category=best_cat,
        confidence=round(confidence, 3),
        scores=scores,
        latency_ms=round(latency, 2),
        method=method,
      )
    except Exception as e:
      logger.warning("NLI classification failed: %s. Falling back to rule baseline.", e)
      return self.classify_keywords(full_text)


def demo_classification():
  """Demonstrate NLI ticket classification on realistic customer cases."""
  samples = [
    {
      "subject": "Deposit belum masuk ke saldo",
      "message": "Halo, saya sudah transfer deposit Rp 500.000 via BCA kemarin malam tapi saldo akun belum bertambah. Mohon dicek.",
      "expected": "BILLING",
    },
    {
      "subject": "500 Internal Server Error saat query API",
      "message": "Endpoint /api/v1/tickets sering mengembalikan HTTP 500 crash dan timeout saat load request tinggi. Mohon bantuannya.",
      "expected": "TECHNICAL",
    },
    {
      "subject": "Pertanyaan mengenai jam operasional dan fitur",
      "message": "Selamat pagi Goodeva, apakah kami bisa konsultasi mengenai onboarding fitur customer desk untuk tim sales kami?",
      "expected": "GENERAL",
    },
    {
      "subject": "Refund permintaan pembatalan paket",
      "message": "Saya ingin mengajukan refund untuk invoice INV-2024-001 karena salah memilih plan berlangganan.",
      "expected": "BILLING",
    },
  ]

  classifier = TicketClassifier()

  console.print("\n[bold cyan]=== Bagian D: Python NLI Ticket Classification Demo ===[/bold cyan]\n")
  console.print("[dim]Note: This script is inference-only and does NOT update database records.[/dim]\n")

  table = Table(title="Classification Test Suite", show_header=True, header_style="bold magenta")
  table.add_column("Subject", style="white", width=30)
  table.add_column("Expected", style="yellow", width=12)
  table.add_column("Predicted", style="green", width=12)
  table.add_column("Confidence", style="cyan", width=12)
  table.add_column("Latency (ms)", style="dim", width=12)
  table.add_column("Method", style="dim", width=22)

  for item in samples:
    res = classifier.classify(item["subject"], item["message"])
    table.add_row(
      item["subject"],
      item["expected"],
      res.category,
      f"{res.confidence * 100:.1f}%",
      f"{res.latency_ms:.1f} ms",
      res.method,
    )

  console.print(table)


def classify_from_db(
  db_url: Optional[str] = None,
  limit: Optional[int] = None,
  force_keywords: bool = False,
):
  """Fetch tickets directly from PostgreSQL and classify them (inference-only)."""
  import os
  import psycopg2
  from dotenv import load_dotenv

  load_dotenv()
  database_url = db_url or os.getenv("DATABASE_URL")
  if not database_url:
    console.print("[bold red]Error:[/bold red] DATABASE_URL not found in .env")
    return

  try:
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()
    query = 'SELECT id, subject, message, category FROM "Ticket" ORDER BY created_at DESC'
    if limit:
      query += f" LIMIT {int(limit)}"
    cur.execute(query)
    rows = cur.fetchall()
    cur.close()
    conn.close()
  except Exception as e:
    console.print(f"[bold red]Database Error:[/bold red] {e}")
    return

  console.print(f"\n[bold cyan]=== NLI Classification on {len(rows)} Database Tickets ===[/bold cyan]\n")
  console.print("[dim]Note: Read-only execution, does NOT modify database records.[/dim]\n")

  classifier = TicketClassifier()
  table = Table(title="Database Tickets Classification", show_header=True, header_style="bold magenta")
  table.add_column("Ticket ID", style="dim", width=12)
  table.add_column("Subject", style="white", width=26)
  table.add_column("DB Category", style="yellow", width=14)
  table.add_column("Predicted", style="green", width=14)
  table.add_column("Confidence", style="cyan", width=12)
  table.add_column("Latency", style="dim", width=12)

  for row in rows:
    t_id, subj, msg, db_cat = row[0], row[1] or "", row[2] or "", row[3]
    res = classifier.classify(subj, msg, force_keywords=force_keywords)
    short_id = t_id[-8:] if len(t_id) > 8 else t_id
    short_subj = (subj[:23] + "...") if len(subj) > 23 else subj

    table.add_row(
      short_id,
      short_subj,
      str(db_cat or "[dim]None[/dim]"),
      res.category,
      f"{res.confidence * 100:.1f}%",
      f"{res.latency_ms:.1f} ms",
    )

  console.print(table)


if __name__ == "__main__":
  parser = argparse.ArgumentParser(description="Zero-shot NLI Support Ticket Classifier (Inference-Only)")
  parser.add_argument("--subject", type=str, help="Ticket subject")
  parser.add_argument("--message", type=str, help="Ticket message body")
  parser.add_argument("--from-db", action="store_true", help="Classify tickets directly from database")
  parser.add_argument("--limit", type=int, default=None, help="Limit number of tickets from database")
  parser.add_argument("--keywords-only", action="store_true", help="Force fast keyword/heuristic baseline")
  parser.add_argument("--json", action="store_true", help="Output as JSON")
  args = parser.parse_args()

  if args.from_db:
    classify_from_db(limit=args.limit, force_keywords=args.keywords_only)
  elif args.subject or args.message:
    subj = args.subject or ""
    msg = args.message or ""
    classifier = TicketClassifier()
    res = classifier.classify(subj, msg, force_keywords=args.keywords_only)
    if args.json:
      print(json.dumps(res.to_dict(), indent=2))
    else:
      table = Table(title="Classification Result", show_header=True)
      table.add_column("Field", style="cyan")
      table.add_column("Value", style="green")
      table.add_row("Category", res.category)
      table.add_row("Confidence", f"{res.confidence * 100:.1f}%")
      table.add_row("Scores", str(res.scores))
      table.add_row("Latency", f"{res.latency_ms:.2f} ms")
      table.add_row("Method", res.method)
      console.print(table)
  else:
    demo_classification()

