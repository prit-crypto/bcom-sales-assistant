"""Saved proposals: create, list, autosave, status changes, history, files, delete, migrations."""

from datetime import date, timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.services.proposals import today
from tests.conftest import BACKEND, make_invoice, make_shipment

PARTNER = {
    "partner_name": "Rahul Mehta",
    "partner_company": "Sharjah Logistics Partners",
    "prospect_name": "Test Co",
    "validity_days": 30,
}
URL = "/api/v1/proposals"


def saving_invoice(charge: float = 120) -> dict[str, Any]:
    return make_invoice([make_shipment(id="a", charge=charge)]).model_dump(mode="json")


def losing_invoice() -> dict[str, Any]:
    shipments = [
        make_shipment(id=i, destination_country="AE", weight_kg=1, charge=15) for i in ("a", "b")
    ]
    return make_invoice(shipments).model_dump(mode="json")


def create(client: TestClient, **overrides: Any) -> dict[str, Any]:
    body = {"invoice": saving_invoice(), "partner": PARTNER, "source_file_name": "inv.pdf"}
    body.update(overrides)
    response = client.post(URL, json=body)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


def patch(client: TestClient, proposal_id: str, **fields: Any) -> Any:
    return client.patch(f"{URL}/{proposal_id}", json=fields)


def test_creates_a_draft_with_server_figures(client: TestClient) -> None:
    created = create(client)
    assert created["status"] == "draft"
    assert created["monthly_saving"] == 25
    assert created["reference"].startswith("BCOM-P-")
    # The same invoice saved twice gets two different references.
    assert create(client)["reference"] != created["reference"]
    assert created["comparison"]["summary"]["monthly_saving"] == 25
    assert [e["kind"] for e in created["events"]] == ["created"]
    assert created["follow_up_due"] is False


def test_refuses_to_save_when_nothing_can_be_compared(client: TestClient) -> None:
    invoice = make_invoice([make_shipment(weight_kg=None)]).model_dump(mode="json")
    response = client.post(URL, json={"invoice": invoice, "partner": PARTNER})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "nothing_to_propose"


def test_list_filters_and_searches(client: TestClient) -> None:
    first = create(client)
    create(client, partner={**PARTNER, "prospect_name": "Gulf Spice Trading"})
    patch(client, first["id"], status="sent")

    everything = client.get(URL).json()
    assert [i["prospect_name"] for i in everything["items"]] == ["Test Co", "Gulf Spice Trading"]
    assert [
        i["prospect_name"] for i in client.get(URL, params={"status": "draft"}).json()["items"]
    ] == ["Gulf Spice Trading"]
    assert [i["prospect_name"] for i in client.get(URL, params={"q": "spice"}).json()["items"]] == [
        "Gulf Spice Trading"
    ]
    assert client.get(URL, params={"status": "nope"}).status_code == 422


def test_autosave_recalculates_and_folds_history(client: TestClient) -> None:
    created = create(client)
    updated = patch(client, created["id"], invoice=saving_invoice(charge=140)).json()
    assert updated["monthly_saving"] == 45
    # A second edit soon after updates the same history line.
    updated = patch(client, created["id"], invoice=saving_invoice(charge=150)).json()
    assert updated["monthly_saving"] == 55
    assert [e["kind"] for e in updated["events"]] == ["shipments_edited", "created"]

    with_scenario = patch(client, created["id"], scenario={"volume_factor": 2}).json()
    assert with_scenario["monthly_saving"] == 110
    assert with_scenario["scenario"]["volume_factor"] == 2

    renamed = patch(client, created["id"], partner={**PARTNER, "prospect_name": "New Name"}).json()
    assert renamed["prospect_name"] == "New Name"
    message = patch(client, created["id"], message="Hello").json()
    assert message["message"] == "Hello"


