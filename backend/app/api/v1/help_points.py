from fastapi import APIRouter, Depends
from app.db.client import get_supabase
from app.schemas.models import HelpPointResponse
from app.services.data import get_help_points

router = APIRouter()

@router.get("/", response_model=list[HelpPointResponse])
async def list_help_points(db=Depends(get_supabase)):
    """Return all nearby help points (police, hospitals, help booths)."""
    return await get_help_points(db)