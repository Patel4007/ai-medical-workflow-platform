from __future__ import annotations

from fastapi import BackgroundTasks, FastAPI, File, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

try:
    from backend.schemas import (
        AgentRequest,
        AgentResponse,
        AgentRunsResponse,
        AnalysisResponse,
        AuthResponse,
        AutomationJobRecord,
        AutomationJobsResponse,
        AutomationJobRequest,
        ChatRequest,
        ConnectorConfigRequest,
        ConnectorRecord,
        ConnectorAuthorizeResponse,
        ConnectorsResponse,
        ConnectorSyncResponse,
        LoginRequest,
        ReportRequest,
        UploadResponse,
        UserRequest,
        UserResponse,
        WorkerErrorRequest,
        WorkerJobResponse,
        WorkerResultRequest,
    )
    from backend.services import (
        chat_about_documents as chat_about_documents_service,
        build_connector_callback_html as build_connector_callback_html_service,
        complete_connector_authorization as complete_connector_authorization_service,
        configure_connector as configure_connector_service,
        create_automation_job as create_automation_job_service,
        current_user as current_user_service,
        delete_document as delete_document_service,
        generate_report as generate_report_service,
        healthcheck as healthcheck_service,
        list_agent_runs as list_agent_runs_service,
        list_automation_jobs as list_automation_jobs_service,
        list_connectors as list_connectors_service,
        list_documents as list_documents_service,
        login as login_service,
        logout as logout_service,
        get_next_inference_job as get_next_inference_job_service,
        run_workflow_agent as run_workflow_agent_service,
        start_connector_authorization as start_connector_authorization_service,
        signup as signup_service,
        submit_inference_error as submit_inference_error_service,
        submit_inference_result as submit_inference_result_service,
        sync_connector as sync_connector_service,
        upload_documents as upload_documents_service,
    )
except ModuleNotFoundError as exc:
    if exc.name != "backend":
        raise
    from schemas import (
        AgentRequest,
        AgentResponse,
        AgentRunsResponse,
        AnalysisResponse,
        AuthResponse,
        AutomationJobRecord,
        AutomationJobsResponse,
        AutomationJobRequest,
        ChatRequest,
        ConnectorConfigRequest,
        ConnectorRecord,
        ConnectorAuthorizeResponse,
        ConnectorsResponse,
        ConnectorSyncResponse,
        LoginRequest,
        ReportRequest,
        UploadResponse,
        UserRequest,
        UserResponse,
        WorkerErrorRequest,
        WorkerJobResponse,
        WorkerResultRequest,
    )
    from services import (
        chat_about_documents as chat_about_documents_service,
        build_connector_callback_html as build_connector_callback_html_service,
        complete_connector_authorization as complete_connector_authorization_service,
        configure_connector as configure_connector_service,
        create_automation_job as create_automation_job_service,
        current_user as current_user_service,
        delete_document as delete_document_service,
        generate_report as generate_report_service,
        healthcheck as healthcheck_service,
        list_agent_runs as list_agent_runs_service,
        list_automation_jobs as list_automation_jobs_service,
        list_connectors as list_connectors_service,
        list_documents as list_documents_service,
        login as login_service,
        logout as logout_service,
        get_next_inference_job as get_next_inference_job_service,
        run_workflow_agent as run_workflow_agent_service,
        start_connector_authorization as start_connector_authorization_service,
        signup as signup_service,
        submit_inference_error as submit_inference_error_service,
        submit_inference_result as submit_inference_result_service,
        sync_connector as sync_connector_service,
        upload_documents as upload_documents_service,
    )


