from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ConnectorDefinition:
    key: str
    label: str
    description: str
    auth_type: str
    required_fields: list[str]
    capabilities: list[str]


CONNECTOR_DEFINITIONS: list[ConnectorDefinition] = [
    ConnectorDefinition(
        key="smart_fhir",
        label="SMART on FHIR",
        description="Read-only SMART on FHIR connector using OAuth2 authorization and FHIR R4 APIs.",
        auth_type="oauth2",
        required_fields=["client_id", "client_secret", "fhir_base_url", "redirect_uri"],
        capabilities=[
            "patient_read",
            "encounter_read",
            "observation_read",
            "medication_read",
            "condition_read",
            "allergy_read",
            "document_reference_read",
        ],
    ),
    ConnectorDefinition(
        key="epic",
        label="Epic",
        description="Read-only Epic SMART on FHIR connector for App Orchard or sandbox integrations.",
        auth_type="oauth2",
        required_fields=["client_id", "client_secret", "fhir_base_url", "redirect_uri"],
        capabilities=[
            "patient_read",
            "encounter_read",
            "observation_read",
            "medication_read",
            "condition_read",
            "allergy_read",
            "document_reference_read",
        ],
    ),
    ConnectorDefinition(
        key="cerner",
        label="Oracle Health / Cerner",
        description="Read-only Oracle Health / Cerner SMART on FHIR connector for Millennium-compatible APIs.",
        auth_type="oauth2",
        required_fields=["client_id", "client_secret", "fhir_base_url", "redirect_uri"],
        capabilities=[
            "patient_read",
            "encounter_read",
            "observation_read",
            "medication_read",
            "condition_read",
            "allergy_read",
            "document_reference_read",
        ],
    ),
]


def serialize_connector_definition(definition: ConnectorDefinition) -> dict:
    return {
        "key": definition.key,
        "label": definition.label,
        "description": definition.description,
        "authType": definition.auth_type,
        "requiredFields": definition.required_fields,
        "capabilities": definition.capabilities,
    }
