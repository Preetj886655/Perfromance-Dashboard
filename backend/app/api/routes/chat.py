"""Manufacturing AI Chatbot API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.rbac import require_permission
from app.services.chat_service import (
    ChatRequestPayload,
    ChatResponsePayload,
    process_chat_query,
)

router = APIRouter(prefix="/api", tags=["chat"])

check_chat_access = require_permission("dashboard", "READ")


@router.post(
    "/chat",
    response_model=ChatResponsePayload,
    dependencies=[Depends(check_chat_access)],
    summary="Ask AI questions grounded in manufacturing and maintenance data",
)
def chat_endpoint(payload: ChatRequestPayload) -> ChatResponsePayload:
    try:
        return process_chat_query(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat processing failed: {exc}",
        ) from exc


@router.post(
    "/v1/chat",
    response_model=ChatResponsePayload,
    dependencies=[Depends(check_chat_access)],
    summary="Ask AI questions grounded in manufacturing and maintenance data (v1)",
)
def chat_v1_endpoint(payload: ChatRequestPayload) -> ChatResponsePayload:
    return chat_endpoint(payload)
