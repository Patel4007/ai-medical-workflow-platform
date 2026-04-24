import type { Document } from '../types';
import type { AuthUser } from './auth';

interface ApiClinicalSummary {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  assessment: string;
  plan: string;
}

interface ApiMedication {
  name: string;
  dosage: string;
  frequency: string;
  route: string;
  confidence: number;
}

interface ApiDiagnosis {
  code: string;
  description: string;
  type: 'primary' | 'secondary';
  confidence: number;
}

interface ApiAllergy {
  allergen: string;
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe';
  confidence: number;
}

interface ApiLabResult {
  test: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag?: 'high' | 'low' | 'critical';
  confidence: number;
}

interface ApiDocument {
  id: string;
  fileName: string;
  patientName: string;
  patientId: string;
  documentType: 'lab-report' | 'discharge-summary' | 'clinical-note' | 'radiology' | 'other';
  uploadDate: string;
  documentDate: string;
  pageCount: number;
  status: 'processing' | 'completed' | 'error';
  medications: ApiMedication[];
  diagnoses: ApiDiagnosis[];
  allergies: ApiAllergy[];
  labResults: ApiLabResult[];
  summary: ApiClinicalSummary;
  rawText: string;
  confidence: number;
}

interface UploadResponse {
  documents: ApiDocument[];
}

interface AnalysisResponse {
  content: string;
  model: string;
}

interface AgentToolResult {
  tool: string;
  summary: string;
  content: string;
}

interface AgentResponse {
  intent: 'summarization' | 'data_extraction' | 'note_generation';
  rationale: string;
  tools: string[];
  toolResults: AgentToolResult[];
  finalOutput: string;
  model: string;
}

interface AgentRunRecord extends AgentResponse {
  id: string;
  createdAt: string;
  instruction: string;
  documentIds: string[];
  documentNames: string[];
}

interface AgentRunsResponse {
  runs: AgentRunRecord[];
}

interface AutomationJobStep {
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  detail: string;
}

interface AutomationJobRecord {
  id: string;
  automationName: string;
  instruction: string;
  intent: 'summarization' | 'data_extraction' | 'note_generation';
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  documentIds: string[];
  documentNames: string[];
  steps: AutomationJobStep[];
  finalOutput: string | null;
  error: string | null;
  model: string;
}

interface AutomationJobsResponse {
  jobs: AutomationJobRecord[];
}

interface ConnectorRecord {
  id: string;
  connectorKey: string;
  label: string;
  name: string;
  description: string;
  authType: string;
  requiredFields: string[];
  capabilities: string[];
  configured: boolean;
  status: string;
  authorized: boolean;
  patientName?: string | null;
  patientId?: string | null;
  lastSyncAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface ConnectorsResponse {
  connectors: ConnectorRecord[];
}

interface ConnectorAuthorizeResponse {
  authorizationUrl: string;
}

interface ApiConnectorSyncResponse {
  connector: ConnectorRecord;
  importedDocument: ApiDocument;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

function toDocument(apiDocument: ApiDocument): Document {
  return {
    ...apiDocument,
    uploadDate: new Date(apiDocument.uploadDate),
    documentDate: new Date(apiDocument.documentDate),
  };
}

async function parseError(response: Response, fallbackMessage: string) {
  let message = fallbackMessage;
  try {
    const body = (await response.json()) as { detail?: string };
    if (body.detail) {
      message = body.detail;
    }
  } catch {
    // Ignore invalid JSON error bodies.
  }
  return new Error(message);
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error('Could not reach the FastAPI backend. Make sure the FastAPI server is running.');
  }

  if (!response.ok) {
    throw await parseError(response, 'The request failed.');
  }

  return (await response.json()) as T;
}

export async function signUpUser(name: string, email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, email, password }),
  });
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser(token: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/api/auth/me', { method: 'GET' }, token);
}

export async function logoutUser(token: string): Promise<void> {
  await apiRequest<{ status: string }>('/api/auth/logout', { method: 'POST' }, token);
}

export async function fetchDocuments(token: string): Promise<Document[]> {
  const data = await apiRequest<UploadResponse>('/api/documents', { method: 'GET' }, token);
  return data.documents.map(toDocument);
}

