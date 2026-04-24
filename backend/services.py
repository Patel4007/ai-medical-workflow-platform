from __future__ import annotations

from datetime import datetime, timedelta
import base64
from html import escape as html_escape
from io import BytesIO
import hashlib
import json
import os
import platform
import re
import secrets
from threading import RLock
import time
from urllib.parse import urlencode
from urllib import error as urllib_error, request as urllib_request
from uuid import uuid4

os.environ["TRANSFORMERS_NO_TF"] = "1"
os.environ["USE_TF"] = "0"
os.environ["USE_FLAX"] = "0"

from fastapi import BackgroundTasks, HTTPException, UploadFile
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from tinydb import Query

try:
    from backend.connectors import CONNECTOR_DEFINITIONS, serialize_connector_definition
    from backend.schemas import (
        AgentIntent,
        AgentRequest,
        AgentResponse,
        AgentRunRecord,
        AgentRunsResponse,
        AgentToolResult,
        Allergy,
        AnalysisResponse,
        AuthResponse,
        AutomationJobRecord,
        AutomationJobRequest,
        AutomationJobStep,
        AutomationJobsResponse,
        ChatRequest,
        ClinicalSummary,
        ConnectorConfigRequest,
        ConnectorRecord,
        ConnectorsResponse,
        ConnectorAuthorizeResponse,
        ConnectorSyncResponse,
        Diagnosis,
        DiagnosisType,
        DocumentContext,
        DocumentResponse,
        DocumentType,
        JobStatus,
        LabFlag,
        LabResult,
        LoginRequest,
        Medication,
        ModelAllergy,
        ModelDiagnosis,
        ModelExtraction,
        ModelLabResult,
        ModelMedication,
        ReportRequest,
        Severity,
        UploadResponse,
        UserRequest,
        UserResponse,
        WorkerErrorRequest,
        WorkerJobResponse,
        WorkerResultRequest,
    )
    from backend.storage import (
        UPLOADS_DIR,
        agent_runs_table,
        automation_jobs_table,
        connectors_table,
        connector_states_table,
        documents_table,
        inference_jobs_table,
        sessions_table,
        users_table,
    )
except ModuleNotFoundError as exc:
    if exc.name != "backend":
        raise
    from connectors import CONNECTOR_DEFINITIONS, serialize_connector_definition
    from schemas import (
        AgentIntent,
        AgentRequest,
        AgentResponse,
        AgentRunRecord,
        AgentRunsResponse,
        AgentToolResult,
        Allergy,
        AnalysisResponse,
        AuthResponse,
        AutomationJobRecord,
        AutomationJobRequest,
        AutomationJobStep,
        AutomationJobsResponse,
        ChatRequest,
        ClinicalSummary,
        ConnectorConfigRequest,
        ConnectorRecord,
        ConnectorsResponse,
        ConnectorAuthorizeResponse,
        ConnectorSyncResponse,
        Diagnosis,
        DiagnosisType,
        DocumentContext,
        DocumentResponse,
        DocumentType,
        JobStatus,
        LabFlag,
        LabResult,
        LoginRequest,
        Medication,
        ModelAllergy,
        ModelDiagnosis,
        ModelExtraction,
        ModelLabResult,
        ModelMedication,
        ReportRequest,
        Severity,
        UploadResponse,
        UserRequest,
        UserResponse,
        WorkerErrorRequest,
        WorkerJobResponse,
        WorkerResultRequest,
    )
    from storage import (
        UPLOADS_DIR,
        agent_runs_table,
        automation_jobs_table,
        connectors_table,
        connector_states_table,
        documents_table,
        inference_jobs_table,
        sessions_table,
        users_table,
    )

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None


HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "Patel47/Phi-3-Medical-Transcriber-QA-Model")
HF_DEVICE = os.environ.get("HF_DEVICE", "").strip().lower()
REMOTE_INFERENCE_URL = os.environ.get("REMOTE_INFERENCE_URL", "").strip()
REMOTE_INFERENCE_TOKEN = os.environ.get("REMOTE_INFERENCE_TOKEN", "").strip()
REMOTE_INFERENCE_MODEL_LABEL = os.environ.get("REMOTE_INFERENCE_MODEL_LABEL", "remote-http-gpu-worker").strip()
REMOTE_INFERENCE_TIMEOUT_SECONDS = int(os.environ.get("REMOTE_INFERENCE_TIMEOUT_SECONDS", "180"))
POLLING_INFERENCE_MODEL_LABEL = os.environ.get("POLLING_INFERENCE_MODEL_LABEL", "kaggle-polling-worker").strip()
FALLBACK_MODEL_ID = "local-deterministic-fallback"
_tokenizer = None
_model = None
_inference_job_lock = RLock()


def model_generation_enabled() -> bool:
    override = os.environ.get("HF_ENABLE_MODEL")
    if override is not None:
        return override.strip().lower() in {"1", "true", "yes", "on"}
    return resolve_device() != "cpu"


def polling_inference_enabled() -> bool:
    override = os.environ.get("POLLING_INFERENCE_ENABLED")
    if override is None:
        return False
    return override.strip().lower() in {"1", "true", "yes", "on"}


def polling_worker_token() -> str:
    return os.environ.get("POLLING_WORKER_TOKEN", "").strip()


def polling_job_timeout_seconds() -> int:
    return int(os.environ.get("POLLING_JOB_TIMEOUT_SECONDS", "300"))


def polling_job_lease_seconds() -> int:
    return int(os.environ.get("POLLING_JOB_LEASE_SECONDS", "600"))


def polling_result_poll_interval_seconds() -> float:
    return float(os.environ.get("POLLING_RESULT_POLL_INTERVAL_SECONDS", "1.0"))


def remote_inference_enabled() -> bool:
    return bool(REMOTE_INFERENCE_URL)


def generation_backend_enabled() -> bool:
    return polling_inference_enabled() or remote_inference_enabled() or model_generation_enabled()


def active_analysis_model(used_generation_backend: bool | None = None) -> str:
    if used_generation_backend is None:
        used_generation_backend = generation_backend_enabled()
    if not used_generation_backend:
        return FALLBACK_MODEL_ID
    if polling_inference_enabled():
        return POLLING_INFERENCE_MODEL_LABEL
    if remote_inference_enabled():
        return REMOTE_INFERENCE_MODEL_LABEL
    return HF_MODEL_ID


def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


def require_worker_authorization(authorization: str | None = None) -> None:
    token = polling_worker_token()
    if not token:
        return
    if parse_bearer_token(authorization) != token:
        raise HTTPException(status_code=401, detail="Invalid worker bearer token.")


def ensure_polling_inference_ready() -> None:
    if not polling_inference_enabled():
        raise HTTPException(status_code=503, detail="Polling inference mode is not enabled.")


def build_worker_prompt(system_prompt: str, user_prompt: str) -> str:
    return (
        f"System:\n{system_prompt.strip()}\n\n"
        f"User:\n{user_prompt.strip()}\n\n"
        "Assistant:\n"
    )


def recycle_stale_inference_jobs() -> None:
    now = datetime.utcnow()
    Job = Query()
    stale_jobs = [
        job
        for job in inference_jobs_table.search(Job.status == "running")
        if job.get("leaseExpiresAt")
        and datetime.fromisoformat(job["leaseExpiresAt"]) <= now
        and not job.get("result")
    ]
    for job in stale_jobs:
        inference_jobs_table.update(
            {
                "status": "queued",
                "updatedAt": now.isoformat(),
                "assignedAt": None,
                "leaseExpiresAt": None,
                "error": None,
            },
            Job.id == job["id"],
        )


def enqueue_inference_job(
    system_prompt: str,
    user_prompt: str,
    max_new_tokens: int = 256,
    temperature: float = 0.2,
    top_p: float = 0.9,
) -> str:
    timestamp = datetime.utcnow().isoformat()
    job = {
        "id": str(uuid4()),
        "status": "queued",
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "assignedAt": None,
        "leaseExpiresAt": None,
        "system_prompt": system_prompt,
        "user_prompt": user_prompt,
        "prompt": build_worker_prompt(system_prompt, user_prompt),
        "max_new_tokens": max_new_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "result": None,
        "error": None,
    }
    with _inference_job_lock:
        inference_jobs_table.insert(job)
    return job["id"]


def get_next_inference_job(authorization: str | None = None) -> WorkerJobResponse:
    ensure_polling_inference_ready()
    require_worker_authorization(authorization)
    Job = Query()
    with _inference_job_lock:
        recycle_stale_inference_jobs()
        queued_jobs = inference_jobs_table.search(Job.status == "queued")
        queued_jobs.sort(key=lambda item: item["createdAt"])
        if not queued_jobs:
            return WorkerJobResponse(status="no_jobs")

        job = queued_jobs[0]
        now = datetime.utcnow()
        lease_expires_at = now + timedelta(seconds=polling_job_lease_seconds())
        inference_jobs_table.update(
            {
                "status": "running",
                "updatedAt": now.isoformat(),
                "assignedAt": now.isoformat(),
                "leaseExpiresAt": lease_expires_at.isoformat(),
            },
            Job.id == job["id"],
        )

    return WorkerJobResponse(
        status="running",
        id=job["id"],
        prompt=job["prompt"],
        system_prompt=job["system_prompt"],
        user_prompt=job["user_prompt"],
        max_new_tokens=job["max_new_tokens"],
        temperature=job["temperature"],
        top_p=job["top_p"],
    )


def submit_inference_result(payload: WorkerResultRequest, authorization: str | None = None) -> dict[str, str]:
    ensure_polling_inference_ready()
    require_worker_authorization(authorization)
    Job = Query()
    with _inference_job_lock:
        job = inference_jobs_table.get(Job.id == payload.id)
        if not job:
            raise HTTPException(status_code=404, detail="Inference job not found.")

        inference_jobs_table.update(
            {
                "status": "completed",
                "updatedAt": datetime.utcnow().isoformat(),
                "leaseExpiresAt": None,
                "result": payload.result.strip(),
                "error": None,
            },
            Job.id == payload.id,
        )
    return {"status": "accepted"}


def submit_inference_error(payload: WorkerErrorRequest, authorization: str | None = None) -> dict[str, str]:
    ensure_polling_inference_ready()
    require_worker_authorization(authorization)
    Job = Query()
    with _inference_job_lock:
        job = inference_jobs_table.get(Job.id == payload.id)
        if not job:
            raise HTTPException(status_code=404, detail="Inference job not found.")

        inference_jobs_table.update(
            {
                "status": "failed",
                "updatedAt": datetime.utcnow().isoformat(),
                "leaseExpiresAt": None,
                "error": payload.error.strip() or "Worker reported an unknown error.",
            },
            Job.id == payload.id,
        )
    return {"status": "accepted"}


