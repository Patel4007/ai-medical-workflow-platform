import { useEffect, useState } from 'react';
import { Bot, BrainCircuit, ClipboardList, FileText, LoaderCircle, PlugZap, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDocuments } from '../lib/documents';
import {
  configureConnector,
  fetchAgentRuns,
  fetchAutomationJobs,
  fetchConnectors,
  queueAutomationJob,
  runWorkflowAgent,
  startConnectorAuthorization,
  syncConnector,
} from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

interface AgentToolResult {
  tool: string;
  summary: string;
  content: string;
}

interface AgentRunResponse {
  intent: 'summarization' | 'data_extraction' | 'note_generation';
  rationale: string;
  tools: string[];
  toolResults: AgentToolResult[];
  finalOutput: string;
  model: string;
}

interface AgentHistoryItem extends AgentRunResponse {
  id: string;
  createdAt: string;
  instruction: string;
  documentIds: string[];
  documentNames: string[];
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
}

const DEFAULT_CONNECTOR_REDIRECT_URI = `${
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
}/api/connectors/callback`;

const CONNECTOR_FIELD_ORDER = [
  'client_id',
  'client_secret',
  'fhir_base_url',
  'redirect_uri',
  'scopes',
  'patient_id',
  'authorize_url',
  'token_url',
] as const;

const CONNECTOR_FIELD_LABELS: Record<(typeof CONNECTOR_FIELD_ORDER)[number], string> = {
  client_id: 'Client ID',
  client_secret: 'Client secret',
  fhir_base_url: 'FHIR base URL',
  redirect_uri: 'Redirect URI',
  scopes: 'Scopes (optional)',
  patient_id: 'Patient ID override (optional)',
  authorize_url: 'Authorize URL override (optional)',
  token_url: 'Token URL override (optional)',
};

