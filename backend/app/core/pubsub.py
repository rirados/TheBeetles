"""Redis / in-memory pub-sub adapter.

Uses real Redis when REDIS_URL is configured, otherwise falls back to a
process-local in-memory pub/sub so the app still runs without Redis installed.
This keeps the hackathon deployment story simple.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Awaitable, Callable, Dict, List, Optional

try:
    import redis.asyncio as aioredis  # type: ignore
except Exception:  # pragma: no cover
    aioredis = None  # type: ignore

from app.core.config import settings


class InMemoryPubSub:
    """Tiny in-process pub/sub bus used when Redis is unavailable."""

    def __init__(self) -> None:
        self._subscribers: Dict[str, List[Callable[[str], Awaitable[None]]]] = defaultdict(list)

    async def publish(self, channel: str, message: str) -> int:
        handlers = list(self._subscribers.get(channel, []))
        for handler in handlers:
            try:
                await handler(message)
            except Exception as exc:  # pragma: no cover - defensive
                print(f"[InMemoryPubSub] handler error on {channel}: {exc}")
        return len(handlers)

    def subscribe(self, channel: str, handler: Callable[[str], Awaitable[None]]) -> None:
        self._subscribers[channel].append(handler)

    def unsubscribe(self, channel: str, handler: Callable[[str], Awaitable[None]]) -> None:
        if handler in self._subscribers.get(channel, []):
            self._subscribers[channel].remove(handler)


class PubSubManager:
    """Unified pub/sub facade over Redis or in-memory bus."""

    def __init__(self) -> None:
        self._inmemory = InMemoryPubSub()
        self._redis: Optional["aioredis.Redis"] = None  # type: ignore
        self._use_redis = settings.USE_REDIS and aioredis is not None and bool(settings.REDIS_URL)

    async def connect(self) -> None:
        if self._use_redis and settings.REDIS_URL:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            print("[PubSub] Connected to Redis")
        else:
            print("[PubSub] Using in-memory pub/sub (Redis not configured)")

    async def disconnect(self) -> None:
        if self._redis:
            await self._redis.close()

    async def publish(self, channel: str, payload: dict) -> int:
        message = json.dumps(payload, default=str)
        if self._redis:
            return await self._redis.publish(channel, message)
        return await self._inmemory.publish(channel, message)

    def subscribe(self, channel: str, handler: Callable[[str], Awaitable[None]]) -> None:
        if self._redis:
            # For Redis we rely on the WebSocket manager to consume via pubsub()
            # directly; this method is a no-op for the in-memory path only.
            return
        self._inmemory.subscribe(channel, handler)

    def unsubscribe(self, channel: str, handler: Callable[[str], Awaitable[None]]) -> None:
        self._inmemory.unsubscribe(channel, handler)

    @property
    def redis(self):  # pragma: no cover - exposed for advanced consumers
        return self._redis


pubsub = PubSubManager()
