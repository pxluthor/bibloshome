import os
import json
import asyncio
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional, List, Dict, Any

import httpx
from httpx import AsyncClient
from openai import AsyncOpenAI


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")


class AIProvider(ABC):
    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        model: str,
        system: str = "",
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        pass

    @abstractmethod
    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        pass

    @abstractmethod
    async def list_models(self) -> list[str]:
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        pass


class OllamaProvider(AIProvider):
    def __init__(self):
        self.base_url = OLLAMA_BASE_URL

    async def chat(
        self,
        messages: list[dict],
        model: str,
        system: str = "",
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        messages_com_system = messages
        if system:
            messages_com_system = [{"role": "system", "content": system}, *messages]

        payload = {
            "model": model,
            "messages": messages_com_system,
            "stream": stream,
        }
        timeout = httpx.Timeout(120.0)

        if stream:
            async with AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        data = json.loads(line)
                        content = data.get("message", {}).get("content")
                        if content:
                            yield content
            return

        async with AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            yield response.json()["message"]["content"]

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        """Embed texts using Ollama. Tries the newer batch /api/embed endpoint first
        (Ollama >= 0.3.6); falls back to the legacy /api/embeddings for older versions."""
        timeout = httpx.Timeout(120.0)
        async with AsyncClient(timeout=timeout) as client:
            # ── Try new batch API (/api/embed, Ollama >= 0.3.6) ──────────────
            try:
                response = await client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": model, "input": texts},
                )
                if response.status_code != 404:
                    response.raise_for_status()
                    return response.json()["embeddings"]
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise

            # ── Fallback: legacy API (/api/embeddings, Ollama < 0.3.6) ──────
            # Legacy endpoint only accepts one prompt at a time
            embeddings = []
            for text in texts:
                r = await client.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": model, "prompt": text},
                )
                r.raise_for_status()
                embeddings.append(r.json()["embedding"])
            return embeddings

    async def list_models(self) -> list[str]:
        async with AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            response = await client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            return [m["name"] for m in response.json().get("models", [])]

    async def is_available(self) -> bool:
        try:
            async with AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False


class OpenAIProvider(AIProvider):
    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
        reasoning_effort: Optional[str] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/") if base_url else None
        self.temperature = temperature
        self.top_p = top_p
        self.max_tokens = max_tokens
        self.reasoning_effort = reasoning_effort
        client_options: dict[str, Any] = {"api_key": api_key}
        if self.base_url:
            client_options["base_url"] = self.base_url
        self._client = AsyncOpenAI(**client_options)

    async def chat(
        self,
        messages: list[dict],
        model: str,
        system: str = "",
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        msgs = messages
        if system:
            msgs = [{"role": "system", "content": system}, *messages]

        request_options: dict[str, Any] = {
            "model": model,
            "messages": msgs,
            "stream": stream,
        }
        if self.temperature is not None:
            request_options["temperature"] = self.temperature
        if self.top_p is not None:
            request_options["top_p"] = self.top_p
        if self.max_tokens is not None:
            request_options["max_tokens"] = self.max_tokens
        if self.reasoning_effort:
            request_options["reasoning_effort"] = self.reasoning_effort

        if stream:
            resp = await self._client.chat.completions.create(**request_options)
            async for chunk in resp:
                yield chunk.choices[0].delta.content or ""
            return

        resp = await self._client.chat.completions.create(**request_options)
        choice = resp.choices[0]
        if choice.finish_reason == "length":
            # modelos com raciocinio (ex.: gpt-oss) gastam o limite pensando e cortam a resposta
            raise ValueError(
                "Resposta cortada pelo limite de tokens do provedor. "
                "Aumente 'Max tokens' na conta (ex.: 8192) ou use 'Raciocínio: Baixo'."
            )
        yield choice.message.content or ""

    async def embed(
        self,
        texts: list[str],
        model: str = "text-embedding-3-small",
    ) -> list[list[float]]:
        response = await self._client.embeddings.create(input=texts, model=model)
        return [d.embedding for d in response.data]

    async def list_models(self) -> list[str]:
        if self.base_url:
            response = await self._client.models.list()
            return sorted(model.id for model in response.data)
        return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]

    async def is_available(self) -> bool:
        return bool(self.api_key)


def _extract_responses_text(data: Dict[str, Any]) -> str:
    """Extrai o texto de uma resposta da Responses API (Codex backend)."""
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    parts: list[str] = []
    for item in data.get("output", []) or []:
        if item.get("type") == "message":
            for c in item.get("content", []) or []:
                if c.get("type") in ("output_text", "text"):
                    parts.append(c.get("text", ""))
    return "".join(parts)


