"""Phase 4: the customer's link with Accept, shared with the customer."""

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient

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
