#!/usr/bin/env python3
"""
python/entity_extraction.py
Entity extraction module for Goodeva Desk support tickets.

Extracts structured contact info (emails, phone numbers) and open-domain
named entities (person, organization, location) using regex and GLiNER / Hugging Face.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("entity_extraction")
console = Console()

# Regex patterns
EMAIL_PATTERN = re.compile(
  r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

# Supports Indonesian phone numbers (+62 / 62 / 08...) and international formats
# with optional spaces, dashes, or parentheses.
PHONE_PATTERN = re.compile(
  r"(?:(?:\+|00)\d{1,3}[\s.-]?)?"  # Optional country code
  r"(?:\(?\d{2,4}\)?[\s.-]?)?"     # Optional area code
  r"\d{3,4}[\s.-]?\d{3,5}"         # Main subscriber digits
)


@dataclass
class EntityExtractionResult:
  emails: List[str] = field(default_factory=list)
  phone_numbers: List[str] = field(default_factory=list)
  persons: List[str] = field(default_factory=list)
  organizations: List[str] = field(default_factory=list)
  locations: List[str] = field(default_factory=list)
  raw_entities: List[Dict[str, Any]] = field(default_factory=list)

  def to_dict(self) -> Dict[str, Any]:
    return asdict(self)


class EntityExtractor:
  def __init__(
    self,
    gliner_model_name: str = "urchade/gliner_small-v2.1",
    enable_ner: bool = True,
  ):
    self.gliner_model_name = gliner_model_name
    self.enable_ner = enable_ner
    self._gliner_model = None
    self._ner_pipeline = None

  def _get_gliner_model(self):
    if self._gliner_model is None:
      try:
        from gliner import GLiNER

        logger.info("Loading GLiNER model: %s", self.gliner_model_name)
        self._gliner_model = GLiNER.from_pretrained(self.gliner_model_name)
        logger.info("GLiNER model loaded successfully.")
      except Exception as e:
        logger.warning(
          "Failed to load GLiNER model (%s): %s. Will fallback to Hugging Face NER pipeline.",
          self.gliner_model_name,
          e,
        )
        self._gliner_model = False
    return self._gliner_model if self._gliner_model is not False else None

  def _get_hf_ner_pipeline(self):
    if self._ner_pipeline is None:
      try:
        from transformers import pipeline

        logger.info("Loading fallback Hugging Face NER pipeline...")
        self._ner_pipeline = pipeline(
          "ner",
          model="dslim/bert-base-NER",
          aggregation_strategy="simple",
        )
        logger.info("Hugging Face NER pipeline loaded successfully.")
      except Exception as e:
        logger.warning("Could not load Hugging Face NER pipeline: %s", e)
        self._ner_pipeline = False
    return self._ner_pipeline if self._ner_pipeline is not False else None

  @staticmethod
  def extract_emails(text: str) -> List[str]:
    """Extract valid email addresses from text."""
    matches = EMAIL_PATTERN.findall(text)
    cleaned = []
    for m in matches:
      email = m.strip().rstrip(".,;:)")
      if email and email not in cleaned:
        cleaned.append(email)
    return cleaned

  @staticmethod
  def extract_phone_numbers(text: str) -> List[str]:
    """Extract phone numbers with length validation to prevent false positives."""
    candidates = PHONE_PATTERN.findall(text)
    results = []
    for cand in candidates:
      cand_clean = cand.strip().strip(",.;:()[]{}")
      # Count actual digits
      digits = re.sub(r"\D", "", cand_clean)
      # Support tickets: valid phone numbers usually have 8 to 15 digits
      if 8 <= len(digits) <= 15:
        # Discard pure timestamps or repeated dates
        if cand_clean not in results:
          results.append(cand_clean)
    return results

  def extract_ner(
    self,
    text: str,
    labels: Optional[List[str]] = None,
    threshold: float = 0.4,
  ) -> List[Dict[str, Any]]:
    """Extract open-domain named entities via GLiNER or HF NER."""
    if not self.enable_ner:
      return []

    labels = labels or ["person", "organization", "location"]
    gliner = self._get_gliner_model()
    if gliner is not None:
      try:
        predictions = gliner.predict_entities(text, labels, threshold=threshold)
        return [
          {
            "text": p["text"].strip(),
            "label": p["label"].lower(),
            "score": round(float(p["score"]), 3),
          }
          for p in predictions
          if p["text"].strip()
        ]
      except Exception as e:
        logger.warning("GLiNER inference error: %s", e)

    # Fallback to Hugging Face standard NER pipeline
    hf_ner = self._get_hf_ner_pipeline()
    if hf_ner is not None:
      try:
        preds = hf_ner(text)
        label_map = {
          "PER": "person",
          "ORG": "organization",
          "LOC": "location",
          "MISC": "other",
        }
        return [
          {
            "text": p["word"].strip(),
            "label": label_map.get(p["entity_group"], p["entity_group"].lower()),
            "score": round(float(p["score"]), 3),
          }
          for p in preds
          if p["word"].strip()
        ]
      except Exception as e:
        logger.warning("HF NER inference error: %s", e)

    return []

  def extract(self, text: str) -> EntityExtractionResult:
    """Run full extraction combining regex contacts and open-domain NER."""
    emails = self.extract_emails(text)
    phone_numbers = self.extract_phone_numbers(text)

    result = EntityExtractionResult(
      emails=emails,
      phone_numbers=phone_numbers,
    )

    if self.enable_ner:
      ner_entities = self.extract_ner(text)
      result.raw_entities = ner_entities

      for ent in ner_entities:
        val = ent["text"]
        lbl = ent["label"]
        if lbl == "person" and val not in result.persons:
          result.persons.append(val)
        elif lbl == "organization" and val not in result.organizations:
          result.organizations.append(val)
        elif lbl == "location" and val not in result.locations:
          result.locations.append(val)

    return result


def demo_sample_tickets():
  """Run extraction on diverse realistic support tickets."""
  samples = [
    {
      "title": "Indonesian Billing Ticket with Contact",
      "text": (
        "Halo tim Goodeva Desk, saya Budi Santoso dari PT Maju Mundur. "
        "Deposit saya sebesar Rp 5.000.000 belum masuk ke saldo akun sejak kemarin. "
        "Mohon follow up segera ke email budi.santoso@majumundur.co.id "
        "atau hubungi WhatsApp saya di +62 812-3456-7890. Kantor kami di Jakarta Selatan."
      ),
    },
    {
      "title": "English Technical Support Ticket",
      "text": (
        "Hi Support, I am Sarah Connor from Cyberdyne Systems in San Francisco. "
        "We are experiencing 500 Internal Server Error when querying the /api/v1/tickets endpoint. "
        "Please reach out to me at sconnor@cyberdyne.org or call +1 (415) 555-0199."
      ),
    },
    {
      "title": "Short Indonesian General Inquiry",
      "text": (
        "Selamat siang, apakah Goodeva melayani integrasi dengan WhatsApp Business API? "
        "Bisa hubungi kami di kontak sales@tokobaru.id / 081809112233."
      ),
    },
  ]

  extractor = EntityExtractor(enable_ner=True)

  console.print("\n[bold cyan]=== Bagian D: Python Entity Extraction Demo ===[/bold cyan]\n")
  for idx, sample in enumerate(samples, 1):
    console.print(f"[bold yellow]Sample #{idx}: {sample['title']}[/bold yellow]")
    console.print(f"[italic]{sample['text']}[/italic]\n")

    res = extractor.extract(sample["text"])

    table = Table(title="Extracted Entities", show_header=True, header_style="bold magenta")
    table.add_column("Category", style="cyan", width=18)
    table.add_column("Extracted Values", style="white")

    table.add_row("Emails", ", ".join(res.emails) if res.emails else "[dim]None[/dim]")
    table.add_row("Phone Numbers", ", ".join(res.phone_numbers) if res.phone_numbers else "[dim]None[/dim]")
    table.add_row("Persons (NER)", ", ".join(res.persons) if res.persons else "[dim]None[/dim]")
    table.add_row("Organizations (NER)", ", ".join(res.organizations) if res.organizations else "[dim]None[/dim]")
    table.add_row("Locations (NER)", ", ".join(res.locations) if res.locations else "[dim]None[/dim]")

    console.print(table)
    console.print("-" * 60)


def extract_from_db(
  db_url: Optional[str] = None,
  limit: Optional[int] = None,
  enable_ner: bool = True,
):
  """Fetch tickets directly from PostgreSQL and extract entities."""
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
    query = 'SELECT id, subject, message FROM "Ticket" ORDER BY created_at DESC'
    if limit:
      query += f" LIMIT {int(limit)}"
    cur.execute(query)
    rows = cur.fetchall()
    cur.close()
    conn.close()
  except Exception as e:
    console.print(f"[bold red]Database Error:[/bold red] {e}")
    return

  console.print(f"\n[bold cyan]=== Entity Extraction on {len(rows)} Database Tickets ===[/bold cyan]\n")
  extractor = EntityExtractor(enable_ner=enable_ner)

  table = Table(title="Database Tickets Entity Extraction", show_header=True, header_style="bold magenta")
  table.add_column("Ticket ID", style="dim", width=12)
  table.add_column("Subject", style="white", width=26)
  table.add_column("Emails", style="green", width=22)
  table.add_column("Phone Numbers", style="yellow", width=18)
  table.add_column("Persons", style="cyan", width=16)

  for row in rows:
    t_id, subj, msg = row[0], row[1] or "", row[2] or ""
    combined_text = f"{subj}\n{msg}"
    res = extractor.extract(combined_text)
    short_id = t_id[-8:] if len(t_id) > 8 else t_id
    short_subj = (subj[:23] + "...") if len(subj) > 23 else subj

    table.add_row(
      short_id,
      short_subj,
      ", ".join(res.emails) if res.emails else "[dim]None[/dim]",
      ", ".join(res.phone_numbers) if res.phone_numbers else "[dim]None[/dim]",
      ", ".join(res.persons) if res.persons else "[dim]None[/dim]",
    )

  console.print(table)


if __name__ == "__main__":
  parser = argparse.ArgumentParser(description="Extract entities from customer support tickets")
  parser.add_argument("--text", type=str, help="Text to extract entities from")
  parser.add_argument("--from-db", action="store_true", help="Extract entities directly from database tickets")
  parser.add_argument("--limit", type=int, default=None, help="Limit number of tickets from database")
  parser.add_argument("--no-ner", action="store_true", help="Disable NER and run regex contact extraction only")
  parser.add_argument("--json", action="store_true", help="Output results as JSON")
  args = parser.parse_args()

  if args.from_db:
    extract_from_db(limit=args.limit, enable_ner=not args.no_ner)
  elif args.text:
    extractor = EntityExtractor(enable_ner=not args.no_ner)
    result = extractor.extract(args.text)
    if args.json:
      print(json.dumps(result.to_dict(), indent=2))
    else:
      table = Table(title="Entity Extraction Results", show_header=True)
      table.add_column("Field", style="cyan")
      table.add_column("Value", style="green")
      table.add_row("Emails", str(result.emails))
      table.add_row("Phone Numbers", str(result.phone_numbers))
      table.add_row("Persons", str(result.persons))
      table.add_row("Organizations", str(result.organizations))
      table.add_row("Locations", str(result.locations))
      console.print(table)
  else:
    demo_sample_tickets()