export async function uploadDocuments(token: string, files: File[]): Promise<Document[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const data = await apiRequest<UploadResponse>(
    '/api/documents/upload',
    {
      method: 'POST',
      body: formData,
    },
    token
  );
  return data.documents.map(toDocument);
}

export async function deleteDocument(token: string, documentId: string): Promise<void> {
  await apiRequest<{ status: string }>(
    `/api/documents/${documentId}`,
    {
      method: 'DELETE',
    },
    token
  );
}

function toAnalysisDocument(document: Document) {
  return {
    id: document.id,
    fileName: document.fileName,
    patientName: document.patientName,
    patientId: document.patientId,
    documentType: document.documentType,
    rawText: document.rawText,
    summary: document.summary,
  };
}

async function postAuthenticatedAnalysis<TRequest>(
  token: string,
  path: string,
  payload: TRequest
): Promise<AnalysisResponse> {
  return apiRequest<AnalysisResponse>(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    token
  );
}

async function postAuthenticatedJson<TRequest, TResponse>(
  token: string,
  path: string,
  payload: TRequest
): Promise<TResponse> {
  return apiRequest<TResponse>(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function generateMedicalReport(token: string, documents: Document[]): Promise<AnalysisResponse> {
  return postAuthenticatedAnalysis(token, '/api/analysis/report', {
    documents: documents.map(toAnalysisDocument),
  });
}

export async function askDocumentsQuestion(
  token: string,
  documents: Document[],
  question: string
): Promise<AnalysisResponse> {
  return postAuthenticatedAnalysis(token, '/api/analysis/chat', {
    documents: documents.map(toAnalysisDocument),
    question,
  });
}

export async function runWorkflowAgent(
  token: string,
  documents: Document[],
  instruction: string
): Promise<AgentResponse> {
  return postAuthenticatedJson<
    { documents: ReturnType<typeof toAnalysisDocument>[]; instruction: string },
    AgentResponse
  >(token, '/api/agent/run', {
    documents: documents.map(toAnalysisDocument),
    instruction,
  });
}

export async function fetchAgentRuns(token: string): Promise<AgentRunRecord[]> {
  const data = await apiRequest<AgentRunsResponse>('/api/agent/runs', { method: 'GET' }, token);
  return data.runs;
}

export async function queueAutomationJob(
  token: string,
  documents: Document[],
  instruction: string,
  automationName: string
): Promise<AutomationJobRecord> {
  return postAuthenticatedJson<
    {
      documents: ReturnType<typeof toAnalysisDocument>[];
      instruction: string;
      automationName: string;
    },
    AutomationJobRecord
  >(token, '/api/agent/jobs', {
    documents: documents.map(toAnalysisDocument),
    instruction,
    automationName,
  });
}

export async function fetchAutomationJobs(token: string): Promise<AutomationJobRecord[]> {
  const data = await apiRequest<AutomationJobsResponse>('/api/agent/jobs', { method: 'GET' }, token);
  return data.jobs;
}

export async function fetchConnectors(token: string): Promise<ConnectorRecord[]> {
  const data = await apiRequest<ConnectorsResponse>('/api/connectors', { method: 'GET' }, token);
  return data.connectors;
}

export async function configureConnector(
  token: string,
  connectorKey: string,
  name: string,
  config: Record<string, string>
): Promise<ConnectorRecord> {
  return postAuthenticatedJson<
    { connectorKey: string; name: string; config: Record<string, string> },
    ConnectorRecord
  >(token, '/api/connectors', {
    connectorKey,
    name,
    config,
  });
}

export async function startConnectorAuthorization(
  token: string,
  connectorKey: string
): Promise<ConnectorAuthorizeResponse> {
  return apiRequest<ConnectorAuthorizeResponse>(
    `/api/connectors/${encodeURIComponent(connectorKey)}/authorize`,
    { method: 'GET' },
    token
  );
}

export async function syncConnector(
  token: string,
  connectorKey: string
): Promise<{ connector: ConnectorRecord; importedDocument: Document }> {
  const data = await apiRequest<ApiConnectorSyncResponse>(
    `/api/connectors/${encodeURIComponent(connectorKey)}/sync`,
    { method: 'POST' },
    token
  );
  return {
    connector: data.connector,
    importedDocument: toDocument(data.importedDocument),
  };
}
