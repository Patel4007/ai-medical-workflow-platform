# Kaggle GPU Worker

This folder now supports two Kaggle GPU patterns:

1. Direct worker mode: Kaggle runs a FastAPI model worker behind local `nginx`, and you expose it through a tunnel.
2. Polling worker mode: Kaggle polls your public FastAPI backend for queued jobs and posts results back.

Polling is usually the better Kaggle fit because Kaggle only needs outbound access.

## Option 1: Polling worker (recommended)

This matches a worker script like:

- Kaggle polls `GET /get_job`
- Kaggle submits output to `POST /submit_result`
- Kaggle can report failures to `POST /submit_error`

### Local backend setup

Expose your local FastAPI backend through a public URL such as your existing `ngrok` address, then start the backend with polling mode enabled:

```bash
export POLLING_INFERENCE_ENABLED="1"
export POLLING_WORKER_TOKEN="replace-this-with-a-secret-token"
export POLLING_INFERENCE_MODEL_LABEL="kaggle-t4-phi3"
export POLLING_JOB_TIMEOUT_SECONDS="300"
export POLLING_JOB_LEASE_SECONDS="600"
cd "/Users/jaypatel/Downloads/AI Medical Document Dashboard/backend"
uvicorn main:app --reload
```

### Kaggle notebook setup

1. Create a new Kaggle notebook.
2. Turn `Internet` on.
3. In `Settings`, set `Accelerator` to `GPU`.
4. Upload this folder into `/kaggle/working/kaggle_gpu_worker`.
5. Run:

```bash
cd /kaggle/working/kaggle_gpu_worker
pip install -q -r requirements.txt
export HF_MODEL_ID="Patel47/Phi-3-Medical-Transcriber-QA-Model"
export FASTAPI_URL="https://your-public-fastapi-url.example.com"
export POLLING_WORKER_TOKEN="replace-this-with-a-secret-token"
python polling_worker.py
```

The polling worker script is [polling_worker.py](./polling_worker.py).

## Option 2: Direct remote worker via nginx

This mode runs a FastAPI model worker locally inside Kaggle and puts `nginx` in front of it.

### Kaggle notebook setup

```bash
cd /kaggle/working/kaggle_gpu_worker
pip install -q -r requirements.txt
export HF_MODEL_ID="Patel47/Phi-3-Medical-Transcriber-QA-Model"
export WORKER_AUTH_TOKEN="replace-this-with-a-secret-token"
bash start_worker.sh
```

Verify it inside Kaggle:

```bash
curl -H "Authorization: Bearer ${WORKER_AUTH_TOKEN}" http://127.0.0.1:8080/health
```

`nginx` only proxies inside Kaggle. You still need an outbound tunnel from Kaggle to `http://127.0.0.1:8080`, and then you point the local backend at that public URL.

### Local backend setup

```bash
export REMOTE_INFERENCE_URL="https://your-public-worker-url.example.com"
export REMOTE_INFERENCE_TOKEN="replace-this-with-a-secret-token"
export REMOTE_INFERENCE_MODEL_LABEL="kaggle-t4-phi3"
export REMOTE_INFERENCE_TIMEOUT_SECONDS="180"
```

If `REMOTE_INFERENCE_URL` is set, the dashboard backend prefers that remote worker for report generation, chat, note generation, and extraction fallback prompts.