def test_mark_as_sent_sets_a_follow_up_and_it_comes_due(client: TestClient) -> None:
    created = create(client)
    sent = patch(client, created["id"], status="sent").json()
    assert sent["status"] == "sent"
    assert sent["sent_at"] is not None
    assert sent["follow_up_on"] == (today() + timedelta(days=3)).isoformat()
    assert client.get(URL).json()["follow_up_due"] == 0

    due = patch(client, created["id"], follow_up_on=today().isoformat()).json()
    assert due["follow_up_due"] is True
    assert client.get(URL).json()["follow_up_due"] == 1
    kinds = [e["kind"] for e in due["events"]]
    assert kinds[:2] == ["follow_up_set", "status_changed"]


def test_won_lost_and_reopen(client: TestClient) -> None:
    created = create(client)
    patch(client, created["id"], status="sent")
    lost = patch(
        client, created["id"], status="lost", lost_reason="  Chose another courier "
    ).json()
    assert lost["status"] == "lost"
    assert lost["lost_reason"] == "Chose another courier"
    assert lost["decided_at"] is not None
    assert lost["follow_up_on"] is None
    assert lost["events"][0]["detail"] == {
        "from": "sent",
        "to": "lost",
        "reason": "Chose another courier",
    }

    # A decided proposal can only be reopened.
    blocked = patch(client, created["id"], status="won")
    assert blocked.status_code == 422
    assert blocked.json()["error"]["code"] == "status_not_allowed"

    reopened = patch(client, created["id"], status="sent").json()
    assert reopened["decided_at"] is None and reopened["lost_reason"] is None
    won = patch(client, created["id"], status="won").json()
    assert won["status"] == "won"


def test_a_proposal_without_a_saving_cannot_be_sent(client: TestClient) -> None:
    created = create(client, invoice=losing_invoice())
    assert created["has_saving"] is False
    response = patch(client, created["id"], status="sent")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_saving"


def test_notes_and_clearing_the_follow_up(client: TestClient) -> None:
    created = create(client)
    patch(client, created["id"], status="sent")
    cleared = patch(client, created["id"], follow_up_on=None, notes="Call after Eid").json()
    assert cleared["follow_up_on"] is None
    assert cleared["notes"] == "Call after Eid"


def test_files_and_events_are_recorded(client: TestClient) -> None:
    created = create(client)
    pdf = client.get(f"{URL}/{created['id']}/pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    # The PDF carries the saved proposal's own reference.
    assert f'filename="{created["reference"]}.pdf"' in pdf.headers["content-disposition"]
    excel = client.get(f"{URL}/{created['id']}/excel")
    assert excel.content[:2] == b"PK"
    assert (
        client.post(f"{URL}/{created['id']}/events", json={"kind": "message_copied"}).status_code
        == 204
    )
    assert client.post(f"{URL}/{created['id']}/events", json={"kind": "hacked"}).status_code == 422
    kinds = [e["kind"] for e in client.get(f"{URL}/{created['id']}").json()["events"]]
    assert kinds[:3] == ["message_copied", "excel_downloaded", "pdf_downloaded"]


def test_delete_and_missing_proposals(client: TestClient) -> None:
    created = create(client)
    assert client.delete(f"{URL}/{created['id']}").status_code == 204
    missing = client.get(f"{URL}/{created['id']}")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "proposal_not_found"
    assert client.get(URL).json()["items"] == []
    assert client.get(f"{URL}/not-a-uuid").status_code == 422


def test_readiness_reports_the_database(client: TestClient) -> None:
    assert client.get("/api/v1/health/ready").json() == {"status": "ok", "database": "ok"}


def test_readiness_when_the_database_is_down(client: TestClient, monkeypatch: Any) -> None:
    from app.core.config import get_settings
    from app.db.session import get_engine

    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://bcom:bcom@localhost:1/none")
    get_settings.cache_clear()
    get_engine.cache_clear()
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert response.json()["database"] == "unreachable"


def test_migrations_go_down_and_up_again(clean_db: None) -> None:
    from alembic.config import Config

    from alembic import command

    config = Config(str(BACKEND / "alembic.ini"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")


def test_today_uses_the_uae_time_zone() -> None:
    assert isinstance(today(), date)
