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
        async with AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            response = await client.post(
                f"{self.base_url}/api/embed",
                json={"model": model, "input": texts},
            )
            response.raise_for_status()
            return response.json()["embeddings"]

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
    def __init__(self, api_key: str):
        self.api_key = api_key
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(api_key=api_key)

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

        if stream:
            resp = await self._client.chat.completions.create(
                model=model,
                messages=msgs,
                stream=stream,
            )
            async for chunk in resp:
                yield chunk.choices[0].delta.content or ""
            return

        resp = await self._client.chat.completions.create(
            model=model,
            messages=msgs,
            stream=stream,
        )
        yield resp.choices[0].message.content

    async def embed(
        self,
        texts: list[str],
        model: str = "text-embedding-3-small",
    ) -> list[list[float]]:
        response = await self._client.embeddings.create(input=texts, model=model)
        return [d.embedding for d in response.data]

    async def list_models(self) -> list[str]:
        return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]

    async def is_available(self) -> bool:
        return bool(self.api_key)


ollama_provider = OllamaProvider()


def get_provider(provider: str, api_key: Optional[str] = None) -> AIProvider:
    if provider == "openai":
        if not api_key:
            raise ValueError("OpenAI API key nao configurada")
        return OpenAIProvider(api_key=api_key)
    return ollama_provider