app = FastAPI(title="AI Medical Document Dashboard API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return healthcheck_service()


@app.get("/get_job", response_model=WorkerJobResponse)
@app.get("/worker/get_job", response_model=WorkerJobResponse)
def get_job(authorization: str | None = Header(default=None)) -> WorkerJobResponse:
    return get_next_inference_job_service(authorization)


@app.post("/submit_result")
@app.post("/worker/submit_result")
def submit_result(payload: WorkerResultRequest, authorization: str | None = Header(default=None)) -> dict[str, str]:
    return submit_inference_result_service(payload, authorization)


@app.post("/submit_error")
@app.post("/worker/submit_error")
def submit_error(payload: WorkerErrorRequest, authorization: str | None = Header(default=None)) -> dict[str, str]:
    return submit_inference_error_service(payload, authorization)


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(payload: UserRequest) -> AuthResponse:
    return signup_service(payload)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    return login_service(payload)


@app.get("/api/auth/me", response_model=UserResponse)
def current_user(authorization: str | None = Header(default=None)) -> UserResponse:
    return current_user_service(authorization)


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    return logout_service(authorization)


@app.get("/api/documents", response_model=UploadResponse)
def list_documents(authorization: str | None = Header(default=None)) -> UploadResponse:
    return list_documents_service(authorization)


@app.post("/api/documents/upload", response_model=UploadResponse)
async def upload_documents(
    files: list[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
) -> UploadResponse:
    return await upload_documents_service(files, authorization)


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str, authorization: str | None = Header(default=None)) -> dict[str, str]:
    return delete_document_service(document_id, authorization)


@app.post("/api/analysis/report", response_model=AnalysisResponse)
def generate_report(payload: ReportRequest, authorization: str | None = Header(default=None)) -> AnalysisResponse:
    return generate_report_service(payload, authorization)


@app.post("/api/analysis/chat", response_model=AnalysisResponse)
def chat_about_documents(payload: ChatRequest, authorization: str | None = Header(default=None)) -> AnalysisResponse:
    return chat_about_documents_service(payload, authorization)


@app.post("/api/agent/run", response_model=AgentResponse)
def run_workflow_agent(payload: AgentRequest, authorization: str | None = Header(default=None)) -> AgentResponse:
    return run_workflow_agent_service(payload, authorization)


@app.get("/api/agent/runs", response_model=AgentRunsResponse)
def list_agent_runs(authorization: str | None = Header(default=None)) -> AgentRunsResponse:
    return list_agent_runs_service(authorization)


@app.post("/api/agent/jobs", response_model=AutomationJobRecord)
def create_automation_job(
    payload: AutomationJobRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> AutomationJobRecord:
    return create_automation_job_service(payload, background_tasks, authorization)


@app.get("/api/agent/jobs", response_model=AutomationJobsResponse)
def list_automation_jobs(authorization: str | None = Header(default=None)) -> AutomationJobsResponse:
    return list_automation_jobs_service(authorization)


@app.get("/api/connectors", response_model=ConnectorsResponse)
def list_connectors(authorization: str | None = Header(default=None)) -> ConnectorsResponse:
    return list_connectors_service(authorization)


@app.get("/api/connectors/{connector_key}/authorize", response_model=ConnectorAuthorizeResponse)
def authorize_connector(
    connector_key: str,
    authorization: str | None = Header(default=None),
) -> ConnectorAuthorizeResponse:
    return start_connector_authorization_service(connector_key, authorization)


@app.post("/api/connectors/{connector_key}/sync", response_model=ConnectorSyncResponse)
def sync_connector(connector_key: str, authorization: str | None = Header(default=None)) -> ConnectorSyncResponse:
    return sync_connector_service(connector_key, authorization)


@app.get("/api/connectors/callback", response_class=HTMLResponse)
def connector_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
) -> HTMLResponse:
    if error:
        description = error_description or error
        return HTMLResponse(
            build_connector_callback_html_service(
                "Connector authorization failed",
                f"SMART on FHIR authorization did not complete: {description}. Return to the dashboard and retry.",
                False,
            ),
            status_code=400,
        )
    if not code or not state:
        return HTMLResponse(
            build_connector_callback_html_service(
                "Connector authorization incomplete",
                "The callback did not include the required SMART authorization code and state values.",
                False,
            ),
            status_code=400,
        )

    try:
        connector, imported_document = complete_connector_authorization_service(code, state)
        return HTMLResponse(
            build_connector_callback_html_service(
                "Connector authorized",
                (
                    f"{connector.label} synced patient {imported_document.patientName} "
                    f"and imported {imported_document.fileName}."
                ),
                True,
            )
        )
    except Exception as exc:
        status_code = getattr(exc, "status_code", 500)
        detail = getattr(exc, "detail", "SMART on FHIR authorization failed.")
        return HTMLResponse(
            build_connector_callback_html_service(
                "Connector authorization failed",
                str(detail),
                False,
            ),
            status_code=status_code,
        )


@app.post("/api/connectors", response_model=ConnectorRecord)
def configure_connector(
    payload: ConnectorConfigRequest,
    authorization: str | None = Header(default=None),
) -> ConnectorRecord:
    return configure_connector_service(payload, authorization)
