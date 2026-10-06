from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.db.client import get_supabase
from app.schemas.models import RouteResponse
from app.services.data import get_all_routes
from app.services.ors import get_ors_routes, ORSError


router = APIRouter()


@router.get("/", response_model=list[RouteResponse])
async def list_routes(db=Depends(get_supabase)):
    """Return all pre-computed route options ordered by safety score."""
    return await get_all_routes(db)


class RoutePlanRequest(BaseModel):
    origin: list[float] = Field(min_length=2, max_length=2)
    destination: list[float] = Field(min_length=2, max_length=2)
    profile: str = "foot-walking"


@router.post("/plan")
async def plan_routes(payload: RoutePlanRequest):
    """Calculate real routes through OpenRouteService."""

    try:
        features = await get_ors_routes(
            origin=payload.origin,
            destination=payload.destination,
            profile=payload.profile,
        )

        return {
            "source": "openrouteservice",
            "profile": payload.profile,
            "routes": features,
        }

    except ORSError as exc:
        return {
            "source": "error",
            "routes": [],
            "error": str(exc),
        }