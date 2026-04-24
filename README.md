# AI Medical Workflow Automation Platform

AI Medical workflow platform is a software application for analyzing medical documents, extracting structured clinical data, generating reports and SOAP summaries, running clinician-directed automation workflows and importing read-only SMART on FHIR data.

The app combines:

- a React + Vite frontend for document review and workflow orchestration
- a FastAPI backend for auth, uploads, parsing, reporting, chat, and agent runs
- optional Hugging Face or remote GPU inference for heavier generation tasks
- a read-only SMART on FHIR connector flow for importing EHR chart data into the workspace

## What the app does

- Authenticates users with email/password sign-up and login
- Uploads `.txt` and `.pdf` medical documents
- Extracts medications, diagnoses, allergies and lab results
- Generates a clinician-facing report from one or more selected documents
- Answers chart-grounded questions in the workspace chat
- Runs a `Workflow Automation Agent` that interprets clinician instructions and orchestrates multi-step outputs
- Queues background workflow jobs and shows step-by-step execution status
- Supports read-only SMART on FHIR / Epic / Oracle Health-Cerner connector scaffolds with authorization and patient import
- Supports optional Kaggle GPU-backed inference in either polling mode or direct remote-worker mode

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind-based UI components
- Backend: FastAPI, PyTorch, Pydantic, TinyDB
- AI runtime: Hugging Face Transformers
- Optional remote inference: Kaggle GPU worker, polling job queue, or direct HTTP worker behind `nginx`

## Project structure

```text
AI Medical Document Dashboard/
├── backend/
│   ├── main.py                  # FastAPI routes and app setup
│   ├── schemas.py               # Pydantic request/response models
│   ├── services.py              # Auth, parsing, agent, connectors, inference logic
│   ├── storage.py               # TinyDB tables and upload paths
│   ├── connectors.py            # Connector definitions
│   ├── requirements.txt
│   └── data/
│       ├── db.json              # Local TinyDB storage
│       └── uploads/             # Uploaded source files
├── deployment/
│   └── kaggle_gpu_worker/       # Kaggle polling and direct-worker files
├── src/
│   └── app/                     # React pages, components, hooks, and API client
├── package.json
└── README.md
```

## Core product flows

### Workspace

- Upload clinical documents
- Review extracted structured data and summaries
- Generate a report
- Ask grounded follow-up questions

### Workflow Automation Agent

- Select one or more uploaded records
- Enter a clinician instruction
- Run an agent workflow for summarization, extraction, or note generation
- Queue the same workflow as a background automation job
- Review the tool trace and final response

### EHR connectors

- Save a read-only SMART on FHIR connector configuration
- Launch SMART authorization in a popup
- Import a patient chart into the workspace after authorization
- Re-sync patient data later from the Agent page

## Local development setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm

### 1. Start the backend

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

Or from inside `backend/`:

```bash
cd backend
uvicorn main:app --reload
```

The backend runs on `http://127.0.0.1:8000`.

### 2. Start the frontend

In a second terminal:

```bash
npm install
npm run dev
```

The frontend runs on `http://127.0.0.1:5173`.

### 3. Open the app

- Sign up for a local account
- Upload a `.txt` or `.pdf` medical record
- Use `Workspace` for reports and chat
- Use `Agent` for clinician instructions, automations, and connectors

## Inference modes

The backend supports several generation backends.

### Default local behavior

On CPU-only development machines, the app uses a reliable local deterministic fallback for report, chat and workflow generation. This keeps the app responsive even when a full Hugging Face model is heavy or slow.

### Optional local Hugging Face model

To force local model generation, set:

```bash
export HF_ENABLE_MODEL="1"
```

Useful optional variables:

```bash
export HF_MODEL_ID="Patel47/Phi-3-Medical-Transcriber-QA-Model"
export HF_DEVICE="cuda"
```

## Optional Kaggle GPU integration

This project supports two Kaggle GPU patterns.

### Option 1: Polling worker mode

Recommended for Kaggle because the notebook only needs outbound access.

Start the backend with:

```bash
export POLLING_INFERENCE_ENABLED="1"
export POLLING_WORKER_TOKEN="replace-this-with-a-secret-token"
export POLLING_INFERENCE_MODEL_LABEL="kaggle-t4-phi3"
export POLLING_JOB_TIMEOUT_SECONDS="300"
export POLLING_JOB_LEASE_SECONDS="600"
```

Then expose your local FastAPI server with a public URL and run the Kaggle worker:

```bash
cd deployment/kaggle_gpu_worker
pip install -q -r requirements.txt
export FASTAPI_URL="https://your-public-fastapi-url.example.com"
export POLLING_WORKER_TOKEN="replace-this-with-a-secret-token"
export HF_MODEL_ID="Patel47/Phi-3-Medical-Transcriber-QA-Model"
python polling_worker.py
```

### Option 2: Direct remote worker mode

Start the backend with:

```bash
export REMOTE_INFERENCE_URL="https://your-public-worker-url.example.com"
export REMOTE_INFERENCE_TOKEN="replace-this-with-a-secret-token"
export REMOTE_INFERENCE_MODEL_LABEL="kaggle-t4-phi3"
export REMOTE_INFERENCE_TIMEOUT_SECONDS="180"
```

This mode expects a remote model worker, such as the Kaggle FastAPI worker behind `nginx`, to be reachable from the backend.

More details live in [deployment/kaggle_gpu_worker/README.md](./deployment/kaggle_gpu_worker/README.md).

## SMART on FHIR connector setup

The Agent page includes connector cards for:

- SMART on FHIR
- Epic
- Oracle Health / Cerner

These are currently implemented as read-only SMART on FHIR imports.

### Required fields

- `client_id`
- `client_secret`
- `fhir_base_url`
- `redirect_uri`

### Optional fields

- `scopes`
- `patient_id`
- `authorize_url`
- `token_url`

### Local redirect URI

For local development, the connector callback is typically:

```text
http://localhost:8000/api/connectors/callback
```

### Connector flow

1. Save the connector configuration from the `Agent` page.
2. Click `Authorize & import`.
3. Complete the SMART login flow in the popup.
4. The imported chart is saved as a workspace document.
5. Use `Sync patient data` later to refresh the imported chart.

### Current connector behavior

- Read-only import only
- OAuth-based SMART authorization
- Patient chart data is imported into the workspace as a synthetic clinical note
- No write-back, messaging, or handoff delivery yet

## Storage

Local development data is stored in:

- `backend/data/db.json` for users, sessions, documents, jobs, connectors, and worker queue state
- `backend/data/uploads/` for uploaded source files

## Supported document behavior

The parser currently supports:

- medication extraction from common sections such as `Medications` and `Prescription`
- inline numbered prescriptions such as `1. Aspirin ... 2. Atorvastatin ...`
- diagnosis, allergy, and lab extraction
- follow-up instruction extraction from chart text, including inline follow-up items

## Useful API routes

### Health

- `GET /api/health`

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Documents

- `GET /api/documents`
- `POST /api/documents/upload`
- `DELETE /api/documents/{document_id}`

### Analysis

- `POST /api/analysis/report`
- `POST /api/analysis/chat`

### Agent

- `POST /api/agent/run`
- `GET /api/agent/runs`
- `POST /api/agent/jobs`
- `GET /api/agent/jobs`

### Connectors

- `GET /api/connectors`
- `POST /api/connectors`
- `GET /api/connectors/{connector_key}/authorize`
- `POST /api/connectors/{connector_key}/sync`
- `GET /api/connectors/callback`

### Polling worker

- `GET /get_job`
- `POST /submit_result`
- `POST /submit_error`

## Build and verification

Frontend production build:

```bash
npm run build
```

Backend health check:

```bash
curl http://127.0.0.1:8000/api/health
```

## Current limitations

- TinyDB is used for local development, not production-scale persistence
- Auth is local and development-oriented
- Handoff generation exists, but handoff delivery to another clinician is not implemented yet
- This repository is a working prototype and is not production-hardened for real PHI workflows or enterprise deployment

