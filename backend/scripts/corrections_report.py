"""Prints how often partners corrected each reader's work, as Markdown (`make corrections-report`).

The same numbers as GET /api/v1/insights/reading, read straight from the database in DATABASE_URL.
"""

import asyncio

from app.db.session import get_engine, get_sessionmaker
from app.repositories.correction import CorrectionRepository
from app.schemas.insights import ReadingReport
from app.services.corrections import reading_report


def as_markdown(report: ReadingReport) -> str:
    lines = ["# Reading corrections", ""]
    if not report.readers:
        return "\n".join([*lines, "No saved proposals with a recorded reader yet."])
    lines += [
        "| Reader | Model | Readings | Shipments | Corrections | Per 100 shipments |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for r in report.readers:
        lines.append(
            f"| {r.provider} | {r.model or '–'} | {r.readings} | {r.shipments} | {r.corrections} "
            f"| {r.corrections_per_100_shipments} |"
        )
    lines += ["", "## Most corrected", ""]
    if report.most_corrected:
        lines += ["| Reader | Courier | Field | Times | Examples |", "|---|---|---|---:|---|"]
        for g in report.most_corrected:
            lines.append(
                f"| {g.provider} | {g.courier or '–'} | {g.field} | {g.count} | {'; '.join(g.examples)} |"
            )
    else:
        lines.append("Nothing corrected yet.")
    lines += ["", "## Hints the AI gets on new reads", ""]
    lines += [f"- {hint}" for hint in report.hints] or [
        "None yet (a lesson needs 3 similar corrections)."
    ]
    return "\n".join(lines)


async def main() -> None:
    async with get_sessionmaker()() as session:
        report = await reading_report(CorrectionRepository(session))
    await get_engine().dispose()
    print(as_markdown(report))


if __name__ == "__main__":
    asyncio.run(main())
