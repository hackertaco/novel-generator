"""Unified LLM client using ouroboros when available."""

import os

# Check if ouroboros is available
_OUROBOROS_AVAILABLE = False
try:
    from ouroboros.providers.litellm_adapter import LiteLLMAdapter
    from ouroboros.providers.base import CompletionConfig, Message, MessageRole
    _OUROBOROS_AVAILABLE = True
except ImportError:
    pass


def _get_provider() -> str:
    """Detect which LLM provider to use based on available API keys."""
    if os.environ.get("ZAI_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "zai"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OPENROUTER_API_KEY"):
        return "openrouter"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    return "zai"  # Default, will fail if no key


async def call_llm(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> str:
    """Call LLM using available provider.

    Args:
        prompt: User prompt
        system: System prompt (optional)
        model: Model to use (auto-detected based on provider if not specified)
        temperature: Sampling temperature
        max_tokens: Max tokens to generate

    Returns:
        Generated text content
    """
    provider = _get_provider()

    # Default model based on provider
    if not model:
        model = os.environ.get("NOVEL_MODEL")
        if not model:
            if provider == "zai":
                model = "claude-sonnet-4-20250514"
            elif provider == "anthropic":
                model = "claude-3-5-sonnet-20241022"
            elif provider == "openrouter":
                model = "openrouter/anthropic/claude-3-5-sonnet"
            else:
                model = "gpt-4o"

    # Use z.ai directly (Anthropic-compatible API)
    if provider == "zai":
        return await _call_with_zai(prompt, system, model, temperature, max_tokens)

    # Use litellm for other providers
    if _OUROBOROS_AVAILABLE:
        return await _call_with_ouroboros(prompt, system, model, temperature, max_tokens)
    else:
        return await _call_with_litellm(prompt, system, model, temperature, max_tokens)


async def _call_with_ouroboros(
    prompt: str,
    system: str | None,
    model: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Call using ouroboros LiteLLMAdapter."""
    from ouroboros.providers.litellm_adapter import LiteLLMAdapter
    from ouroboros.providers.base import CompletionConfig, Message, MessageRole

    adapter = LiteLLMAdapter(timeout=300.0)

    messages = []
    if system:
        messages.append(Message(role=MessageRole.SYSTEM, content=system))
    messages.append(Message(role=MessageRole.USER, content=prompt))

    result = await adapter.complete(
        messages=messages,
        config=CompletionConfig(
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        ),
    )

    if result.is_ok:
        return result.value.content
    else:
        raise RuntimeError(f"LLM 호출 실패: {result.error}")


async def _call_with_litellm(
    prompt: str,
    system: str | None,
    model: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Call using litellm directly."""
    import litellm

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await litellm.acompletion(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=300.0,
    )

    return response.choices[0].message.content


async def _call_with_zai(
    prompt: str,
    system: str | None,
    model: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Call using z.ai Anthropic-compatible API."""
    import httpx

    api_key = os.environ.get("ZAI_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")
    base_url = os.environ.get("ANTHROPIC_BASE_URL", "https://api.z.ai/api/anthropic")

    if not api_key:
        raise RuntimeError("ZAI_API_KEY 또는 ANTHROPIC_AUTH_TOKEN 환경변수 필요")

    messages = [{"role": "user", "content": prompt}]

    request_body = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": messages,
    }

    if system:
        request_body["system"] = system

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            f"{base_url}/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=request_body,
        )
        response.raise_for_status()
        data = response.json()

    return data["content"][0]["text"]
