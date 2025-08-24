import asyncio
import json

_event_queue: asyncio.Queue = asyncio.Queue()

def broadcast_event(event: dict):
    try:
        _event_queue.put_nowait(event)
    except Exception:
        pass

async def sse_event_generator():
    while True:
        event = await _event_queue.get()
        yield f"data: {json.dumps(event)}\n\n"


