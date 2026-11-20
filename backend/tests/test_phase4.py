"""Phase 4: the customer's link with Accept, and emailing the proposal."""

from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from tests.conftest import make_invoice, make_shipment

PARTNER = {
    "partner_name": "Rahul Mehta",
    "partner_company": "Sharjah Logistics Partners",
    "partner_email": "rahul@example.com",
    "prospect_name": "Test Co",
    "validity_days": 30,
}


def saving_invoice() -> dict[str, Any]:
    return make_invoice([make_shipment(id="a", charge=120)]).model_dump(mode="json")


def create(client: TestClient, **partner: Any) -> str:
    response = client.post(
        "/api/v1/proposals", json={"invoice": saving_invoice(), "partner": {**PARTNER, **partner}}
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


def share(client: TestClient, proposal_id: str) -> str:
    response = client.post(f"/api/v1/proposals/{proposal_id}/share")
    assert response.status_code == 200
    body = response.json()
    assert body["path"] == f"/p/{body['token']}"
    return str(body["token"])


def kinds(client: TestClient, proposal_id: str) -> list[str]:
    return [e["kind"] for e in client.get(f"/api/v1/proposals/{proposal_id}").json()["events"]]


# --- Customer link -------------------------------------------------------------------------------


def test_the_customer_sees_the_proposal_without_shipment_details(client: TestClient) -> None:
    proposal_id = create(client)
    token = share(client, proposal_id)
    assert share(client, proposal_id) == token  # the same link every time

    view = client.get(f"/api/v1/public/proposals/{token}")
    assert view.status_code == 200
    body = view.json()
    assert body["prospect_name"] == "Test Co"
    assert body["monthly_saving"] == 25
    assert body["status"] == "open"
    assert body["partner"]["company"] == "Sharjah Logistics Partners"
    assert body["regions"][0]["label"] == "GCC"
    assert "shipments" not in body and "invoice" not in body

    detail = client.get(f"/api/v1/proposals/{proposal_id}").json()
    assert detail["share_path"] == f"/p/{token}"
    assert detail["viewed_at"] is not None and detail["view_count"] == 1
    client.get(f"/api/v1/public/proposals/{token}")
    assert client.get(f"/api/v1/proposals/{proposal_id}").json()["view_count"] == 2
    # Only the first opening is a history line.
    assert kinds(client, proposal_id).count("customer_opened") == 1

    pdf = client.get(f"/api/v1/public/proposals/{token}/pdf")
    assert pdf.content.startswith(b"%PDF")


def test_arabic_proposals_are_shown_in_arabic(client: TestClient) -> None:
    token = share(client, create(client, language="ar"))
    body = client.get(f"/api/v1/public/proposals/{token}").json()
    assert body["language"] == "ar"
    assert body["regions"][0]["label"] != "GCC"
    assert any("؀" <= ch <= "ۿ" for ch in body["conditions"][0])


def test_accepting_marks_the_proposal_won_once(client: TestClient) -> None:
    proposal_id = create(client)
    token = share(client, proposal_id)
    accepted = client.post(
        f"/api/v1/public/proposals/{token}/accept",
        json={"name": "  Fatima Al Zahra ", "note": "Start in December"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"
    assert accepted.json()["accepted_by"] == "Fatima Al Zahra"

    detail = client.get(f"/api/v1/proposals/{proposal_id}").json()
    assert detail["status"] == "won" and detail["decided_at"] is not None
    event = detail["events"][0]
    assert event["kind"] == "accepted_online"
    assert event["detail"] == {"name": "Fatima Al Zahra", "note": "Start in December"}

    again = client.post(f"/api/v1/public/proposals/{token}/accept", json={"name": "Someone"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_accepted"
    assert (
        client.get(f"/api/v1/public/proposals/{token}").json()["accepted_by"] == "Fatima Al Zahra"
    )
    assert (
        client.post(f"/api/v1/public/proposals/{token}/accept", json={"name": " "}).status_code
        == 422
    )


def test_lost_and_expired_proposals_cannot_be_accepted(
    client: TestClient, monkeypatch: Any
) -> None:
    lost_id = create(client)
    lost_token = share(client, lost_id)
    client.patch(f"/api/v1/proposals/{lost_id}", json={"status": "lost"})
    assert client.get(f"/api/v1/public/proposals/{lost_token}").json()["status"] == "closed"
    refused = client.post(f"/api/v1/public/proposals/{lost_token}/accept", json={"name": "A"})
    assert refused.json()["error"]["code"] == "proposal_closed"

    expired_token = share(client, create(client, validity_days=7))
    from app.services import sharing

    later = datetime.now(UTC).date() + timedelta(days=8)
    monkeypatch.setattr(sharing, "today", lambda: later)
    assert client.get(f"/api/v1/public/proposals/{expired_token}").json()["status"] == "expired"
    response = client.post(f"/api/v1/public/proposals/{expired_token}/accept", json={"name": "A"})
    assert response.status_code == 410 and response.json()["error"]["code"] == "proposal_expired"


def test_a_turned_off_or_made_up_link_shows_nothing(client: TestClient) -> None:
    proposal_id = create(client)
    token = share(client, proposal_id)
    assert client.delete(f"/api/v1/proposals/{proposal_id}/share").status_code == 204
    gone = client.get(f"/api/v1/public/proposals/{token}")
    assert gone.status_code == 404 and gone.json()["error"]["code"] == "link_not_found"
    assert client.get("/api/v1/public/proposals/" + "x" * 43).status_code == 404
    assert client.get("/api/v1/public/proposals/short").status_code == 422
    assert client.get(f"/api/v1/proposals/{proposal_id}").json()["share_path"] is None
    assert kinds(client, proposal_id)[:2] == ["link_turned_off", "link_created"]
    assert share(client, proposal_id) != token  # a new link, the old one stays dead


# --- Email ---------------------------------------------------------------------------------------


@pytest.fixture
def outbox(monkeypatch: Any) -> list[EmailMessage]:
    """Email switched on, with messages caught instead of sent."""
    from app.services import email as mail

    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("EMAIL_FROM", "proposals@bcom.test")
    monkeypatch.setenv("PUBLIC_APP_URL", "https://app.bcom.test")
    get_settings.cache_clear()
    sent: list[EmailMessage] = []
    monkeypatch.setattr(mail, "deliver", sent.append)
    return sent


def email_body(**overrides: Any) -> dict[str, Any]:
    body = {"to": "ops@testco.ae", "subject": "Your proposal", "message": "Hello,\n\nSee attached."}
    body.update(overrides)
    return body


def test_email_is_off_without_smtp(client: TestClient) -> None:
    proposal_id = create(client)
    assert client.get("/api/v1/config").json()["email_enabled"] is False
    assert (
        client.get(f"/api/v1/proposals/{proposal_id}/email-draft").json()["email_enabled"] is False
    )
    response = client.post(f"/api/v1/proposals/{proposal_id}/email", json=email_body())
    assert response.status_code == 503 and response.json()["error"]["code"] == "email_off"


def test_draft_is_written_in_the_customers_language(
    client: TestClient, outbox: list[EmailMessage]
) -> None:
    english = client.get(f"/api/v1/proposals/{create(client)}/email-draft").json()
    assert english["email_enabled"] is True
    assert english["subject"] == "Your shipping savings proposal from BCOM Global – Test Co"
    assert "AED 25 a month" in english["message"] and "Rahul Mehta" in english["message"]
    arabic = client.get(f"/api/v1/proposals/{create(client, language='ar')}/email-draft").json()
    assert "عرض" in arabic["subject"]


def test_emailing_sends_pdf_and_link_and_marks_sent(
    client: TestClient, outbox: list[EmailMessage]
) -> None:
    proposal_id = create(client)
    response = client.post(
        f"/api/v1/proposals/{proposal_id}/email", json=email_body(cc=["boss@testco.ae"])
    )
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail["status"] == "sent" and detail["follow_up_on"] is not None
    assert detail["share_path"] is not None

    message = outbox[0]
    assert message["To"] == "ops@testco.ae" and message["Cc"] == "boss@testco.ae"
    assert message["Reply-To"] == "rahul@example.com"
    assert "proposals@bcom.test" in message["From"]
    text = message.get_body(("plain",)).get_content()  # type: ignore[union-attr]
    assert f"https://app.bcom.test{detail['share_path']}" in text
    html = message.get_body(("html",)).get_content()  # type: ignore[union-attr]
    assert '<a href="https://app.bcom.test/p/' in html
    attachments = list(message.iter_attachments())
    assert attachments[0].get_filename() == f"{detail['reference']}.pdf"
    assert attachments[0].get_content().startswith(b"%PDF")
    assert [e["kind"] for e in detail["events"]][:3] == [
        "status_changed",
        "emailed",
        "link_created",
    ]


def test_email_without_pdf_or_link_and_bad_addresses(
    client: TestClient, outbox: list[EmailMessage]
) -> None:
    proposal_id = create(client)
    response = client.post(
        f"/api/v1/proposals/{proposal_id}/email",
        json=email_body(attach_pdf=False, include_link=False),
    )
    assert response.status_code == 200
    assert list(outbox[0].iter_attachments()) == []
    assert "/p/" not in outbox[0].get_body(("plain",)).get_content()  # type: ignore[union-attr]
    assert response.json()["share_path"] is None
    for bad in ("not-an-email", "a@b", "a@b.com, c@d.com"):
        assert (
            client.post(
                f"/api/v1/proposals/{proposal_id}/email", json=email_body(to=bad)
            ).status_code
            == 422
        )


def test_a_failing_mail_server_gives_a_plain_message(client: TestClient, monkeypatch: Any) -> None:
    import smtplib

    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    get_settings.cache_clear()

    class Broken:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            raise smtplib.SMTPConnectError(421, b"secret server detail")

    monkeypatch.setattr(smtplib, "SMTP", Broken)
    proposal_id = create(client)
    response = client.post(f"/api/v1/proposals/{proposal_id}/email", json=email_body())
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "email_failed"
    assert "secret" not in response.text
    # Nothing was sent, so the proposal is still a draft.
    assert client.get(f"/api/v1/proposals/{proposal_id}").json()["status"] == "draft"
