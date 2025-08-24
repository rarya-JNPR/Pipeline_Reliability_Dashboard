from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from ..services.events import sse_event_generator

router = APIRouter()

@router.get("/stream")
def stream_events():
    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")


