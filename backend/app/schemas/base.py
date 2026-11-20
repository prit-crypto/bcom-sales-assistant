"""Base for every model the API sends or receives."""

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    # In responses, a field with a default is always present, so describe it as required. FastAPI then
    # publishes separate request ("-Input") and response ("-Output") schemas where they differ, and the
    # frontend's generated types don't have to treat every defaulted field as possibly missing.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
