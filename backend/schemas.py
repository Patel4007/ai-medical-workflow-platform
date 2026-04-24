from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


DocumentType = Literal[
    "lab-report",
    "discharge-summary",
    "clinical-note",
    "radiology",
    "other",
]
Severity = Literal["mild", "moderate", "severe"]
DiagnosisType = Literal["primary", "secondary"]
DocumentStatus = Literal["processing", "completed", "error"]
LabFlag = Literal["high", "low", "critical"]


class Medication(BaseModel):
    name: str
    dosage: str
    frequency: str
    route: str
    confidence: float


class Diagnosis(BaseModel):
    code: str
    description: str
    type: DiagnosisType
    confidence: float


class Allergy(BaseModel):
    allergen: str
    reaction: str
    severity: Severity
    confidence: float


class LabResult(BaseModel):
    test: str
    value: str
    unit: str
    referenceRange: str
    flag: LabFlag | None = None
    confidence: float


class ClinicalSummary(BaseModel):
    chiefComplaint: str
    historyOfPresentIllness: str
    assessment: str
    plan: str


class DocumentResponse(BaseModel):
    id: str
    fileName: str
    patientName: str
    patientId: str
    documentType: DocumentType
    uploadDate: str
    documentDate: str
    pageCount: int
    status: DocumentStatus
    medications: list[Medication]
    diagnoses: list[Diagnosis]
    allergies: list[Allergy]
    labResults: list[LabResult]
    summary: ClinicalSummary
    rawText: str
    confidence: float


class UploadResponse(BaseModel):
    documents: list[DocumentResponse]


class DocumentContext(BaseModel):
    id: str
    fileName: str
    patientName: str
    patientId: str
    documentType: DocumentType
    rawText: str
    summary: ClinicalSummary


class ReportRequest(BaseModel):
    documents: list[DocumentContext]


class ChatRequest(BaseModel):
    documents: list[DocumentContext]
    question: str


class AnalysisResponse(BaseModel):
    content: str
    model: str


AgentIntent = Literal["summarization", "data_extraction", "note_generation"]


class AgentRequest(BaseModel):
    documents: list[DocumentContext]
    instruction: str


class AgentToolResult(BaseModel):
    tool: str
    summary: str
    content: str


class AgentResponse(BaseModel):
    intent: AgentIntent
    rationale: str
    tools: list[str]
    toolResults: list[AgentToolResult]
    finalOutput: str
    model: str


JobStatus = Literal["queued", "running", "completed", "failed"]
WorkerJobStatus = Literal["queued", "running", "completed", "failed", "no_jobs"]


class AgentRunRecord(BaseModel):
    id: str
    createdAt: str
    instruction: str
    intent: AgentIntent
    rationale: str
    documentIds: list[str]
    documentNames: list[str]
    tools: list[str]
    toolResults: list[AgentToolResult]
    finalOutput: str
    model: str


class AgentRunsResponse(BaseModel):
    runs: list[AgentRunRecord]


class AutomationJobStep(BaseModel):
    name: str
    status: JobStatus
    detail: str


class AutomationJobRequest(BaseModel):
    documents: list[DocumentContext]
    instruction: str
    automationName: str


class AutomationJobRecord(BaseModel):
    id: str
    automationName: str
    instruction: str
    intent: AgentIntent
    status: JobStatus
    createdAt: str
    updatedAt: str
    documentIds: list[str]
    documentNames: list[str]
    steps: list[AutomationJobStep]
    finalOutput: str | None = None
    error: str | None = None
    model: str


class AutomationJobsResponse(BaseModel):
    jobs: list[AutomationJobRecord]


class ConnectorConfigRequest(BaseModel):
    connectorKey: str
    name: str
    config: dict[str, str]


class ConnectorRecord(BaseModel):
    id: str
    connectorKey: str
    label: str
    name: str
    description: str
    authType: str
    requiredFields: list[str]
    capabilities: list[str]
    configured: bool
    status: str
    authorized: bool = False
    patientName: str | None = None
    patientId: str | None = None
    lastSyncAt: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class ConnectorsResponse(BaseModel):
    connectors: list[ConnectorRecord]


class ConnectorAuthorizeResponse(BaseModel):
    authorizationUrl: str


class ConnectorSyncResponse(BaseModel):
    connector: ConnectorRecord
    importedDocument: DocumentResponse


class UserRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class WorkerJobResponse(BaseModel):
    status: WorkerJobStatus
    id: str | None = None
    prompt: str | None = None
    system_prompt: str | None = None
    user_prompt: str | None = None
    max_new_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None


class WorkerResultRequest(BaseModel):
    id: str
    result: str


class WorkerErrorRequest(BaseModel):
    id: str
    error: str


class ModelMedication(BaseModel):
    name: str
    dosage: str = "Not specified"
    frequency: str = "Not specified"
    route: str = "Unspecified"


class ModelDiagnosis(BaseModel):
    code: str = "Uncoded"
    description: str
    type: DiagnosisType = "primary"


class ModelAllergy(BaseModel):
    allergen: str
    reaction: str = "Reaction not specified"
    severity: Severity = "mild"


class ModelLabResult(BaseModel):
    test: str
    value: str
    unit: str = ""
    referenceRange: str = "Not provided"
    flag: LabFlag | None = None


class ModelExtraction(BaseModel):
    patientName: str | None = None
    patientId: str | None = None
    chiefComplaint: str | None = None
    historyOfPresentIllness: str | None = None
    assessment: str | None = None
    plan: str | None = None
    medications: list[ModelMedication] = []
    diagnoses: list[ModelDiagnosis] = []
    allergies: list[ModelAllergy] = []
    labResults: list[ModelLabResult] = []