class CodexOAuthProvider(AIProvider):
    """Usa credenciais OAuth do Codex Pro (ChatGPT backend / Responses API)."""

    BACKEND_URL = "https://chatgpt.com/backend-api/codex"

    def __init__(self, token: str, account_id: Optional[str] = None):
        self.token = token
        self.account_id = account_id

    def _headers(self) -> dict:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        if self.account_id:
            headers["chatgpt-account-id"] = self.account_id
        return headers

    async def chat(
        self,
        messages: list[dict],
        model: str,
        system: str = "",
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        input_items = [
            {"role": m.get("role", "user"), "content": m.get("content", "")}
            for m in messages
        ]
        # store=False é exigido pelo backend do ChatGPT (Responses API) —
        # sem isso ele responde 400 {"detail":"Store must be set to false"}
        payload: dict = {
            "model": model,
            "input": input_items,
            "stream": stream,
            "store": False,
        }
        if system:
            payload["instructions"] = system

        timeout = httpx.Timeout(120.0)
        if stream:
            async with AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.BACKEND_URL}/responses",
                    json=payload,
                    headers=self._headers(),
                ) as response:
                    if response.status_code >= 400:
                        body = (await response.aread()).decode(errors="replace")
                        raise httpx.HTTPStatusError(
                            f"Codex API {response.status_code}: {body[:300]}",
                            request=response.request,
                            response=response,
                        )
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:"):].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            evt = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        if evt.get("type") == "response.output_text.delta":
                            delta = evt.get("delta")
                            if delta:
                                yield delta
            return

        async with AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.BACKEND_URL}/responses",
                json=payload,
                headers=self._headers(),
            )
            if response.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"Codex API {response.status_code}: {response.text[:300]}",
                    request=response.request,
                    response=response,
                )
            yield _extract_responses_text(response.json())

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        raise NotImplementedError("Codex OAuth não suporta embeddings; use Ollama.")

    async def list_models(self) -> list[str]:
        return ["gpt-5.5", "gpt-5.3-codex-spark", "gpt-4o", "gpt-4.1"]

    async def is_available(self) -> bool:
        return bool(self.token)


class ClaudeOAuthProvider(AIProvider):
    """Usa credenciais OAuth do Claude (Anthropic Messages API via token OAuth)."""

    API_URL = "https://api.anthropic.com/v1/messages"
    # A Messages API exige que o primeiro bloco de system seja a identidade do
    # Claude Code quando autenticado via token OAuth (sk-ant-oat…).
    IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude."

    def __init__(self, access_token: str, max_tokens: int = 4096):
        self.access_token = access_token
        self.max_tokens = max_tokens

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "oauth-2025-04-20",
            "Content-Type": "application/json",
        }

    def _system_blocks(self, system: str) -> list[dict]:
        blocks = [{"type": "text", "text": self.IDENTITY}]
        if system:
            blocks.append({"type": "text", "text": system})
        return blocks

    async def chat(
        self,
        messages: list[dict],
        model: str,
        system: str = "",
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        msgs = [
            {"role": m.get("role", "user"), "content": m.get("content", "")}
            for m in messages
        ]
        payload = {
            "model": model,
            "max_tokens": self.max_tokens,
            "system": self._system_blocks(system),
            "messages": msgs,
            "stream": stream,
        }

        timeout = httpx.Timeout(120.0)
        if stream:
            async with AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST", self.API_URL, json=payload, headers=self._headers()
                ) as response:
                    if response.status_code >= 400:
                        body = (await response.aread()).decode(errors="replace")
                        raise httpx.HTTPStatusError(
                            f"Claude API {response.status_code}: {body[:300]}",
                            request=response.request,
                            response=response,
                        )
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:"):].strip()
                        try:
                            evt = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        if evt.get("type") == "content_block_delta":
                            text = (evt.get("delta") or {}).get("text")
                            if text:
                                yield text
            return

        async with AsyncClient(timeout=timeout) as client:
            response = await client.post(
                self.API_URL, json=payload, headers=self._headers()
            )
            if response.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"Claude API {response.status_code}: {response.text[:300]}",
                    request=response.request,
                    response=response,
                )
            data = response.json()
            yield "".join(
                c.get("text", "")
                for c in data.get("content", []) or []
                if c.get("type") == "text"
            )

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        raise NotImplementedError("Claude OAuth não suporta embeddings; use Ollama.")

    async def list_models(self) -> list[str]:
        return [
            "claude-opus-4-8",
            "claude-sonnet-5",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001",
        ]

    async def is_available(self) -> bool:
        return bool(self.access_token)


ollama_provider = OllamaProvider()


def get_provider(
    provider: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    temperature: Optional[float] = None,
    top_p: Optional[float] = None,
    max_tokens: Optional[int] = None,
    reasoning_effort: Optional[str] = None,
) -> AIProvider:
    if provider == "openai":
        if not api_key:
            raise ValueError("OpenAI API key nao configurada")
        return OpenAIProvider(
            api_key=api_key,
            base_url=base_url,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            reasoning_effort=reasoning_effort,
        )
    return ollama_provider