def generate_with_polling_worker(system_prompt: str, user_prompt: str) -> str:
    job_id = enqueue_inference_job(system_prompt, user_prompt)
    deadline = time.monotonic() + polling_job_timeout_seconds()
    Job = Query()

    while time.monotonic() < deadline:
        job = inference_jobs_table.get(Job.id == job_id)
        if not job:
            raise HTTPException(status_code=500, detail="Inference job disappeared before completion.")
        status = job.get("status")
        if status == "completed":
            content = str(job.get("result") or "").strip()
            if not content:
                raise HTTPException(status_code=502, detail="Polling worker returned an empty response.")
            return content
        if status == "failed":
            raise HTTPException(
                status_code=502,
                detail=str(job.get("error") or "Polling worker failed to process the request."),
            )
        time.sleep(polling_result_poll_interval_seconds())

    error_message = "Polling worker timed out before returning a result."
    inference_jobs_table.update(
        {
            "status": "failed",
            "updatedAt": datetime.utcnow().isoformat(),
            "leaseExpiresAt": None,
            "error": error_message,
        },
        Job.id == job_id,
    )
    raise HTTPException(status_code=504, detail=error_message)


def signup(payload: UserRequest) -> AuthResponse:
    user_email = payload.email.strip().lower()
    if users_table.get(Query().email == user_email):
        raise HTTPException(status_code=400, detail="An account with that email already exists.")

    password_salt = secrets.token_hex(16)
    user = {
        "id": str(uuid4()),
        "name": payload.name.strip(),
        "email": user_email,
        "password_salt": password_salt,
        "password_hash": hash_password(payload.password, password_salt),
        "created_at": datetime.utcnow().isoformat(),
    }
    users_table.insert(user)
    token = create_session(user["id"])
    return AuthResponse(token=token, user=serialize_user(user))


def login(payload: LoginRequest) -> AuthResponse:
    user = users_table.get(Query().email == payload.email.strip().lower())
    if not user or not verify_password(payload.password, user["password_salt"], user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_session(user["id"])
    return AuthResponse(token=token, user=serialize_user(user))


def current_user(authorization: str | None = None) -> UserResponse:
    user = require_user(authorization)
    return serialize_user(user)


def logout(authorization: str | None = None) -> dict[str, str]:
    token = parse_bearer_token(authorization)
    sessions_table.remove(Query().token == token)
    return {"status": "ok"}


def list_documents(authorization: str | None = None) -> UploadResponse:
    user = require_user(authorization)
    docs = documents_table.search(Query().user_id == user["id"])
    docs.sort(key=lambda item: item["uploadDate"], reverse=True)
    return UploadResponse(documents=[DocumentResponse(**doc) for doc in docs])


async def upload_documents(
    files: list[UploadFile],
    authorization: str | None = None,
) -> UploadResponse:
    user = require_user(authorization)
    if not files:
        raise HTTPException(status_code=400, detail="No files were provided.")

    documents: list[DocumentResponse] = []
    for file in files:
        contents = await file.read()
        parsed = parse_document(file.filename or "uploaded-file", contents)
        documents.append(save_document(user["id"], parsed, contents))

    return UploadResponse(documents=documents)


def delete_document(document_id: str, authorization: str | None = None) -> dict[str, str]:
    user = require_user(authorization)
    UserDocument = Query()
    document = documents_table.get((UserDocument.id == document_id) & (UserDocument.user_id == user["id"]))
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")

    file_path = document.get("stored_file_path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass

    documents_table.remove((UserDocument.id == document_id) & (UserDocument.user_id == user["id"]))
    return {"status": "deleted"}


def generate_report(payload: ReportRequest, authorization: str | None = None) -> AnalysisResponse:
    require_user(authorization)
    if not payload.documents:
        raise HTTPException(status_code=400, detail="Select at least one document to generate a report.")

    used_generation_backend = False
    if generation_backend_enabled():
        try:
            content = generate_with_model(
                system_prompt=(
                    "You are a clinical documentation assistant. Generate a concise structured medical report "
                    "from the provided document text. Use plain English, mention uncertainty when needed, "
                    "and avoid inventing facts. Include these sections: Overview, Key Findings, Medications, "
                    "Diagnoses, Labs, Risks or Follow-up."
                ),
                user_prompt=build_documents_prompt(payload.documents),
            )
            used_generation_backend = True
        except HTTPException:
            content = build_report_fallback(payload.documents)
    else:
        content = build_report_fallback(payload.documents)

    return AnalysisResponse(content=content, model=active_analysis_model(used_generation_backend))


def chat_about_documents(payload: ChatRequest, authorization: str | None = None) -> AnalysisResponse:
    require_user(authorization)
    if not payload.documents:
        raise HTTPException(status_code=400, detail="Select at least one document before asking a question.")
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Please enter a question.")

    used_generation_backend = False
    if generation_backend_enabled():
        try:
            content = generate_with_model(
                system_prompt=(
                    "You are a medical document analysis assistant. Answer only from the provided clinical documents. "
                    "Be concise, cite relevant document names inline when helpful, and say when the answer is not present. "
                    "Do not provide a diagnosis beyond what is explicitly documented."
                ),
                user_prompt=f"{build_documents_prompt(payload.documents)}\n\nQuestion: {payload.question.strip()}",
            )
            used_generation_backend = True
        except HTTPException:
            content = build_chat_answer_fallback(payload.documents, payload.question.strip())
    else:
        content = build_chat_answer_fallback(payload.documents, payload.question.strip())

    return AnalysisResponse(content=content, model=active_analysis_model(used_generation_backend))


def run_workflow_agent(payload: AgentRequest, authorization: str | None = None) -> AgentResponse:
    user = require_user(authorization)
    if not payload.documents:
        raise HTTPException(status_code=400, detail="Select at least one document before running the workflow agent.")
    instruction = payload.instruction.strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="Enter a clinician instruction to run the workflow.")

    intent, rationale = interpret_clinician_intent(instruction)
    tools = plan_tools_for_intent(intent, instruction)
    tool_results = execute_agent_tools(intent, instruction, payload.documents, tools)
    final_output = synthesize_agent_response(intent, instruction, payload.documents, tool_results)
    response = AgentResponse(
        intent=intent,
        rationale=rationale,
        tools=tools,
        toolResults=tool_results,
        finalOutput=final_output,
        model=active_analysis_model(),
    )
    persist_agent_run(user["id"], instruction, payload.documents, response)
    return response


def list_agent_runs(authorization: str | None = None) -> AgentRunsResponse:
    user = require_user(authorization)
    rows = agent_runs_table.search(Query().user_id == user["id"])
    rows.sort(key=lambda item: item["createdAt"], reverse=True)
    return AgentRunsResponse(runs=[AgentRunRecord(**strip_user_fields(row)) for row in rows])


def create_automation_job(
    payload: AutomationJobRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = None,
) -> AutomationJobRecord:
    user = require_user(authorization)
    if not payload.documents:
        raise HTTPException(status_code=400, detail="Select at least one document before queueing an automation.")
    instruction = payload.instruction.strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="Enter an automation instruction first.")

    intent, _ = interpret_clinician_intent(instruction)
    tools = plan_tools_for_intent(intent, instruction)
    timestamp = datetime.utcnow().isoformat()
    job = {
        "id": str(uuid4()),
        "user_id": user["id"],
        "automationName": payload.automationName.strip() or "Clinical automation",
        "instruction": instruction,
        "intent": intent,
        "status": "queued",
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "documentIds": [doc.id for doc in payload.documents],
        "documentNames": [doc.fileName for doc in payload.documents],
        "steps": [
            {"name": "intent_interpretation", "status": "completed", "detail": f"Intent resolved to {intent}."},
            *[
                {"name": tool, "status": "queued", "detail": "Waiting to run."}
                for tool in tools
            ],
            {"name": "final_synthesis", "status": "queued", "detail": "Waiting to run."},
        ],
        "finalOutput": None,
        "error": None,
        "model": active_analysis_model(),
    }
    automation_jobs_table.insert(job)
    background_tasks.add_task(execute_automation_job, user["id"], job["id"], payload.documents, instruction, intent, tools)
    return AutomationJobRecord(**strip_user_fields(job))


def list_automation_jobs(authorization: str | None = None) -> AutomationJobsResponse:
    user = require_user(authorization)
    rows = automation_jobs_table.search(Query().user_id == user["id"])
    rows.sort(key=lambda item: item["createdAt"], reverse=True)
    return AutomationJobsResponse(jobs=[AutomationJobRecord(**strip_user_fields(row)) for row in rows])


def get_connector_definition(connector_key: str):
    return next((item for item in CONNECTOR_DEFINITIONS if item.key == connector_key), None)


def default_connector_scopes() -> str:
    return (
        "launch/patient openid fhirUser offline_access "
        "patient/Patient.read patient/Encounter.read patient/Observation.read "
        "patient/MedicationRequest.read patient/MedicationStatement.read "
        "patient/Condition.read patient/AllergyIntolerance.read patient/DocumentReference.read"
    )


def clean_connector_config(config: dict[str, str]) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for key, value in config.items():
        stripped = value.strip()
        if stripped:
            cleaned[key] = stripped
    return cleaned


def connector_is_authorized(record: dict | None) -> bool:
    return bool(record and record.get("accessToken"))


def connector_status(record: dict | None) -> str:
    if not record:
        return "scaffold-ready"
    if connector_is_authorized(record):
        return record.get("status") or "authorized"
    return record.get("status") or "configured-scaffold"


def serialize_connector_record_response(definition, record: dict | None) -> ConnectorRecord:
    base = serialize_connector_definition(definition)
    return ConnectorRecord(
        id=record["id"] if record else f"scaffold-{definition.key}",
        connectorKey=definition.key,
        label=base["label"],
        name=record["name"] if record else base["label"],
        description=base["description"],
        authType=base["authType"],
        requiredFields=base["requiredFields"],
        capabilities=base["capabilities"],
        configured=bool(record),
        status=connector_status(record),
        authorized=connector_is_authorized(record),
        patientName=record.get("patientName") if record else None,
        patientId=record.get("patientId") if record else None,
        lastSyncAt=record.get("lastSyncAt") if record else None,
        createdAt=record.get("createdAt") if record else None,
        updatedAt=record.get("updatedAt") if record else None,
    )


def list_connectors(authorization: str | None = None) -> ConnectorsResponse:
    user = require_user(authorization)
    saved = {
        row["connectorKey"]: row
        for row in connectors_table.search(Query().user_id == user["id"])
    }
    connectors: list[ConnectorRecord] = []
    for definition in CONNECTOR_DEFINITIONS:
        connectors.append(serialize_connector_record_response(definition, saved.get(definition.key)))
    return ConnectorsResponse(connectors=connectors)


