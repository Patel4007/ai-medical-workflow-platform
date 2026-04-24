from __future__ import annotations

import os

os.environ["TRANSFORMERS_NO_TF"] = "1"
os.environ["USE_TF"] = "0"
os.environ["USE_FLAX"] = "0"

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "Patel47/Phi-3-Medical-Transcriber-QA-Model")
HF_DEVICE = os.environ.get("HF_DEVICE", "").strip().lower()
WORKER_AUTH_TOKEN = os.environ.get("WORKER_AUTH_TOKEN", "").strip()

app = FastAPI(title="Kaggle GPU Worker")
_tokenizer = None
_model = None


class GenerateRequest(BaseModel):
    system_prompt: str
    user_prompt: str
    max_new_tokens: int = 256
    temperature: float = 0.2
    top_p: float = 0.9


class GenerateResponse(BaseModel):
    content: str
    model: str
    device: str


def resolve_device() -> str:
    if HF_DEVICE in {"cpu", "cuda"}:
        return HF_DEVICE
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def require_auth(authorization: str | None = None) -> None:
    if not WORKER_AUTH_TOKEN:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    if authorization.removeprefix("Bearer ").strip() != WORKER_AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid bearer token.")


def get_model_components():
    global _tokenizer, _model
    if _tokenizer is not None and _model is not None:
        return _tokenizer, _model

    device = resolve_device()
    torch_dtype = torch.float16 if device == "cuda" else torch.float32

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


def generate_text(payload: GenerateRequest) -> str:
    tokenizer, model = get_model_components()
    messages = [
        {"role": "system", "content": payload.system_prompt},
        {"role": "user", "content": payload.user_prompt},
    ]
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
            max_new_tokens=payload.max_new_tokens,
            do_sample=True,
            temperature=payload.temperature,
            top_p=payload.top_p,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )

    generated_tokens = output_ids[0][inputs["input_ids"].shape[1]:]
    content = tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
    if not content:
        raise HTTPException(status_code=502, detail="The worker model returned an empty response.")
    return content


@app.get("/health")
def health(authorization: str | None = Header(default=None)) -> dict[str, str]:
    require_auth(authorization)
    return {"status": "ok", "model": HF_MODEL_ID, "device": resolve_device()}


@app.post("/generate", response_model=GenerateResponse)
def generate(payload: GenerateRequest, authorization: str | None = Header(default=None)) -> GenerateResponse:
    require_auth(authorization)
    content = generate_text(payload)
    return GenerateResponse(content=content, model=HF_MODEL_ID, device=resolve_device())