export function Agent() {
  const { token } = useAuth();
  const { documents, isLoading, refreshDocuments } = useDocuments();
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState(
    'Summarize the patient record and draft a concise follow-up note for today.'
  );
  const [result, setResult] = useState<AgentRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<AgentHistoryItem[]>([]);
  const [jobs, setJobs] = useState<AutomationJobRecord[]>([]);
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [automationName, setAutomationName] = useState('Morning review automation');
  const [connectorName, setConnectorName] = useState('SMART Sandbox Connector');
  const [connectorConfig, setConnectorConfig] = useState<Record<string, string>>({
    client_id: '',
    client_secret: '',
    fhir_base_url: '',
    redirect_uri: DEFAULT_CONNECTOR_REDIRECT_URI,
    scopes: '',
    patient_id: '',
    authorize_url: '',
    token_url: '',
  });
  const [isQueueing, setIsQueueing] = useState(false);
  const [connectorStatusMessage, setConnectorStatusMessage] = useState<string | null>(null);
  const [activeConnectorAction, setActiveConnectorAction] = useState<string | null>(null);

  const refreshConnectorResources = async () => {
    if (!token) {
      return;
    }

    const [connectorsResult] = await Promise.allSettled([
      fetchConnectors(token),
      refreshDocuments(),
    ]);

    if (connectorsResult.status === 'fulfilled') {
      setConnectors(connectorsResult.value);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    Promise.allSettled([
      fetchAgentRuns(token),
      fetchAutomationJobs(token),
      fetchConnectors(token),
    ]).then(([runsResult, jobsResult, connectorsResult]) => {
      if (runsResult.status === 'fulfilled') {
        setHistory(runsResult.value);
      }
      if (jobsResult.status === 'fulfilled') {
        setJobs(jobsResult.value);
      }
      if (connectorsResult.status === 'fulfilled') {
        setConnectors(connectorsResult.value);
      }
    });
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const payload =
        typeof event.data === 'object' && event.data !== null
          ? (event.data as { type?: string; success?: boolean })
          : null;
      if (!payload || payload.type !== 'connector-callback') {
        return;
      }

      setConnectorStatusMessage(
        payload.success
          ? 'SMART on FHIR authorization completed and the imported chart was added to Workspace.'
          : 'SMART on FHIR authorization did not complete. Review the callback message and retry.'
      );
      void refreshConnectorResources();
    };

    const handleFocus = () => {
      void refreshConnectorResources();
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [token]);

  useEffect(() => {
    if (documents.length > 0 && selectedDocumentIds.length === 0) {
      setSelectedDocumentIds(documents.slice(0, Math.min(2, documents.length)).map((doc) => doc.id));
    }
  }, [documents, selectedDocumentIds.length]);

  const selectedDocuments = documents.filter((doc) => selectedDocumentIds.includes(doc.id));

  const toggleDocument = (documentId: string) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(documentId)
        ? prev.filter((id) => id !== documentId)
        : [...prev, documentId]
    );
  };

  const handleRun = async () => {
    if (!token) {
      setError('Please sign in again to run the workflow agent.');
      return;
    }
    if (selectedDocuments.length === 0) {
      setError('Select at least one EHR document.');
      return;
    }
    if (!instruction.trim()) {
      setError('Enter a clinician instruction first.');
      return;
    }

    setIsRunning(true);
    setError(null);
    try {
      const response = await runWorkflowAgent(token, selectedDocuments, instruction.trim());
      setResult(response);
      const runs = await fetchAgentRuns(token);
      setHistory(runs);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Workflow run failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleQueueAutomation = async () => {
    if (!token) {
      setError('Please sign in again to queue automations.');
      return;
    }
    if (selectedDocuments.length === 0) {
      setError('Select at least one EHR document.');
      return;
    }
    setIsQueueing(true);
    setError(null);
    try {
      const job = await queueAutomationJob(token, selectedDocuments, instruction.trim(), automationName.trim());
      setJobs((prev) => [job, ...prev]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to queue automation.');
    } finally {
      setIsQueueing(false);
    }
  };

  const handleSaveConnector = async (connectorKey: string) => {
    if (!token) {
      setError('Please sign in again to save connectors.');
      return;
    }
    setActiveConnectorAction(`${connectorKey}:save`);
    setError(null);
    setConnectorStatusMessage(null);
    try {
      await configureConnector(token, connectorKey, connectorName.trim(), connectorConfig);
      await refreshConnectorResources();
      setConnectorStatusMessage('Connector configuration saved. You can authorize it next.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to save connector configuration.');
    } finally {
      setActiveConnectorAction(null);
    }
  };

  const handleAuthorizeConnector = async (connector: ConnectorRecord) => {
    if (!token) {
      setError('Please sign in again to authorize connectors.');
      return;
    }

    setActiveConnectorAction(`${connector.connectorKey}:authorize`);
    setError(null);
    setConnectorStatusMessage(null);
    try {
      const response = await startConnectorAuthorization(token, connector.connectorKey);
      const popup = window.open(
        response.authorizationUrl,
        `${connector.connectorKey}-smart-auth`,
        'popup=yes,width=760,height=820'
      );
      if (!popup) {
        throw new Error('The authorization popup was blocked. Allow popups for this app and retry.');
      }
      popup.focus();
      setConnectorStatusMessage(
        `Complete the ${connector.label} login in the popup. The patient chart will import automatically after authorization.`
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to start SMART authorization.');
    } finally {
      setActiveConnectorAction(null);
    }
  };

  const handleSyncConnector = async (connector: ConnectorRecord) => {
    if (!token) {
      setError('Please sign in again to sync connector data.');
      return;
    }

    setActiveConnectorAction(`${connector.connectorKey}:sync`);
    setError(null);
    setConnectorStatusMessage(null);
    try {
      const response = await syncConnector(token, connector.connectorKey);
      await refreshConnectorResources();
      setConnectorStatusMessage(
        `Imported ${response.importedDocument.fileName} for ${response.importedDocument.patientName}.`
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to sync patient data.');
    } finally {
      setActiveConnectorAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Workflow Automation Agent</h1>
        <p className="text-slate-600 mt-2">
          Interpret clinician intent and orchestrate tool-based actions across uploaded EHR records.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              EHR Context
            </CardTitle>
            <CardDescription>Select which uploaded records the agent should use.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="text-sm text-slate-600">Loading documents...</div>
            ) : documents.length === 0 ? (
              <div className="text-sm text-slate-600">Upload documents in the workspace first.</div>
            ) : (
              <ScrollArea className="h-72 pr-2">
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const selected = selectedDocumentIds.includes(doc.id);
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => toggleDocument(doc.id)}
                        className={`w-full text-left rounded-lg border px-3 py-3 transition-all ${
                          selected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            <div className={`w-4 h-4 rounded border ${selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{doc.fileName}</p>
                            <p className="text-xs text-slate-600 mt-1">
                              {doc.patientName} • {doc.documentType.replace('-', ' ')}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Clinician instruction</label>
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={6}
                className="bg-white"
                placeholder="Example: Extract all active medications and draft a SOAP note for handoff."
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button
              onClick={handleRun}
              disabled={isRunning || selectedDocuments.length === 0 || !instruction.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isRunning ? (
                <>
                  <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
                  Running workflow...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 mr-2" />
                  Run agent
                </>
              )}
            </Button>

            <div className="space-y-2 pt-2">
              <label className="text-sm font-medium text-slate-900">Automation name</label>
              <Input
                value={automationName}
                onChange={(e) => setAutomationName(e.target.value)}
                className="bg-white"
              />
              <Button
                variant="outline"
                onClick={handleQueueAutomation}
                disabled={isQueueing || selectedDocuments.length === 0 || !instruction.trim()}
                className="w-full"
              >
                {isQueueing ? (
                  <>
                    <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
                    Queueing automation...
                  </>
                ) : (
                  'Queue automation job'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-blue-600" />
                Intent Interpretation
              </CardTitle>
              <CardDescription>The agent identifies clinician intent before choosing tools.</CardDescription>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-blue-600 hover:bg-blue-600 text-white">
                      {result.intent.replace('_', ' ')}
                    </Badge>
                    <Badge variant="outline">{result.model}</Badge>
                  </div>
                  <p className="text-sm text-slate-700">{result.rationale}</p>
                  <div className="flex flex-wrap gap-2">
                    {result.tools.map((tool) => (
                      <Badge key={tool} variant="secondary">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Run the agent to see the inferred workflow intent and planned tools.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-blue-600" />
                Saved Runs
              </CardTitle>
              <CardDescription>Previous workflow runs saved for this account.</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <ScrollArea className="h-64 pr-2">
                  <div className="space-y-3">
                    {history.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setResult(item)}
                        className="w-full text-left rounded-lg border border-slate-200 bg-slate-50 p-4 hover:border-blue-300"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="outline">{item.intent.replace('_', ' ')}</Badge>
                          <span className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-900 mt-2 line-clamp-2">{item.instruction}</p>
                        <p className="text-xs text-slate-600 mt-2">{item.documentNames.join(', ')}</p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-600">Agent history will appear here after your first run.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-600" />
                Task Queue
              </CardTitle>
              <CardDescription>Queued multi-step automation jobs and their execution status.</CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length > 0 ? (
                <ScrollArea className="h-72 pr-2">
                  <div className="space-y-3">
                    {jobs.map((job) => (
                      <div key={job.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{job.automationName}</p>
                            <p className="text-xs text-slate-600 mt-1">{job.instruction}</p>
                          </div>
                          <Badge variant={job.status === 'completed' ? 'default' : 'outline'}>
                            {job.status}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          {job.steps.map((step) => (
                            <div key={step.name} className="flex items-start justify-between gap-3 text-xs">
                              <span className="text-slate-700">{step.name}</span>
                              <span className="text-slate-500">{step.status}</span>
                            </div>
                          ))}
                        </div>
                        {job.error && <p className="text-xs text-red-600 mt-2">{job.error}</p>}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-600">Queued automation jobs will appear here.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlugZap className="w-5 h-5 text-blue-600" />
                EHR Connectors
              </CardTitle>
              <CardDescription>
                Configure read-only SMART on FHIR credentials, authorize a patient context, and import live chart data into Workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Connector display name</label>
                <Input
                  value={connectorName}
                  onChange={(e) => setConnectorName(e.target.value)}
                  className="bg-white"
                />
              </div>
              <p className="text-xs text-slate-600">
                Use the shared configuration fields below, then click save on the connector you want to activate. Leave optional endpoint fields blank to use SMART discovery from the FHIR base URL.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {CONNECTOR_FIELD_ORDER.map((field) => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs font-medium text-slate-700">{CONNECTOR_FIELD_LABELS[field]}</label>
                    <Input
                      type={field === 'client_secret' ? 'password' : 'text'}
                      placeholder={field}
                      value={connectorConfig[field] ?? ''}
                      onChange={(e) =>
                        setConnectorConfig((prev) => ({
                          ...prev,
                          [field]: e.target.value,
                        }))
                      }
                      className="bg-white"
                    />
                  </div>
                ))}
              </div>
              {connectorStatusMessage && <p className="text-sm text-emerald-700">{connectorStatusMessage}</p>}
              {connectors.length > 0 ? (
                <div className="space-y-3">
                  {connectors.map((connector) => (
                    <div key={connector.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{connector.label}</p>
                          <p className="text-xs text-slate-700 mt-1">{connector.name}</p>
                          <p className="text-xs text-slate-600 mt-1">{connector.description}</p>
                        </div>
                        <Badge variant={connector.authorized ? 'default' : 'outline'}>
                          {connector.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-3">
                        Required fields: {connector.requiredFields.join(', ')}
                      </p>
                      {connector.patientName && (
                        <p className="text-xs text-slate-600 mt-2">
                          Patient context: {connector.patientName}
                          {connector.patientId ? ` (${connector.patientId})` : ''}
                        </p>
                      )}
                      {connector.lastSyncAt && (
                        <p className="text-xs text-slate-500 mt-1">
                          Last sync: {new Date(connector.lastSyncAt).toLocaleString()}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {connector.capabilities.map((capability) => (
                          <Badge key={capability} variant="secondary">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={activeConnectorAction !== null}
                          onClick={() => void handleSaveConnector(connector.connectorKey)}
                        >
                          {activeConnectorAction === `${connector.connectorKey}:save`
                            ? 'Saving...'
                            : `Save ${connector.label}`}
                        </Button>
                        <Button
                          disabled={!connector.configured || activeConnectorAction !== null}
                          onClick={() => void handleAuthorizeConnector(connector)}
                        >
                          {activeConnectorAction === `${connector.connectorKey}:authorize`
                            ? 'Opening auth...'
                            : 'Authorize & import'}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={!connector.authorized || activeConnectorAction !== null}
                          onClick={() => void handleSyncConnector(connector)}
                        >
                          {activeConnectorAction === `${connector.connectorKey}:sync`
                            ? 'Syncing...'
                            : 'Sync patient data'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">Connector scaffolds will appear here.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Tool Trace
              </CardTitle>
              <CardDescription>Each step the workflow agent executed on the selected EHR records.</CardDescription>
            </CardHeader>
            <CardContent>
              {result ? (
                <ScrollArea className="h-72 pr-2">
                  <div className="space-y-3">
                    {result.toolResults.map((item) => (
                      <div key={item.tool} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">{item.tool}</Badge>
                          <span className="text-sm text-slate-700">{item.summary}</span>
                        </div>
                        <pre className="text-xs whitespace-pre-wrap text-slate-700 leading-relaxed">
                          {item.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-600">Tool execution details will appear here.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                Final Response
              </CardTitle>
              <CardDescription>The clinician-ready output synthesized from the tool chain.</CardDescription>
            </CardHeader>
            <CardContent>
              {result ? (
                <pre className="text-sm whitespace-pre-wrap text-slate-800 leading-relaxed">
                  {result.finalOutput}
                </pre>
              ) : (
                <p className="text-sm text-slate-600">The final orchestrated response will appear here after a run.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
