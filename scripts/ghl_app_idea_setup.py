#!/usr/bin/env python3
"""
One-time GoHighLevel setup helper for the App Idea Checker.

This script verifies/creates contact custom fields and tags, then reports
whether the expected pipeline stages exist. It intentionally does not create
workflows, SMS actions, invoices, GitHub repos, or any paid AI resources.

Required environment variables:
  GHL_ACCESS_TOKEN
  GHL_LOCATION_ID

Optional environment variables:
  GHL_PIPELINE_ID
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any


BASE_URL = "https://services.leadconnectorhq.com"
API_VERSION = "2021-07-28"

CUSTOM_FIELDS = [
    "App Idea Score",
    "App Idea Category",
    "Lead Quality",
    "Idea Type",
    "Audience",
    "Budget Range",
    "Launch Timeline",
    "Recommended Path",
    "Project Slug",
    "Context Pack Status",
    "Repo Creation Status",
]

TAGS = [
    "app_idea_checker",
    "mvp_ready_high",
    "mvp_ready_medium",
    "needs_validation",
    "budget_under_1k",
    "budget_1k_3k",
    "budget_3k_10k",
    "budget_10k_plus",
    "discovery_call_needed",
    "repo_locked_until_paid",
]

PIPELINE_STAGES = [
    "New Idea Checker Lead",
    "Qualified Lead",
    "Discovery Call Booked",
    "Discovery Completed",
    "Proposal Sent",
    "Proposal Accepted",
    "Deposit Paid",
    "Phase 1 Build Started",
    "Phase 1 Delivered",
    "Won - Ongoing Support",
    "Lost / Not Fit",
]


@dataclass
class SetupReport:
    fields_created: list[str] = field(default_factory=list)
    fields_existing: list[str] = field(default_factory=list)
    tags_created: list[str] = field(default_factory=list)
    tags_existing: list[str] = field(default_factory=list)
    pipeline_stages_found: list[str] = field(default_factory=list)
    pipeline_stages_missing: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    test_contact_id: str | None = None
    test_opportunity_id: str | None = None


class GHLClient:
    def __init__(self, access_token: str, location_id: str, dry_run: bool = False):
        self.access_token = access_token
        self.location_id = location_id
        self.dry_run = dry_run

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = BASE_URL + path
        if query:
            url += "?" + urllib.parse.urlencode(query)

        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            method=method.upper(),
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Version": API_VERSION,
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"GHL API {method} {path} failed with {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"GHL API {method} {path} failed: {exc.reason}") from exc

    def get_custom_fields(self) -> list[dict[str, Any]]:
        data = self.request("GET", f"/locations/{self.location_id}/customFields")
        return data.get("customFields") or data.get("fields") or []

    def create_custom_field(self, name: str) -> dict[str, Any]:
        if self.dry_run:
            return {"dry_run": True, "name": name}
        return self.request(
            "POST",
            f"/locations/{self.location_id}/customFields",
            payload={
                "name": name,
                "dataType": "TEXT",
                "placeholder": name,
                "position": 0,
            },
        )

    def get_tags(self) -> list[dict[str, Any]]:
        data = self.request("GET", f"/locations/{self.location_id}/tags")
        return data.get("tags") or []

    def create_tag(self, name: str) -> dict[str, Any]:
        if self.dry_run:
            return {"dry_run": True, "name": name}
        return self.request("POST", f"/locations/{self.location_id}/tags/", payload={"name": name})

    def get_pipelines(self) -> list[dict[str, Any]]:
        data = self.request("GET", "/opportunities/pipelines", query={"locationId": self.location_id})
        return data.get("pipelines") or []

    def create_test_contact(self) -> str:
        payload = {
            "locationId": self.location_id,
            "firstName": "App Idea",
            "lastName": "Checker Test",
            "name": "App Idea Checker Test",
            "email": "app-idea-checker-test@example.com",
            "tags": TAGS,
            "customFields": [
                {"key": "app_idea_score", "field_value": "91"},
                {"key": "app_idea_category", "field_value": "Strong MVP Candidate"},
                {"key": "lead_quality", "field_value": "high"},
                {"key": "repo_creation_status", "field_value": "locked_until_signed_and_paid"},
            ],
        }
        if self.dry_run:
            return "dry_run_contact_id"
        data = self.request("POST", "/contacts/", payload=payload)
        contact = data.get("contact") if isinstance(data.get("contact"), dict) else data
        return str(contact.get("id") or data.get("id") or "")

    def create_test_opportunity(self, pipeline_id: str, stage_id: str, contact_id: str) -> str:
        payload = {
            "pipelineId": pipeline_id,
            "locationId": self.location_id,
            "name": "App Idea Checker Test Opportunity",
            "pipelineStageId": stage_id,
            "contactId": contact_id,
            "status": "open",
            "monetaryValue": 0,
        }
        if self.dry_run:
            return "dry_run_opportunity_id"
        data = self.request("POST", "/opportunities/", payload=payload)
        opportunity = data.get("opportunity") if isinstance(data.get("opportunity"), dict) else data
        return str(opportunity.get("id") or data.get("id") or "")


def normalize_name(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def find_by_name(items: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    target = normalize_name(name)
    for item in items:
        candidates = [
            item.get("name"),
            item.get("fieldKey"),
            item.get("key"),
            item.get("label"),
        ]
        if any(normalize_name(candidate) == target for candidate in candidates):
            return item
    return None


def collect_stage_names(pipelines: list[dict[str, Any]], pipeline_id: str | None) -> tuple[list[str], dict[str, str]]:
    names: list[str] = []
    ids_by_name: dict[str, str] = {}

    for pipeline in pipelines:
        if pipeline_id and str(pipeline.get("id")) != pipeline_id:
            continue
        for stage in pipeline.get("stages") or []:
            name = str(stage.get("name") or "").strip()
            stage_id = str(stage.get("id") or "").strip()
            if name:
                names.append(name)
                if stage_id:
                    ids_by_name[name] = stage_id

    return names, ids_by_name


def run_setup(args: argparse.Namespace) -> SetupReport:
    token = os.getenv("GHL_ACCESS_TOKEN", "").strip()
    location_id = os.getenv("GHL_LOCATION_ID", "").strip()
    pipeline_id = (args.pipeline_id or os.getenv("GHL_PIPELINE_ID", "")).strip()

    if not token:
        raise SystemExit("Missing required env var: GHL_ACCESS_TOKEN")
    if not location_id:
        raise SystemExit("Missing required env var: GHL_LOCATION_ID")

    client = GHLClient(token, location_id, dry_run=args.dry_run)
    report = SetupReport()

    existing_fields = client.get_custom_fields()
    for field_name in CUSTOM_FIELDS:
        if find_by_name(existing_fields, field_name):
            report.fields_existing.append(field_name)
            continue
        client.create_custom_field(field_name)
        report.fields_created.append(field_name)

    existing_tags = client.get_tags()
    for tag_name in TAGS:
        if find_by_name(existing_tags, tag_name):
            report.tags_existing.append(tag_name)
            continue
        client.create_tag(tag_name)
        report.tags_created.append(tag_name)

    pipelines = client.get_pipelines()
    stage_names, stage_ids_by_name = collect_stage_names(pipelines, pipeline_id or None)
    normalized_stage_names = {normalize_name(name) for name in stage_names}

    for expected_stage in PIPELINE_STAGES:
        if normalize_name(expected_stage) in normalized_stage_names:
            report.pipeline_stages_found.append(expected_stage)
        else:
            report.pipeline_stages_missing.append(expected_stage)

    if not pipeline_id:
        report.warnings.append("GHL_PIPELINE_ID was not set; stage checks searched all pipelines.")

    if report.pipeline_stages_missing:
        report.warnings.append("Create missing pipeline stages manually in GHL before enabling production forwarding.")

    if args.create_test_opportunity and not args.create_test_contact:
        report.warnings.append("--create-test-opportunity also creates a test contact because GHL opportunities require contactId.")

    contact_id = None
    if args.create_test_contact or args.create_test_opportunity:
        contact_id = client.create_test_contact()
        report.test_contact_id = contact_id or None
        if not contact_id:
            report.warnings.append("Test contact creation did not return a contact id.")

    if args.create_test_opportunity:
        if not pipeline_id:
            report.warnings.append("Skipped test opportunity: GHL_PIPELINE_ID or --pipeline-id is required.")
        elif not contact_id:
            report.warnings.append("Skipped test opportunity: no contact id was available.")
        else:
            stage_id = stage_ids_by_name.get("New Idea Checker Lead")
            if not stage_id:
                report.warnings.append("Skipped test opportunity: New Idea Checker Lead stage was not found.")
            else:
                opportunity_id = client.create_test_opportunity(pipeline_id, stage_id, contact_id)
                report.test_opportunity_id = opportunity_id or None
                if not opportunity_id:
                    report.warnings.append("Test opportunity creation did not return an opportunity id.")

    return report


def print_report(report: SetupReport, dry_run: bool) -> None:
    print("\nApp Idea Checker GHL setup report")
    print("=" * 39)
    print(f"Mode: {'dry-run' if dry_run else 'live API'}")
    print()

    sections = [
        ("Fields created", report.fields_created),
        ("Fields already existed", report.fields_existing),
        ("Tags created", report.tags_created),
        ("Tags already existed", report.tags_existing),
        ("Pipeline stages found", report.pipeline_stages_found),
        ("Pipeline stages missing", report.pipeline_stages_missing),
    ]

    for title, items in sections:
        print(title + ":")
        if items:
            for item in items:
                print(f"  - {item}")
        else:
            print("  - none")
        print()

    if report.test_contact_id:
        print(f"Test contact id: {report.test_contact_id}")
    if report.test_opportunity_id:
        print(f"Test opportunity id: {report.test_opportunity_id}")
    if report.test_contact_id or report.test_opportunity_id:
        print()

    print("Warnings:")
    if report.warnings:
        for warning in report.warnings:
            print(f"  - {warning}")
    else:
        print("  - none")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify/create App Idea Checker setup in GoHighLevel.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch current setup but do not create fields, tags, contacts, or opportunities.")
    parser.add_argument("--pipeline-id", default="", help="Override GHL_PIPELINE_ID for stage checks and test opportunity creation.")
    parser.add_argument("--create-test-contact", action="store_true", help="Create one test contact. Off by default.")
    parser.add_argument("--create-test-opportunity", action="store_true", help="Create one test opportunity. Off by default.")
    args = parser.parse_args()

    try:
        report = run_setup(args)
    except Exception as exc:
        print(f"Setup failed: {exc}", file=sys.stderr)
        return 1

    print_report(report, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