def configure_connector(payload: ConnectorConfigRequest, authorization: str | None = None) -> ConnectorRecord:
    user = require_user(authorization)
    definition = get_connector_definition(payload.connectorKey)
    if not definition:
        raise HTTPException(status_code=404, detail="Connector scaffold not found.")

    config = clean_connector_config(payload.config)
    missing = [field for field in definition.required_fields if not config.get(field)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing connector fields: {', '.join(missing)}")

    UserConnector = Query()
    now = datetime.utcnow().isoformat()
    existing = connectors_table.get((UserConnector.user_id == user["id"]) & (UserConnector.connectorKey == definition.key))
    record = {
        "id": existing["id"] if existing else str(uuid4()),
        "user_id": user["id"],
        "connectorKey": definition.key,
        "label": definition.label,
        "name": payload.name.strip() or definition.label,
        "status": "configured-scaffold",
        "config": config,
        "accessToken": None,
        "refreshToken": None,
        "tokenType": None,
        "tokenExpiresAt": None,
        "patientId": None,
        "patientName": None,
        "lastSyncAt": None,
        "createdAt": existing["createdAt"] if existing else now,
        "updatedAt": now,
    }
    if existing:
        connectors_table.update(record, doc_ids=[existing.doc_id])
    else:
        connectors_table.insert(record)

    return serialize_connector_record_response(definition, record)


def http_get_json(url: str, headers: dict[str, str] | None = None) -> dict:
    request = urllib_request.Request(
        url,
        headers={
            "Accept": "application/json, application/fhir+json",
            **(headers or {}),
        },
        method="GET",
    )
    try:
        with urllib_request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore").strip()
        raise HTTPException(status_code=502, detail=details or f"Request to {url} failed.") from exc
    except urllib_error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach {url}: {exc.reason}") from exc


def http_post_form_json(url: str, data: dict[str, str], headers: dict[str, str] | None = None) -> dict:
    encoded = urlencode(data).encode("utf-8")
    request = urllib_request.Request(
        url,
        data=encoded,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            **(headers or {}),
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore").strip()
        raise HTTPException(status_code=502, detail=details or f"Request to {url} failed.") from exc
    except urllib_error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach {url}: {exc.reason}") from exc


def smart_configuration_url(fhir_base_url: str) -> str:
    return f"{fhir_base_url.rstrip('/')}/.well-known/smart-configuration"


def discover_smart_configuration(fhir_base_url: str) -> dict:
    return http_get_json(smart_configuration_url(fhir_base_url))


def connector_endpoints(config: dict[str, str]) -> tuple[str, str]:
    authorize_url = config.get("authorize_url", "")
    token_url = config.get("token_url", "")
    if authorize_url and token_url:
        return authorize_url, token_url

    smart_config = discover_smart_configuration(config["fhir_base_url"])
    authorize_url = authorize_url or smart_config.get("authorization_endpoint", "")
    token_url = token_url or smart_config.get("token_endpoint", "")
    if not authorize_url or not token_url:
        raise HTTPException(
            status_code=400,
            detail="Could not discover SMART authorization and token endpoints. Provide authorize_url and token_url.",
        )
    return authorize_url, token_url


def connector_scope_string(config: dict[str, str]) -> str:
    return config.get("scopes", default_connector_scopes())


def start_connector_authorization(connector_key: str, authorization: str | None = None) -> ConnectorAuthorizeResponse:
    user = require_user(authorization)
    definition = get_connector_definition(connector_key)
    if not definition:
        raise HTTPException(status_code=404, detail="Connector scaffold not found.")

    UserConnector = Query()
    record = connectors_table.get(
        (UserConnector.user_id == user["id"]) & (UserConnector.connectorKey == connector_key)
    )
    if not record:
        raise HTTPException(status_code=400, detail="Save the connector configuration first.")

    config = record.get("config", {})
    authorize_url, _ = connector_endpoints(config)
    state = secrets.token_urlsafe(24)
    now = datetime.utcnow().isoformat()
    connector_states_table.insert(
        {
            "id": str(uuid4()),
            "state": state,
            "user_id": user["id"],
            "connectorKey": connector_key,
            "createdAt": now,
        }
    )
    query = urlencode(
        {
            "response_type": "code",
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "scope": connector_scope_string(config),
            "aud": config["fhir_base_url"].rstrip("/"),
            "state": state,
        }
    )
    return ConnectorAuthorizeResponse(authorizationUrl=f"{authorize_url}?{query}")


def exchange_connector_authorization_code(record: dict, code: str) -> dict:
    config = record.get("config", {})
    _, token_url = connector_endpoints(config)
    basic_token = base64.b64encode(
        f"{config['client_id']}:{config['client_secret']}".encode("utf-8")
    ).decode("utf-8")
    return http_post_form_json(
        token_url,
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": config["redirect_uri"],
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
        },
        headers={"Authorization": f"Basic {basic_token}"},
    )


def fhir_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def fetch_fhir_json(fhir_base_url: str, path: str, access_token: str) -> dict:
    return http_get_json(f"{fhir_base_url.rstrip('/')}/{path.lstrip('/')}", headers=fhir_headers(access_token))


def fetch_fhir_bundle(fhir_base_url: str, resource_path: str, access_token: str) -> list[dict]:
    payload = fetch_fhir_json(fhir_base_url, resource_path, access_token)
    if payload.get("resourceType") != "Bundle":
        return []
    return [
        entry.get("resource", {})
        for entry in payload.get("entry", [])
        if isinstance(entry, dict) and isinstance(entry.get("resource"), dict)
    ]


def pick_human_name(patient_resource: dict) -> str:
    for item in patient_resource.get("name", []):
        given = " ".join(item.get("given", []))
        family = item.get("family", "")
        full_name = " ".join(part for part in [given, family] if part).strip()
        if full_name:
            return full_name
    return patient_resource.get("id", "Unknown Patient")


def pick_patient_identifier(patient_resource: dict) -> str:
    for identifier in patient_resource.get("identifier", []):
        value = str(identifier.get("value") or "").strip()
        if value:
            return value
    return patient_resource.get("id", "Unknown MRN")


def codeable_text(codeable: dict | None) -> str:
    if not codeable:
        return ""
    text = str(codeable.get("text") or "").strip()
    if text:
        return text
    for coding in codeable.get("coding", []):
        display = str(coding.get("display") or "").strip()
        if display:
            return display
        code = str(coding.get("code") or "").strip()
        if code:
            return code
    return ""


def quantity_text(quantity: dict | None) -> str:
    if not quantity:
        return ""
    value = str(quantity.get("value") or "").strip()
    unit = str(quantity.get("unit") or quantity.get("code") or "").strip()
    return " ".join(part for part in [value, unit] if part).strip()


def observation_value_text(resource: dict) -> str:
    if resource.get("valueQuantity"):
        return quantity_text(resource["valueQuantity"])
    if resource.get("valueString"):
        return str(resource["valueString"]).strip()
    if resource.get("valueCodeableConcept"):
        return codeable_text(resource["valueCodeableConcept"])
    if resource.get("valueInteger") is not None:
        return str(resource["valueInteger"])
    if resource.get("valueBoolean") is not None:
        return str(resource["valueBoolean"]).lower()
    return ""


def reference_range_text(resource: dict) -> str:
    for item in resource.get("referenceRange", []):
        text = str(item.get("text") or "").strip()
        if text:
            return text
        low = quantity_text(item.get("low"))
        high = quantity_text(item.get("high"))
        if low or high:
            return " - ".join(part for part in [low, high] if part)
    return "Not provided"


def interpretation_flag(resource: dict) -> LabFlag | None:
    for item in resource.get("interpretation", []):
        text = codeable_text(item).lower()
        if "critical" in text:
            return "critical"
        if "high" in text:
            return "high"
        if "low" in text:
            return "low"
    return None


def timing_text(timing: dict | None) -> str:
    if not timing:
        return ""
    if timing.get("code"):
        return codeable_text(timing["code"])
    repeat = timing.get("repeat", {})
    frequency = repeat.get("frequency")
    period = repeat.get("period")
    period_unit = repeat.get("periodUnit")
    if frequency and period and period_unit:
        return f"{frequency} time(s) every {period} {period_unit}"
    return ""


def route_text(route: dict | None) -> str:
    return codeable_text(route) or "Unspecified"


def medication_name_from_resource(resource: dict) -> str:
    name = codeable_text(resource.get("medicationCodeableConcept"))
    if name:
        return name
    reference = str(resource.get("medicationReference", {}).get("display") or "").strip()
    return reference or "Unspecified medication"


def medication_from_medication_request(resource: dict) -> Medication:
    dosage_instruction = (resource.get("dosageInstruction") or [{}])[0]
    dose_quantity = ""
    for dose_and_rate in dosage_instruction.get("doseAndRate", []):
        dose_quantity = quantity_text(dose_and_rate.get("doseQuantity"))
        if dose_quantity:
            break
    frequency = (
        str(dosage_instruction.get("text") or "").strip()
        or timing_text(dosage_instruction.get("timing"))
        or "As directed"
    )
    return Medication(
        name=medication_name_from_resource(resource),
        dosage=dose_quantity or "Not specified",
        frequency=frequency,
        route=route_text(dosage_instruction.get("route")),
        confidence=0.91,
    )


def medication_from_medication_statement(resource: dict) -> Medication:
    dosage = ""
    dosage_instruction = (resource.get("dosage") or [{}])[0]
    frequency = (
        str(dosage_instruction.get("text") or "").strip()
        or timing_text(dosage_instruction.get("timing"))
        or "As reported"
    )
    return Medication(
        name=codeable_text(resource.get("medicationCodeableConcept")) or "Unspecified medication",
        dosage=dosage or "Not specified",
        frequency=frequency,
        route=route_text(dosage_instruction.get("route")),
        confidence=0.87,
    )


def dedupe_medications(items: list[Medication]) -> list[Medication]:
    seen: set[tuple[str, str, str]] = set()
    result: list[Medication] = []
    for item in items:
        key = (item.name.lower(), item.dosage.lower(), item.frequency.lower())
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def diagnosis_from_condition(resource: dict, index: int) -> Diagnosis:
    codeable = resource.get("code", {})
    description = codeable_text(codeable) or "Unspecified condition"
    code = "Uncoded"
    for coding in codeable.get("coding", []):
        candidate = str(coding.get("code") or "").strip()
        if candidate:
            code = candidate
            break
    return Diagnosis(
        code=code,
        description=description,
        type="primary" if index == 0 else "secondary",
        confidence=0.9,
    )


def allergy_from_resource(resource: dict) -> Allergy:
    reaction_text = ""
    severity = "mild"
    for reaction in resource.get("reaction", []):
        manifestation_names = [codeable_text(item) for item in reaction.get("manifestation", [])]
        reaction_text = ", ".join(value for value in manifestation_names if value).strip()
        severity = str(reaction.get("severity") or "mild").lower() or "mild"
        if reaction_text:
            break
    if severity not in {"mild", "moderate", "severe"}:
        severity = "mild"
    return Allergy(
        allergen=codeable_text(resource.get("code")) or "Unknown allergen",
        reaction=reaction_text or "Reaction not specified",
        severity=severity,
        confidence=0.9,
    )


def lab_result_from_observation(resource: dict) -> LabResult | None:
    test = codeable_text(resource.get("code")) or str(resource.get("id") or "").strip()
    value = observation_value_text(resource)
    if not test or not value:
        return None
    return LabResult(
        test=test,
        value=value,
        unit=str(resource.get("valueQuantity", {}).get("unit") or "").strip(),
        referenceRange=reference_range_text(resource),
        flag=interpretation_flag(resource),
        confidence=0.88,
    )


def document_reference_title(resource: dict) -> str:
    return str(resource.get("description") or resource.get("type", {}).get("text") or resource.get("id") or "").strip()


def build_connector_raw_text(
    connector_name: str,
    patient_name: str,
    patient_id: str,
    medications: list[Medication],
    diagnoses: list[Diagnosis],
    allergies: list[Allergy],
    lab_results: list[LabResult],
    document_references: list[dict],
) -> str:
    lines = [
        f"SMART on FHIR Import",
        f"Connector: {connector_name}",
        f"Patient Name: {patient_name}",
        f"Patient ID: {patient_id}",
        "",
        "Active Medications:",
    ]
    if medications:
        lines.extend(
            f"- {item.name} | dosage: {item.dosage} | frequency: {item.frequency} | route: {item.route}"
            for item in medications
        )
    else:
        lines.append("- None documented.")

    lines.extend(["", "Conditions:"])
    if diagnoses:
        lines.extend(f"- {item.code}: {item.description}" for item in diagnoses)
    else:
        lines.append("- None documented.")

    lines.extend(["", "Allergies:"])
    if allergies:
        lines.extend(f"- {item.allergen} ({item.reaction}, severity {item.severity})" for item in allergies)
    else:
        lines.append("- None documented.")

    lines.extend(["", "Recent Laboratory Observations:"])
    if lab_results:
        lines.extend(
            f"- {item.test}: {item.value} {item.unit}".strip() + f" (reference {item.referenceRange})"
            for item in lab_results
        )
    else:
        lines.append("- None documented.")

    lines.extend(["", "Document References:"])
    if document_references:
        lines.extend(f"- {document_reference_title(item) or 'Untitled document'}" for item in document_references)
    else:
        lines.append("- None documented.")
    return "\n".join(lines)


def upsert_connector_record(record: dict) -> None:
    Connector = Query()
    existing = connectors_table.get(Connector.id == record["id"])
    if existing:
        connectors_table.update(record, doc_ids=[existing.doc_id])
    else:
        connectors_table.insert(record)


def connector_import_summary(
    connector_name: str,
    diagnoses: list[Diagnosis],
    medications: list[Medication],
) -> ClinicalSummary:
    diagnosis_text = "; ".join(item.description for item in diagnoses[:3]) or "No active diagnoses retrieved from the EHR."
    medication_text = "; ".join(item.name for item in medications[:3]) or "No active medications retrieved."
    return ClinicalSummary(
        chiefComplaint=f"Imported patient chart from {connector_name}.",
        historyOfPresentIllness="Read-only SMART on FHIR sync created from live EHR data.",
        assessment=diagnosis_text,
        plan=f"Review imported medication list and chart data. Active medications: {medication_text}",
    )


def persist_imported_connector_document(
    user_id: str,
    connector_record: dict,
    patient_resource: dict,
    medications: list[Medication],
    diagnoses: list[Diagnosis],
    allergies: list[Allergy],
    lab_results: list[LabResult],
    document_references: list[dict],
) -> DocumentResponse:
    connector_label = str(
        connector_record.get("label")
        or connector_record.get("name")
        or connector_record.get("connectorKey")
        or "SMART on FHIR"
    )
    patient_name = pick_human_name(patient_resource)
    patient_identifier = pick_patient_identifier(patient_resource)
    now = datetime.utcnow().isoformat()
    raw_text = build_connector_raw_text(
        connector_record["name"],
        patient_name,
        patient_identifier,
        medications,
        diagnoses,
        allergies,
        lab_results,
        document_references,
    )
    document = DocumentResponse(
        id=str(uuid4()),
        fileName=f"{connector_label} SMART import - {patient_name}.txt",
        patientName=patient_name,
        patientId=patient_identifier,
        documentType="clinical-note",
        uploadDate=now,
        documentDate=now,
        pageCount=1,
        status="completed",
        medications=medications,
        diagnoses=diagnoses,
        allergies=allergies,
        labResults=lab_results,
        summary=connector_import_summary(connector_label, diagnoses, medications),
        rawText=raw_text,
        confidence=0.96,
    )
    record = document.model_dump()
    record["user_id"] = user_id
    record["source_connector_key"] = connector_record["connectorKey"]
    record["source_patient_id"] = patient_resource.get("id")
    documents_table.insert(record)
    return document


def sync_connector_record(record: dict, user_id: str) -> tuple[dict, DocumentResponse]:
    access_token = str(record.get("accessToken") or "").strip()
    config = record.get("config", {})
    if not access_token:
        raise HTTPException(status_code=400, detail="Authorize the connector before syncing patient data.")

    patient_id = str(record.get("patientId") or config.get("patient_id") or "").strip()
    if not patient_id:
        raise HTTPException(
            status_code=400,
            detail="No patient context was returned by SMART. Re-authorize with patient launch context or provide patient_id in the connector config.",
        )

    fhir_base_url = config["fhir_base_url"]
    patient_resource = fetch_fhir_json(fhir_base_url, f"Patient/{patient_id}", access_token)
    medication_requests = fetch_fhir_bundle(fhir_base_url, f"MedicationRequest?patient={patient_id}&_count=25", access_token)
    medication_statements = fetch_fhir_bundle(fhir_base_url, f"MedicationStatement?patient={patient_id}&_count=25", access_token)
    conditions = fetch_fhir_bundle(fhir_base_url, f"Condition?patient={patient_id}&_count=25", access_token)
    allergies = fetch_fhir_bundle(fhir_base_url, f"AllergyIntolerance?patient={patient_id}&_count=25", access_token)
    observations = fetch_fhir_bundle(
        fhir_base_url,
        f"Observation?patient={patient_id}&category=laboratory&_count=25",
        access_token,
    )
    document_references = fetch_fhir_bundle(fhir_base_url, f"DocumentReference?patient={patient_id}&_count=10", access_token)

    medications = dedupe_medications(
        [medication_from_medication_request(item) for item in medication_requests]
        + [medication_from_medication_statement(item) for item in medication_statements]
    )
    diagnoses = [diagnosis_from_condition(item, index) for index, item in enumerate(conditions)]
    allergy_items = [allergy_from_resource(item) for item in allergies]
    lab_results = [item for item in (lab_result_from_observation(resource) for resource in observations) if item]

    imported_document = persist_imported_connector_document(
        user_id,
        record,
        patient_resource,
        medications,
        diagnoses,
        allergy_items,
        lab_results,
        document_references,
    )

    updated_record = {
        **record,
        "patientName": imported_document.patientName,
        "patientId": patient_id,
        "status": "authorized",
        "lastSyncAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
        "lastImportedDocumentId": imported_document.id,
    }
    upsert_connector_record(updated_record)
    definition = get_connector_definition(record["connectorKey"])
    return serialize_connector_record_response(definition, updated_record).model_dump(), imported_document


def sync_connector(connector_key: str, authorization: str | None = None) -> ConnectorSyncResponse:
    user = require_user(authorization)
    definition = get_connector_definition(connector_key)
    if not definition:
        raise HTTPException(status_code=404, detail="Connector scaffold not found.")

    Connector = Query()
    record = connectors_table.get(
        (Connector.user_id == user["id"]) & (Connector.connectorKey == connector_key)
    )
    if not record:
        raise HTTPException(status_code=404, detail="Save the connector configuration first.")

    connector_payload, imported_document = sync_connector_record(record, user["id"])
    return ConnectorSyncResponse(
        connector=ConnectorRecord(**connector_payload),
        importedDocument=imported_document,
    )


def complete_connector_authorization(code: str, state: str) -> tuple[ConnectorRecord, DocumentResponse]:
    State = Query()
    state_record = connector_states_table.get(State.state == state)
    if not state_record:
        raise HTTPException(status_code=400, detail="SMART connector state is invalid or has expired.")

    try:
        Connector = Query()
        connector_record = connectors_table.get(
            (Connector.user_id == state_record["user_id"]) & (Connector.connectorKey == state_record["connectorKey"])
        )
        if not connector_record:
            raise HTTPException(status_code=404, detail="Connector configuration not found for this authorization state.")

        token_response = exchange_connector_authorization_code(connector_record, code)
        expires_in = int(token_response.get("expires_in") or 3600)
        updated_record = {
            **connector_record,
            "accessToken": str(token_response.get("access_token") or "").strip(),
            "refreshToken": str(token_response.get("refresh_token") or "").strip() or None,
            "tokenType": str(token_response.get("token_type") or "Bearer"),
            "tokenExpiresAt": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            "patientId": str(token_response.get("patient") or connector_record.get("config", {}).get("patient_id") or "").strip()
            or None,
            "status": "authorized",
            "updatedAt": datetime.utcnow().isoformat(),
        }
        if not updated_record["accessToken"]:
            raise HTTPException(status_code=502, detail="SMART token exchange did not return an access token.")
        upsert_connector_record(updated_record)
        connector_payload, imported_document = sync_connector_record(updated_record, state_record["user_id"])
        return ConnectorRecord(**connector_payload), imported_document
    finally:
        connector_states_table.remove(State.state == state)


def build_connector_callback_html(title: str, message: str, success: bool) -> str:
    heading_color = "#166534" if success else "#991b1b"
    callback_payload = json.dumps({"type": "connector-callback", "success": success})
    return f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>{html_escape(title)}</title>
    <style>
      body {{
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 32px;
        background: #f8fafc;
        color: #0f172a;
      }}
      .card {{
        max-width: 640px;
        margin: 48px auto;
        padding: 24px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }}
      h1 {{
        margin-top: 0;
        color: {heading_color};
      }}
      p {{
        line-height: 1.6;
      }}
      button {{
        margin-top: 16px;
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 999px;
        padding: 10px 18px;
        cursor: pointer;
      }}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>{html_escape(title)}</h1>
      <p>{html_escape(message)}</p>
      <button onclick="window.close()">Close Window</button>
    </div>
    <script>
      try {{
        if (window.opener && !window.opener.closed) {{
          window.opener.postMessage({callback_payload}, "*");
        }}
      }} catch (error) {{
        console.warn("Could not notify opener about connector callback.", error);
      }}
      setTimeout(() => window.close(), 1200);
    </script>
  </body>
</html>"""


def parse_document(file_name: str, contents: bytes) -> DocumentResponse:
    raw_text, page_count = extract_text(file_name, contents)
    cleaned_text = raw_text.strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail=f"{file_name} did not contain readable text.")

    document_date = extract_document_date(cleaned_text) or datetime.utcnow()
    patient_name = extract_patient_name(cleaned_text)
    patient_id = extract_patient_id(cleaned_text)
    medications = extract_medications(cleaned_text)
    diagnoses = extract_diagnoses(cleaned_text)
    allergies = extract_allergies(cleaned_text)
    lab_results = extract_lab_results(cleaned_text)
    summary = build_summary(cleaned_text)

    model_extraction = maybe_extract_with_model(
        raw_text=cleaned_text,
        patient_name=patient_name,
        patient_id=patient_id,
        medications=medications,
        diagnoses=diagnoses,
        allergies=allergies,
        lab_results=lab_results,
        summary=summary,
    )
    patient_name = merge_patient_name(patient_name, model_extraction)
    patient_id = merge_patient_id(patient_id, model_extraction)
    medications = merge_medications(medications, model_extraction)
    diagnoses = merge_diagnoses(diagnoses, model_extraction)
    allergies = merge_allergies(allergies, model_extraction)
    lab_results = merge_lab_results(lab_results, model_extraction)
    summary = merge_summary(summary, model_extraction)

    return DocumentResponse(
        id=str(uuid4()),
        fileName=file_name,
        patientName=patient_name,
        patientId=patient_id,
        documentType=infer_document_type(file_name, cleaned_text),
        uploadDate=datetime.utcnow().isoformat(),
        documentDate=document_date.isoformat(),
        pageCount=page_count,
        status="completed",
        medications=medications,
        diagnoses=diagnoses,
        allergies=allergies,
        labResults=lab_results,
        summary=summary,
        rawText=cleaned_text,
        confidence=compute_confidence(cleaned_text, medications, diagnoses, allergies, lab_results),
    )


def interpret_clinician_intent(instruction: str) -> tuple[AgentIntent, str]:
    text = instruction.lower()
    if any(keyword in text for keyword in ("soap", "progress note", "note", "hpi", "assessment and plan", "discharge summary", "generate note")):
        return "note_generation", "Detected note-generation language in the clinician request."
    if any(keyword in text for keyword in ("extract", "list", "pull", "show", "medication", "diagnos", "lab", "allerg", "data")):
        return "data_extraction", "Detected a request for structured clinical data."
    if any(keyword in text for keyword in ("summary", "summarize", "overview", "brief", "recap")):
        return "summarization", "Detected a summarization request."

    classification = classify_intent_with_model(instruction)
    if classification:
        return classification
    return "summarization", "Fell back to summarization because the instruction was broad."


def classify_intent_with_model(instruction: str) -> tuple[AgentIntent, str] | None:
    if not generation_backend_enabled():
        return None

    prompt = (
        "Classify the clinician request into exactly one intent and return only JSON. "
        'Schema: {"intent":"summarization|data_extraction|note_generation","rationale":""}. '
        f"Request: {instruction}"
    )
    try:
        response = generate_with_model(
            system_prompt=(
                "You are a workflow intent classifier for clinical users. "
                "Return only JSON."
            ),
            user_prompt=prompt,
        )
        parsed = parse_json_object(response)
        if not parsed:
            return None
        intent = parsed.get("intent", "").strip()
        rationale = parsed.get("rationale", "").strip() or "Model-derived intent classification."
        if intent in {"summarization", "data_extraction", "note_generation"}:
            return intent, rationale
    except Exception:
        return None
    return None


def plan_tools_for_intent(intent: AgentIntent, instruction: str) -> list[str]:
    if intent == "note_generation":
        return ["patient_snapshot", "structured_extract", "note_generator"]
    if intent == "data_extraction":
        if "lab" in instruction.lower():
            return ["patient_snapshot", "structured_extract"]
        return ["structured_extract", "answer_formatter"]
    return ["patient_snapshot", "summarizer"]


def execute_agent_tools(
    intent: AgentIntent,
    instruction: str,
    documents: list[DocumentContext],
    tools: list[str],
) -> list[AgentToolResult]:
    results: list[AgentToolResult] = []
    for tool in tools:
        if tool == "patient_snapshot":
            content = tool_patient_snapshot(documents)
            results.append(AgentToolResult(tool=tool, summary="Built a cross-document patient snapshot.", content=content))
        elif tool == "structured_extract":
            content = tool_structured_extract(documents)
            results.append(AgentToolResult(tool=tool, summary="Collected structured medications, diagnoses, allergies, and labs.", content=content))
        elif tool == "summarizer":
            content = tool_summarize_documents(documents, instruction)
            results.append(AgentToolResult(tool=tool, summary="Generated a concise clinical summary.", content=content))
        elif tool == "note_generator":
            content = tool_generate_note(documents, instruction)
            results.append(AgentToolResult(tool=tool, summary="Generated a clinician-facing note draft.", content=content))
        elif tool == "answer_formatter":
            content = tool_format_extraction_answer(documents, instruction)
            results.append(AgentToolResult(tool=tool, summary="Formatted the requested extracted data for the clinician.", content=content))
    return results


def execute_automation_job(
    user_id: str,
    job_id: str,
    documents: list[DocumentContext],
    instruction: str,
    intent: AgentIntent,
    tools: list[str],
) -> None:
    try:
        set_job_status(job_id, "running")
        tool_results: list[AgentToolResult] = []
        for tool in tools:
            set_job_step(job_id, tool, "running", "Running tool.")
            result = execute_agent_tools(intent, instruction, documents, [tool])[0]
            tool_results.append(result)
            set_job_step(job_id, tool, "completed", result.summary)

        set_job_step(job_id, "final_synthesis", "running", "Synthesizing final output.")
        final_output = synthesize_agent_response(intent, instruction, documents, tool_results)
        set_job_step(job_id, "final_synthesis", "completed", "Final output generated.")
        finalize_job(job_id, "completed", final_output, None)
        persist_agent_run(
            user_id,
            instruction,
            documents,
            AgentResponse(
                intent=intent,
                rationale=f"Automation job executed with {len(tools)} tool step(s).",
                tools=tools,
                toolResults=tool_results,
                finalOutput=final_output,
                model=active_analysis_model(),
            ),
        )
    except Exception as exc:
        finalize_job(job_id, "failed", None, str(exc))


def synthesize_agent_response(
    intent: AgentIntent,
    instruction: str,
    documents: list[DocumentContext],
    tool_results: list[AgentToolResult],
) -> str:
    tool_trace = "\n\n".join(
        f"Tool: {item.tool}\nSummary: {item.summary}\nOutput:\n{item.content}"
        for item in tool_results
    )
    if generation_backend_enabled():
        try:
            return generate_with_model(
                system_prompt=(
                    "You are a clinical workflow orchestration agent. "
                    "Use the provided tool outputs to produce the final clinician-ready response. "
                    "Do not mention internal implementation details unless asked."
                ),
                user_prompt=(
                    f"Intent: {intent}\n"
                    f"Instruction: {instruction}\n\n"
                    f"Documents:\n{build_documents_prompt(documents)}\n\n"
                    f"Tool outputs:\n{tool_trace}"
                ),
            )
        except HTTPException:
            pass
    return synthesize_agent_response_fallback(intent, instruction, tool_results)


def tool_patient_snapshot(documents: list[DocumentContext]) -> str:
    patient_names = ", ".join(sorted({doc.patientName for doc in documents}))
    patient_ids = ", ".join(sorted({doc.patientId for doc in documents}))
    complaints = "; ".join(doc.summary.chiefComplaint for doc in documents if doc.summary.chiefComplaint)
    assessments = "; ".join(doc.summary.assessment for doc in documents if doc.summary.assessment)
    return (
        f"Patients: {patient_names or 'Unknown'}\n"
        f"Patient IDs: {patient_ids or 'Unknown'}\n"
        f"Chief complaints: {complaints or 'Not available'}\n"
        f"Assessments: {assessments or 'Not available'}"
    )


def tool_structured_extract(documents: list[DocumentContext]) -> str:
    extracted_docs: list[dict] = []
    for doc in documents:
        stored = documents_table.get(Query().id == doc.id)
        if not stored:
            continue
        extracted_docs.append(
            {
                "fileName": doc.fileName,
                "patientName": doc.patientName,
                "patientId": doc.patientId,
                "medications": stored.get("medications", []),
                "diagnoses": stored.get("diagnoses", []),
                "allergies": stored.get("allergies", []),
                "labResults": stored.get("labResults", []),
            }
        )
    return json.dumps(extracted_docs, indent=2)


def tool_summarize_documents(documents: list[DocumentContext], instruction: str) -> str:
    if generation_backend_enabled():
        try:
            return generate_with_model(
                system_prompt=(
                    "You are a clinician-facing summarization tool. "
                    "Summarize the key points relevant to the instruction with a short, actionable tone."
                ),
                user_prompt=(
                    f"Instruction: {instruction}\n\n"
                    f"Documents:\n{build_documents_prompt(documents)}"
                ),
            )
        except HTTPException:
            pass
    return build_summary_fallback(documents, instruction)


def tool_generate_note(documents: list[DocumentContext], instruction: str) -> str:
    if generation_backend_enabled():
        try:
            return generate_with_model(
                system_prompt=(
                    "You generate concise clinical notes from EHR context. "
                    "Use sections when appropriate and avoid fabricating facts."
                ),
                user_prompt=(
                    f"Generate a clinician-ready note based on this instruction: {instruction}\n\n"
                    f"EHR context:\n{build_documents_prompt(documents)}"
                ),
            )
        except HTTPException:
            pass
    return build_note_fallback(documents, instruction)


def tool_format_extraction_answer(documents: list[DocumentContext], instruction: str) -> str:
    extracted = tool_structured_extract(documents)
    if generation_backend_enabled():
        try:
            return generate_with_model(
                system_prompt=(
                    "You are a clinical data extraction formatter. "
                    "Answer the request using only the structured extracted data."
                ),
                user_prompt=(
                    f"Instruction: {instruction}\n\n"
                    f"Structured data:\n{extracted}"
                ),
            )
        except HTTPException:
            pass
    return build_extraction_answer_fallback(documents, instruction)


def save_document(user_id: str, document: DocumentResponse, contents: bytes) -> DocumentResponse:
    suffix = os.path.splitext(document.fileName)[1] or ".txt"
    stored_name = f"{document.id}{suffix}"
    stored_path = UPLOADS_DIR / stored_name
    with open(stored_path, "wb") as file_handle:
        file_handle.write(contents)

    record = document.model_dump()
    record["user_id"] = user_id
    record["stored_file_path"] = str(stored_path)
    documents_table.insert(record)
    return DocumentResponse(**document.model_dump())


def extract_text(file_name: str, contents: bytes) -> tuple[str, int]:
    lower_name = file_name.lower()
    if lower_name.endswith(".txt"):
        return decode_text(contents), 1
    if lower_name.endswith(".pdf"):
        if PdfReader is None:
            raise HTTPException(
                status_code=500,
                detail="PDF support requires the 'pypdf' package. Install backend requirements and retry.",
            )
        reader = PdfReader(BytesIO(contents))
        parts = [(page.extract_text() or "").strip() for page in reader.pages]
        return "\n\n".join(part for part in parts if part), max(len(reader.pages), 1)
    raise HTTPException(status_code=400, detail=f"{file_name} is not supported. Upload PDF or TXT files.")


def decode_text(contents: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return contents.decode(encoding)
        except UnicodeDecodeError:
            continue
    return contents.decode("utf-8", errors="ignore")


def extract_patient_name(raw_text: str) -> str:
    match = re.search(r"(?im)^patient(?:\s+name)?\s*:\s*(.+)$", raw_text)
    return match.group(1).strip() if match else "Unknown Patient"


def extract_patient_id(raw_text: str) -> str:
    match = re.search(r"(?im)^(?:mrn|patient\s*id)\s*:\s*(.+)$", raw_text)
    return match.group(1).strip() if match else "Unknown MRN"


def extract_document_date(raw_text: str) -> datetime | None:
    patterns = [
        r"(?im)^(?:date of service|collection date|date|date of visit)\s*:\s*(.+)$",
        r"(?im)^(?:document date|service date)\s*:\s*(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_text)
        if not match:
            continue
        value = match.group(1).strip()
        for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y", "%Y-%m-%d", "%B %d %Y"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def infer_document_type(file_name: str, raw_text: str) -> DocumentType:
    sample = f"{file_name}\n{raw_text[:2000]}".lower()
    if "discharge" in sample:
        return "discharge-summary"
    if any(keyword in sample for keyword in ("lab", "laboratory", "cbc", "metabolic panel")):
        return "lab-report"
    if "radiology" in sample or "impression" in sample:
        return "radiology"
    if any(keyword in sample for keyword in ("clinical note", "progress note", "soap")):
        return "clinical-note"
    return "other"


def extract_section(raw_text: str, heading: str, stop_headings: list[str]) -> str:
    pattern = rf"(?is){heading}\s*:?\s*(.+?)(?=\n(?:{'|'.join(stop_headings)})\s*:|\Z)"
    match = re.search(pattern, raw_text)
    return match.group(1).strip() if match else ""


def normalize_line(line: str) -> str:
    return re.sub(r"^\s*(?:[-*]|\d+\.)\s*", "", line).strip()


def split_medication_entries(section: str) -> list[str]:
    entries: list[str] = []
    for raw_line in section.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        numbered_parts = re.split(r"(?:^|\s)\d+[\).]\s+", line)
        candidates = numbered_parts if len(numbered_parts) > 1 else [line]
        for candidate in candidates:
            for part in re.split(r"\s*;\s*", candidate.strip()):
                normalized = normalize_line(part)
                if normalized:
                    entries.append(normalized)
    return entries


def extract_follow_up_instructions(raw_text: str) -> str:
    explicit_follow_up_match = re.search(
        r"(?ims)^(?:follow[- ]?up(?: instructions?)?)\s*:?\s*(.+?)(?=\n(?:ASSESSMENT|PLAN|DIAGNOSIS|DIAGNOSES|ALLERGIES|LABORATORY RESULTS?|CLINICAL NOTES?)\s*:|\Z)",
        raw_text,
    )
    if explicit_follow_up_match:
        return explicit_follow_up_match.group(1).strip()

    candidate_sections = [
        extract_section(
            raw_text,
            r"prescriptions?",
            ["ASSESSMENT", "PLAN", "DIAGNOSIS", "DIAGNOSES", "ALLERGIES", "LABORATORY RESULTS?", "CLINICAL NOTES?"],
        ),
        extract_section(
            raw_text,
            r"treatment plan",
            ["PHYSICIAN NOTES?", "ASSESSMENT", "DIAGNOSIS", "DIAGNOSES", "ALLERGIES", "LABORATORY RESULTS?", "CLINICAL NOTES?"],
        ),
        extract_section(
            raw_text,
            r"plan",
            ["ELECTRONICALLY SIGNED BY", "SIGNED BY", "DR\\.", "PHYSICIAN", "CLINICAL NOTES?"],
        ),
    ]

    follow_up_lines: list[str] = []
    for section in candidate_sections:
        if not section:
            continue
        for entry in split_medication_entries(section):
            if re.match(r"(?i)^(?:follow[- ]?up|return|recheck|repeat|reassess|review)\b", entry):
                follow_up_lines.append(entry.rstrip("."))

    if follow_up_lines:
        return "\n".join(non_empty_unique(follow_up_lines))

    global_matches = re.findall(
        r"(?im)\b((?:follow[- ]?up|return|recheck|repeat|reassess|review)\b[^.\n]*)",
        raw_text,
    )
    cleaned_matches = [match.strip().rstrip(".") for match in global_matches if match.strip()]
    return "\n".join(non_empty_unique(cleaned_matches))


def extract_medications(raw_text: str) -> list[Medication]:
    section = extract_section(
        raw_text,
        r"(?:current )?medications?",
        ["ALLERGIES", "DIAGNOSES?", "ASSESSMENT", "PLAN", "LABORATORY RESULTS?", "PHYSICAL EXAMINATION", "CLINICAL NOTES?"],
    )
    if not section:
        section = extract_section(
            raw_text,
            r"prescriptions?",
            ["FOLLOW[- ]?UP", "ASSESSMENT", "PLAN", "DIAGNOSIS", "DIAGNOSES", "ALLERGIES", "LABORATORY RESULTS?", "CLINICAL NOTES?"],
        )
    if not section:
        section = extract_section(
            raw_text,
            r"treatment plan",
            ["PHYSICIAN NOTES?", "FOLLOW[- ]?UP", "ASSESSMENT", "DIAGNOSIS", "DIAGNOSES", "ALLERGIES", "LABORATORY RESULTS?", "CLINICAL NOTES?"],
        )
    results: list[Medication] = []
    for entry in split_medication_entries(section):
        if not entry:
            continue
        entry = re.sub(r"(?i)^prescribed\s+", "", entry).strip()
        match = re.match(
            r"(?P<name>[A-Za-z][A-Za-z0-9 /\\-]+?)\s+(?P<dosage>\d+(?:\.\d+)?\s?(?:mg|mcg|g|units|mL|%))\s+(?P<frequency>.+)",
            entry,
        )
        if match:
            results.append(
                Medication(
                    name=match.group("name").strip(),
                    dosage=match.group("dosage").strip(),
                    frequency=match.group("frequency").strip(),
                    route=infer_route(match.group("frequency")),
                    confidence=0.88,
                )
            )
            continue

        prescribed_match = re.match(r"(?i)prescribed\s+(.+)$", entry)
        if prescribed_match:
            results.append(
                Medication(
                    name=prescribed_match.group(1).strip().rstrip("."),
                    dosage="Not specified",
                    frequency="As directed",
                    route="Unspecified",
                    confidence=0.72,
                )
            )
    return results


def infer_route(frequency: str) -> str:
    lower = frequency.lower()
    if "inhal" in lower:
        return "Inhalation"
    if "iv" in lower or "intraven" in lower:
        return "IV"
    if "topical" in lower:
        return "Topical"
    return "Oral"


def extract_diagnoses(raw_text: str) -> list[Diagnosis]:
    section = extract_section(
        raw_text,
        r"diagnoses?",
        ["ASSESSMENT", "PLAN", "TREATMENT PLAN", "MEDICATIONS?", "ALLERGIES", "LABORATORY RESULTS?", "CLINICAL NOTES?", "TESTS CONDUCTED"],
    )
    results: list[Diagnosis] = []
    if not section:
        single_match = re.search(r"(?im)^diagnosis\s*:\s*(.+)$", raw_text)
        if single_match:
            description = single_match.group(1).strip()
            return [
                Diagnosis(
                    code="Uncoded",
                    description=description,
                    type="primary",
                    confidence=0.86,
                )
            ]

    for index, line in enumerate(section.splitlines()):
        entry = normalize_line(line)
        match = re.match(r"(?P<code>[A-Z]\d[\w.]*)\s*[-:]\s*(?P<description>.+)", entry)
        if match:
            results.append(
                Diagnosis(
                    code=match.group("code").strip(),
                    description=match.group("description").strip(),
                    type="primary" if index == 0 else "secondary",
                    confidence=0.9,
                )
            )
            continue
        if entry:
            results.append(
                Diagnosis(
                    code="Uncoded",
                    description=entry.rstrip("."),
                    type="primary" if index == 0 else "secondary",
                    confidence=0.78,
                )
            )
    return results


def extract_allergies(raw_text: str) -> list[Allergy]:
    section = extract_section(
        raw_text,
        r"allergies?",
        ["CURRENT MEDICATIONS?", "MEDICATIONS?", "DIAGNOSES?", "ASSESSMENT", "PLAN", "LABORATORY RESULTS?", "CLINICAL NOTES?"],
    )
    results: list[Allergy] = []
    for line in section.splitlines():
        entry = normalize_line(line)
        match = re.match(r"(?P<allergen>[^()]+?)(?:\((?P<reaction>.+)\))?$", entry)
        if not match:
            continue
        reaction = (match.group("reaction") or "Reaction not specified").strip()
        results.append(
            Allergy(
                allergen=match.group("allergen").strip(),
                reaction=reaction,
                severity=infer_severity(reaction),
                confidence=0.92,
            )
        )
    return results


def infer_severity(reaction: str) -> Severity:
    lower = reaction.lower()
    if any(term in lower for term in ("anaphylaxis", "severe", "airway", "critical")):
        return "severe"
    if any(term in lower for term in ("hives", "rash", "dizziness", "swelling")):
        return "moderate"
    return "mild"


def extract_lab_results(raw_text: str) -> list[LabResult]:
    pattern = re.compile(
        r"(?im)^(?P<test>[A-Za-z0-9 /()%-]+):\s*(?P<value>[<>]?\d+(?:\.\d+)?)\s*(?P<unit>[A-Za-z/%]+)?\s*(?:\(Reference:\s*(?P<reference>[^)]+)\))?\s*(?P<flag>HIGH|LOW|CRITICAL)?$"
    )
    results: list[LabResult] = []
    for match in pattern.finditer(raw_text):
        test = match.group("test").strip()
        if test.lower() in {
            "patient",
            "patient name",
            "mrn",
            "patient id",
            "dob",
            "date",
            "date of birth",
            "collection date",
            "date of visit",
            "age",
            "gender",
        }:
            continue
        results.append(
            LabResult(
                test=test,
                value=match.group("value").strip(),
                unit=(match.group("unit") or "").strip(),
                referenceRange=(match.group("reference") or "Not provided").strip(),
                flag=(match.group("flag") or "").lower() or None,
                confidence=0.9,
            )
        )

    if not results:
        tests_section = extract_section(
            raw_text,
            r"tests conducted",
            ["TREATMENT PLAN", "PLAN", "PHYSICIAN NOTES?", "FOLLOW[- ]?UP", "ASSESSMENT"],
        )
        for line in tests_section.splitlines():
            entry = normalize_line(line)
            if not entry or ":" not in entry:
                continue
            test, value = entry.split(":", 1)
            results.append(
                LabResult(
                    test=test.strip(),
                    value=value.strip().rstrip("."),
                    unit="",
                    referenceRange="Not provided",
                    confidence=0.75,
                )
            )
    return results


def build_summary(raw_text: str) -> ClinicalSummary:
    plan = extract_section(
        raw_text,
        r"(?:treatment\s+plan|plan)",
        ["ELECTRONICALLY SIGNED BY", "SIGNED BY", "DR\\.", "PHYSICIAN", "CLINICAL NOTES?"],
    )
    if not plan:
        plan = extract_follow_up_instructions(raw_text)

    return ClinicalSummary(
        chiefComplaint=extract_section(
            raw_text,
            r"chief complaint",
            ["SYMPTOMS", "HISTORY OF PRESENT ILLNESS", "HISTORY", "ALLERGIES", "MEDICATIONS?", "ASSESSMENT"],
        )
        or "No chief complaint extracted.",
        historyOfPresentIllness=extract_section(
            raw_text,
            r"(?:history of present illness|history|symptoms)",
            ["ALLERGIES", "MEDICATIONS?", "DIAGNOSIS", "DIAGNOSES", "ASSESSMENT", "PLAN", "TREATMENT PLAN", "LABORATORY RESULTS?"],
        )
        or "No history of present illness extracted.",
        assessment=extract_section(
            raw_text,
            r"(?:assessment(?: and plan)?|diagnosis)",
            ["PLAN", "TREATMENT PLAN", "ELECTRONICALLY SIGNED BY", "CLINICAL NOTES?", "TESTS CONDUCTED"],
        )
        or "No assessment extracted.",
        plan=plan or "No treatment plan extracted.",
    )


def maybe_extract_with_model(
    raw_text: str,
    patient_name: str,
    patient_id: str,
    medications: list[Medication],
    diagnoses: list[Diagnosis],
    allergies: list[Allergy],
    lab_results: list[LabResult],
    summary: ClinicalSummary,
) -> ModelExtraction | None:
    if not generation_backend_enabled():
        return None

    needs_fallback = any(
        [
            patient_name == "Unknown Patient",
            patient_id == "Unknown MRN",
            not medications,
            not diagnoses,
            summary.chiefComplaint == "No chief complaint extracted.",
        ]
    )
    if not needs_fallback:
        return None

    prompt = (
        "Extract structured clinical details from the document below and return only valid JSON. "
        "Do not include markdown fences or explanation. "
        "Use this schema exactly: "
        '{"patientName":"","patientId":"","chiefComplaint":"","historyOfPresentIllness":"","assessment":"","plan":"","medications":[{"name":"","dosage":"","frequency":"","route":""}],"diagnoses":[{"code":"","description":"","type":"primary"}],"allergies":[{"allergen":"","reaction":"","severity":"mild"}],"labResults":[{"test":"","value":"","unit":"","referenceRange":"","flag":null}]}. '
        "If a field is missing, use an empty string or an empty array. "
        f"\n\nDocument:\n{raw_text[:6000]}"
    )

    try:
        response = generate_with_model(
            system_prompt=(
                "You are an information extraction assistant for medical documents. "
                "Return only JSON that matches the requested schema."
            ),
            user_prompt=prompt,
        )
        return parse_model_extraction(response)
    except Exception:
        return None


def parse_model_extraction(response: str) -> ModelExtraction | None:
    cleaned = response.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    json_text = cleaned[start : end + 1]
    try:
        payload = json.loads(json_text)
        return ModelExtraction(**payload)
    except Exception:
        return None


def parse_json_object(response: str) -> dict | None:
    cleaned = response.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(cleaned[start : end + 1])
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def persist_agent_run(
    user_id: str,
    instruction: str,
    documents: list[DocumentContext],
    response: AgentResponse,
) -> None:
    agent_runs_table.insert(
        {
            "id": str(uuid4()),
            "user_id": user_id,
            "createdAt": datetime.utcnow().isoformat(),
            "instruction": instruction,
            "intent": response.intent,
            "rationale": response.rationale,
            "documentIds": [doc.id for doc in documents],
            "documentNames": [doc.fileName for doc in documents],
            "tools": response.tools,
            "toolResults": [item.model_dump() for item in response.toolResults],
            "finalOutput": response.finalOutput,
            "model": response.model,
        }
    )


def set_job_status(job_id: str, status: JobStatus) -> None:
    Job = Query()
    automation_jobs_table.update(
        {
            "status": status,
            "updatedAt": datetime.utcnow().isoformat(),
        },
        Job.id == job_id,
    )


def set_job_step(job_id: str, step_name: str, status: JobStatus, detail: str) -> None:
    Job = Query()
    job = automation_jobs_table.get(Job.id == job_id)
    if not job:
        return
    updated_steps = []
    for step in job["steps"]:
        if step["name"] == step_name:
            updated_steps.append({"name": step_name, "status": status, "detail": detail})
        else:
            updated_steps.append(step)
    automation_jobs_table.update(
        {
            "steps": updated_steps,
            "updatedAt": datetime.utcnow().isoformat(),
        },
        Job.id == job_id,
    )


def finalize_job(job_id: str, status: JobStatus, final_output: str | None, error_message: str | None) -> None:
    Job = Query()
    automation_jobs_table.update(
        {
            "status": status,
            "updatedAt": datetime.utcnow().isoformat(),
            "finalOutput": final_output,
            "error": error_message,
        },
        Job.id == job_id,
    )


def strip_user_fields(record: dict) -> dict:
    return {key: value for key, value in record.items() if key not in {"user_id", "config"}}


def merge_patient_name(current: str, extracted: ModelExtraction | None) -> str:
    if current != "Unknown Patient" or not extracted or not extracted.patientName:
        return current
    return extracted.patientName.strip() or current


def merge_patient_id(current: str, extracted: ModelExtraction | None) -> str:
    if current != "Unknown MRN" or not extracted or not extracted.patientId:
        return current
    return extracted.patientId.strip() or current


def merge_medications(current: list[Medication], extracted: ModelExtraction | None) -> list[Medication]:
    if current or not extracted:
        return current
    return [
        Medication(
            name=item.name.strip(),
            dosage=item.dosage.strip() or "Not specified",
            frequency=item.frequency.strip() or "Not specified",
            route=item.route.strip() or "Unspecified",
            confidence=0.7,
        )
        for item in extracted.medications
        if item.name.strip()
    ]


def merge_diagnoses(current: list[Diagnosis], extracted: ModelExtraction | None) -> list[Diagnosis]:
    if current or not extracted:
        return current
    return [
        Diagnosis(
            code=item.code.strip() or "Uncoded",
            description=item.description.strip(),
            type=item.type,
            confidence=0.72,
        )
        for item in extracted.diagnoses
        if item.description.strip()
    ]


def merge_allergies(current: list[Allergy], extracted: ModelExtraction | None) -> list[Allergy]:
    if current or not extracted:
        return current
    return [
        Allergy(
            allergen=item.allergen.strip(),
            reaction=item.reaction.strip() or "Reaction not specified",
            severity=item.severity,
            confidence=0.68,
        )
        for item in extracted.allergies
        if item.allergen.strip()
    ]


def merge_lab_results(current: list[LabResult], extracted: ModelExtraction | None) -> list[LabResult]:
    if current or not extracted:
        return current
    return [
        LabResult(
            test=item.test.strip(),
            value=item.value.strip(),
            unit=item.unit.strip(),
            referenceRange=item.referenceRange.strip() or "Not provided",
            flag=item.flag,
            confidence=0.68,
        )
        for item in extracted.labResults
        if item.test.strip() and item.value.strip()
    ]


def merge_summary(current: ClinicalSummary, extracted: ModelExtraction | None) -> ClinicalSummary:
    if not extracted:
        return current
    return ClinicalSummary(
        chiefComplaint=pick_better_summary_value(current.chiefComplaint, extracted.chiefComplaint),
        historyOfPresentIllness=pick_better_summary_value(
            current.historyOfPresentIllness, extracted.historyOfPresentIllness
        ),
        assessment=pick_better_summary_value(current.assessment, extracted.assessment),
        plan=pick_better_summary_value(current.plan, extracted.plan),
    )


def pick_better_summary_value(current: str, candidate: str | None) -> str:
    if not candidate or not candidate.strip():
        return current
    if current.startswith("No "):
        return candidate.strip()
    return current


def compute_confidence(
    raw_text: str,
    medications: list[Medication],
    diagnoses: list[Diagnosis],
    allergies: list[Allergy],
    lab_results: list[LabResult],
) -> float:
    confidence = 0.7
    if medications:
        confidence += 0.05
    if diagnoses:
        confidence += 0.05
    if allergies:
        confidence += 0.05
    if lab_results:
        confidence += 0.05
    if len(raw_text) > 500:
        confidence += 0.05
    return min(round(confidence, 2), 0.98)


def build_documents_prompt(documents: list[DocumentContext]) -> str:
    chunks: list[str] = []
    for index, document in enumerate(documents, start=1):
        chunks.append(
            (
                f"Document {index}: {document.fileName}\n"
                f"Patient: {document.patientName}\n"
                f"MRN: {document.patientId}\n"
                f"Type: {document.documentType}\n"
                f"Summary:\n"
                f"- Chief complaint: {document.summary.chiefComplaint}\n"
                f"- HPI: {document.summary.historyOfPresentIllness}\n"
                f"- Assessment: {document.summary.assessment}\n"
                f"- Plan: {document.summary.plan}\n\n"
                f"Raw text:\n{document.rawText}"
            )
        )
    return "\n\n---\n\n".join(chunks)


def get_stored_document(document: DocumentContext) -> dict:
    stored = documents_table.get(Query().id == document.id)
    return stored or {
        "medications": [],
        "diagnoses": [],
        "allergies": [],
        "labResults": [],
    }


def non_empty_unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    cleaned_values: list[str] = []
    for value in values:
        cleaned = value.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        cleaned_values.append(cleaned)
    return cleaned_values


def format_bullets(items: list[str], empty_message: str) -> str:
    values = non_empty_unique(items)
    if not values:
        return f"- {empty_message}"
    return "\n".join(f"- {item}" for item in values)


def format_document_reference(document: DocumentContext) -> str:
    return f"{document.fileName} ({document.patientName}, MRN {document.patientId})"


def collect_medication_lines(documents: list[DocumentContext]) -> list[str]:
    lines: list[str] = []
    for document in documents:
        stored = get_stored_document(document)
        for medication in stored.get("medications", []):
            name = medication.get("name", "Unspecified medication")
            dosage = medication.get("dosage", "Not specified")
            frequency = medication.get("frequency", "Not specified")
            route = medication.get("route", "Unspecified")
            lines.append(f"{format_document_reference(document)}: {name}, {dosage}, {frequency}, route {route}.")
    return lines


def collect_diagnosis_lines(documents: list[DocumentContext]) -> list[str]:
    lines: list[str] = []
    for document in documents:
        stored = get_stored_document(document)
        for diagnosis in stored.get("diagnoses", []):
            code = diagnosis.get("code", "Uncoded")
            description = diagnosis.get("description", "No description provided")
            lines.append(f"{format_document_reference(document)}: {code} - {description}.")
    return lines


def collect_allergy_lines(documents: list[DocumentContext]) -> list[str]:
    lines: list[str] = []
    for document in documents:
        stored = get_stored_document(document)
        for allergy in stored.get("allergies", []):
            allergen = allergy.get("allergen", "Unknown allergen")
            reaction = allergy.get("reaction", "Reaction not specified")
            severity = allergy.get("severity", "mild")
            lines.append(f"{format_document_reference(document)}: {allergen} ({reaction}, severity {severity}).")
    return lines


def collect_lab_lines(documents: list[DocumentContext]) -> list[str]:
    lines: list[str] = []
    for document in documents:
        stored = get_stored_document(document)
        for lab_result in stored.get("labResults", []):
            test = lab_result.get("test", "Unnamed test")
            value = lab_result.get("value", "Not provided")
            unit = lab_result.get("unit", "").strip()
            reference = lab_result.get("referenceRange", "Not provided")
            flag = lab_result.get("flag")
            unit_suffix = f" {unit}" if unit else ""
            flag_suffix = f" [{flag}]" if flag else ""
            lines.append(
                f"{format_document_reference(document)}: {test} {value}{unit_suffix} "
                f"(reference {reference}){flag_suffix}."
            )
    return lines


def build_report_fallback(documents: list[DocumentContext]) -> str:
    patient_names = ", ".join(non_empty_unique([document.patientName for document in documents])) or "Unknown patient"
    overview_lines = [
        f"Reviewed {len(documents)} document(s) for {patient_names}.",
        *[
            f"{format_document_reference(document)}: {document.summary.assessment}"
            for document in documents
            if document.summary.assessment and not document.summary.assessment.startswith("No ")
        ],
    ]
    key_finding_lines = [
        *[
            f"{format_document_reference(document)} chief complaint: {document.summary.chiefComplaint}"
            for document in documents
            if document.summary.chiefComplaint and not document.summary.chiefComplaint.startswith("No ")
        ],
        *[
            f"{format_document_reference(document)} history: {document.summary.historyOfPresentIllness}"
            for document in documents
            if document.summary.historyOfPresentIllness and not document.summary.historyOfPresentIllness.startswith("No ")
        ],
    ]
    follow_up_lines = [
        *[
            f"{format_document_reference(document)} plan: {document.summary.plan}"
            for document in documents
            if document.summary.plan and not document.summary.plan.startswith("No ")
        ],
        *[
            f"{format_document_reference(document)}: flagged laboratory result present."
            for document in documents
            if any(result.get("flag") for result in get_stored_document(document).get("labResults", []))
        ],
    ]
    return (
        "Overview\n"
        f"{format_bullets(overview_lines, 'No overview available.')}\n\n"
        "Key Findings\n"
        f"{format_bullets(key_finding_lines, 'No key findings documented.')}\n\n"
        "Medications\n"
        f"{format_bullets(collect_medication_lines(documents), 'No medications documented.')}\n\n"
        "Diagnoses\n"
        f"{format_bullets(collect_diagnosis_lines(documents), 'No diagnoses documented.')}\n\n"
        "Labs\n"
        f"{format_bullets(collect_lab_lines(documents), 'No laboratory results documented.')}\n\n"
        "Risks or Follow-up\n"
        f"{format_bullets(follow_up_lines, 'No explicit follow-up or risk statements documented.')}"
    )


def build_chat_answer_fallback(documents: list[DocumentContext], question: str) -> str:
    text = question.lower()
    if any(keyword in text for keyword in ("medication", "medications", "drug", "drugs")):
        return "Documented medications:\n" + format_bullets(
            collect_medication_lines(documents),
            "No medications documented in the selected files.",
        )
    if any(keyword in text for keyword in ("diagnosis", "diagnoses", "condition", "conditions")):
        return "Documented diagnoses:\n" + format_bullets(
            collect_diagnosis_lines(documents),
            "No diagnoses documented in the selected files.",
        )
    if "allerg" in text:
        return "Documented allergies:\n" + format_bullets(
            collect_allergy_lines(documents),
            "No allergies documented in the selected files.",
        )
    if any(keyword in text for keyword in ("lab", "labs", "result", "results", "wbc", "hemoglobin")):
        return "Documented lab results:\n" + format_bullets(
            collect_lab_lines(documents),
            "No lab results documented in the selected files.",
        )
    if any(keyword in text for keyword in ("plan", "follow-up", "follow up", "next step", "next steps")):
        return "Documented plans and follow-up:\n" + format_bullets(
            [
                f"{format_document_reference(document)}: {document.summary.plan}"
                for document in documents
                if document.summary.plan and not document.summary.plan.startswith("No ")
            ],
            "No follow-up plan documented in the selected files.",
        )
    if any(keyword in text for keyword in ("summary", "overview", "assessment", "chief complaint")):
        return build_summary_fallback(documents, question)

    return (
        "I answered from the structured data and summaries available in the selected documents.\n\n"
        + build_summary_fallback(documents, question)
    )


def build_summary_fallback(documents: list[DocumentContext], instruction: str) -> str:
    overview_lines = [
        f"Instruction focus: {instruction.strip()}",
        *[
            f"{format_document_reference(document)}: {document.summary.assessment}"
            for document in documents
            if document.summary.assessment and not document.summary.assessment.startswith("No ")
        ],
        *[
            f"{format_document_reference(document)} plan: {document.summary.plan}"
            for document in documents
            if document.summary.plan and not document.summary.plan.startswith("No ")
        ],
    ]
    supporting_data = collect_lab_lines(documents)[:4] + collect_medication_lines(documents)[:4]
    return (
        "Clinical summary\n"
        f"{format_bullets(overview_lines, 'No summary details documented.')}\n\n"
        "Supporting data\n"
        f"{format_bullets(supporting_data, 'No supporting structured data documented.')}"
    )


def build_note_fallback(documents: list[DocumentContext], instruction: str) -> str:
    document = documents[0]
    subjective_lines = [
        f"Chief complaint: {document.summary.chiefComplaint}",
        f"HPI: {document.summary.historyOfPresentIllness}",
    ]
    objective_lines = collect_diagnosis_lines(documents)[:4] + collect_lab_lines(documents)[:4]
    plan_lines = [
        f"Assessment: {document.summary.assessment}",
        f"Plan: {document.summary.plan}",
    ] + collect_medication_lines(documents)[:4]
    return (
        f"Requested instruction: {instruction}\n\n"
        "Subjective\n"
        f"{format_bullets(subjective_lines, 'No subjective information documented.')}\n\n"
        "Objective\n"
        f"{format_bullets(objective_lines, 'No objective findings documented.')}\n\n"
        "Assessment and Plan\n"
        f"{format_bullets(plan_lines, 'No assessment or plan documented.')}"
    )


def build_extraction_answer_fallback(documents: list[DocumentContext], instruction: str) -> str:
    return build_chat_answer_fallback(documents, instruction)


def synthesize_agent_response_fallback(
    intent: AgentIntent,
    instruction: str,
    tool_results: list[AgentToolResult],
) -> str:
    preferred_tool = {
        "summarization": "summarizer",
        "data_extraction": "answer_formatter",
        "note_generation": "note_generator",
    }[intent]
    preferred_result = next((item for item in tool_results if item.tool == preferred_tool), None)
    if preferred_result:
        return preferred_result.content

    parts = [f"Instruction: {instruction}"]
    for item in tool_results:
        parts.append(f"{item.summary}\n{item.content}")
    return "\n\n".join(parts)


def get_model_components():
    global _tokenizer, _model
    if _tokenizer is not None and _model is not None:
        return _tokenizer, _model

    device = resolve_device()
    torch_dtype = torch.float16 if device == "cuda" else torch.float32
    try:
        tokenizer = AutoTokenizer.from_pretrained(HF_MODEL_ID, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            HF_MODEL_ID,
            dtype=torch_dtype,
            trust_remote_code=True,
        )

        if tokenizer.pad_token_id is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = model.to(device)

        model.eval()
        _tokenizer = tokenizer
        _model = model
        return _tokenizer, _model
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=503,
            detail=(
                f"Could not load the Hugging Face model '{HF_MODEL_ID}'. Install backend requirements and "
                "make sure the model download can complete."
            ),
        ) from exc


def remote_inference_endpoint() -> str:
    base_url = REMOTE_INFERENCE_URL.rstrip("/")
    return base_url if base_url.endswith("/generate") else f"{base_url}/generate"


def generate_with_remote_model(system_prompt: str, user_prompt: str) -> str:
    payload = json.dumps(
        {
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "max_new_tokens": 256,
            "temperature": 0.2,
            "top_p": 0.9,
        }
    ).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if REMOTE_INFERENCE_TOKEN:
        headers["Authorization"] = f"Bearer {REMOTE_INFERENCE_TOKEN}"

    request = urllib_request.Request(
        remote_inference_endpoint(),
        data=payload,
        headers=headers,
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=REMOTE_INFERENCE_TIMEOUT_SECONDS) as response:
            response_body = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore").strip()
        detail_message = details or f"Remote inference returned HTTP {exc.code}."
        raise HTTPException(status_code=502, detail=detail_message) from exc
    except urllib_error.URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach the remote inference worker at {remote_inference_endpoint()}: {exc.reason}",
        ) from exc

    try:
        parsed = json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Remote inference returned invalid JSON.") from exc

    content = str(parsed.get("content", "")).strip()
    if not content:
        raise HTTPException(status_code=502, detail="Remote inference returned an empty response.")
    return content


def generate_with_local_model(system_prompt: str, user_prompt: str) -> str:
    tokenizer, model = get_model_components()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=1536,
        )
        device = next(model.parameters()).device
        inputs = {key: value.to(device) for key, value in inputs.items()}

        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=256,
                do_sample=True,
                temperature=0.2,
                top_p=0.9,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail=f"The Hugging Face analysis request failed: {exc}",
        ) from exc

    generated_tokens = output_ids[0][inputs["input_ids"].shape[1]:]
    content = tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
    if not content:
        raise HTTPException(status_code=502, detail="The Hugging Face model returned an empty response.")
    return content


def generate_with_model(system_prompt: str, user_prompt: str) -> str:
    if polling_inference_enabled():
        return generate_with_polling_worker(system_prompt, user_prompt)
    if remote_inference_enabled():
        try:
            return generate_with_remote_model(system_prompt, user_prompt)
        except HTTPException:
            if not model_generation_enabled():
                raise
    return generate_with_local_model(system_prompt, user_prompt)


def resolve_device() -> str:
    if HF_DEVICE in {"cpu", "cuda", "mps"}:
        return HF_DEVICE
    if torch.cuda.is_available():
        return "cuda"
    if platform.system() == "Darwin":
        return "cpu"
    return "cpu"


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    ).hex()


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    return secrets.compare_digest(hash_password(password, salt), expected_hash)


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    sessions_table.insert(
        {
            "token": token,
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
        }
    )
    return token


def parse_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token.")
    return authorization.split(" ", 1)[1].strip()


def require_user(authorization: str | None) -> dict:
    token = parse_bearer_token(authorization)
    session = sessions_table.get(Query().token == token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    user = users_table.get(Query().id == session["user_id"])
    if not user:
        sessions_table.remove(Query().token == token)
        raise HTTPException(status_code=401, detail="Session user was not found.")
    return user


def serialize_user(user: dict) -> UserResponse:
    return UserResponse(id=user["id"], name=user["name"], email=user["email"])
