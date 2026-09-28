#!/usr/bin/env python3
"""
One place for every Claude call in the project (official Anthropic SDK):
  • fetch_nepse.py        index fallback when every public source fails
  • secure_server.py      /api/claude — the dashboard's AI analysis, with the
                          key kept on this PC (never sent to the browser)

Credentials: ANTHROPIC_API_KEY (or an `ant auth login` profile).
Model: CLAUDE_MODEL overrides the default.
"""
import os

MODEL      = os.getenv('CLAUDE_MODEL', 'claude-opus-5')
MAX_TOKENS = 16000                  # adaptive thinking shares this budget
WEB_SEARCH = {'type': 'web_search_20260209', 'name': 'web_search'}
MAX_CONTINUATIONS = 4               # web search can pause a long turn (pause_turn)


class ClaudeError(Exception):
    pass


def ask(system, content, web_search=False, max_uses=6, timeout=300):
    """One user turn → the reply text. `content` is a string or a list of
    text/image blocks. Raises ClaudeError with a readable message."""
    try:
        import anthropic
    except ImportError:
        raise ClaudeError('the anthropic package is not installed (pip install -r scripts/requirements.txt)')
    try:
        client = anthropic.Anthropic(timeout=timeout)
    except anthropic.AnthropicError as e:          # e.g. no credentials configured
        raise ClaudeError(f'no Anthropic credentials — set ANTHROPIC_API_KEY ({e})')
    messages = [{'role': 'user', 'content': content}]
    kwargs = {'model': MODEL, 'max_tokens': MAX_TOKENS, 'system': system, 'messages': messages,
              # a policy decline is re-run server-side on Anthropic's recommended model
              'betas': ['server-side-fallback-2026-07-01'], 'extra_body': {'fallbacks': 'default'}}
    if web_search:
        kwargs['tools'] = [{**WEB_SEARCH, 'max_uses': max_uses}]
    try:
        r = client.beta.messages.create(**kwargs)
        for _ in range(MAX_CONTINUATIONS):
            if r.stop_reason != 'pause_turn':
                break
            # resume the paused server-side search: resend the turn as it stands
            kwargs['messages'] = messages + [{'role': 'assistant', 'content': r.content}]
            r = client.beta.messages.create(**kwargs)
    except anthropic.AuthenticationError:
        raise ClaudeError('no valid Anthropic API key — set ANTHROPIC_API_KEY on the machine running this')
    except anthropic.RateLimitError:
        raise ClaudeError('Anthropic rate limit reached — try again in a minute')
    except anthropic.APIStatusError as e:
        raise ClaudeError(f'Anthropic API error {e.status_code}: {e.message}')
    except anthropic.APIConnectionError:
        raise ClaudeError('could not reach the Anthropic API (network)')
    if r.stop_reason == 'refusal':
        raise ClaudeError('Claude declined this request')
    text = ''.join(b.text for b in r.content if b.type == 'text')
    if not text.strip():
        raise ClaudeError(f'empty reply (stop reason {r.stop_reason})')
    return text
