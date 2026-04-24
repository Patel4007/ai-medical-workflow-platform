from __future__ import annotations

import os
import time

import requests
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


MODEL_NAME = os.environ.get("HF_MODEL_ID", "Patel47/Phi-3-Medical-Transcriber-QA-Model")
FASTAPI_URL = os.environ.get("FASTAPI_URL", "https://your-public-fastapi-url.example.com").rstrip("/")
WORKER_BEARER_TOKEN = os.environ.get("POLLING_WORKER_TOKEN", "").strip()
POLL_INTERVAL_SECONDS = float(os.environ.get("POLLING_WORKER_IDLE_SECONDS", "5"))


def request_headers() -> dict[str, str]:
    if not WORKER_BEARER_TOKEN:
        return {}
    return {"Authorization": f"Bearer {WORKER_BEARER_TOKEN}"}


def build_prompt(job: dict, tokenizer) -> str:
    system_prompt = str(job.get("system_prompt") or "").strip()
    user_prompt = str(job.get("user_prompt") or "").strip()
    if system_prompt and user_prompt:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        try:
            return tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        except Exception:
            pass
    return str(job.get("prompt") or "").strip()


def run_inference(job: dict, tokenizer, model) -> str:
    prompt = build_prompt(job, tokenizer)
    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=1536,
    )
    device = next(model.parameters()).device
    inputs = {key: value.to(device) for key, value in inputs.items()}

    outputs = model.generate(
        **inputs,
        max_new_tokens=int(job.get("max_new_tokens") or 256),
        temperature=float(job.get("temperature") or 0.2),
        top_p=float(job.get("top_p") or 0.9),
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id,
    )

    generated_tokens = outputs[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()


print(f"Loading model {MODEL_NAME} ...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    device_map="auto",
    dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    trust_remote_code=True,
)

print("Kaggle polling worker started. Waiting for inference jobs...")

while True:
    current_job_id = None
    try:
        job = requests.get(
            f"{FASTAPI_URL}/get_job",
            headers=request_headers(),
            timeout=30,
        ).json()
        if job.get("status") == "no_jobs":
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        current_job_id = job["id"]
        print(f"Processing job {current_job_id}...")
        result = run_inference(job, tokenizer, model)

        requests.post(
            f"{FASTAPI_URL}/submit_result",
            headers=request_headers(),
            json={"id": current_job_id, "result": result},
            timeout=30,
        ).raise_for_status()
        print(f"Completed job {current_job_id}")
    except Exception as exc:
        print("Worker error:", exc)
        if current_job_id:
            try:
                requests.post(
                    f"{FASTAPI_URL}/submit_error",
                    headers=request_headers(),
                    json={"id": current_job_id, "error": str(exc)},
                    timeout=30,
                )
            except Exception as submit_exc:
                print("Could not submit worker error:", submit_exc)
        time.sleep(10)
