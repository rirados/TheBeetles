"""Seed initial facilities (hospitals, shelters, police/fire stations, depots)."""
from __future__ import annotations

import math
import random
from typing import List

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import db_models


def seed_facilities(db: Session) -> int:
    """Seed demo facilities spread across the bounding box."""
    lat_min, lng_min, lat_max, lng_max = settings.DEFAULT_BBOX
    presets = [
        ("Wenlock Hospital", "hospital", 0.18, 0.30, 350, "0824-2421175"),
        ("District Hospital", "hospital", 0.55, 0.55, 250, "0824-2441485"),
        ("KMC Hospital", "hospital", 0.40, 0.65, 400, "0824-2445858"),
        ("City Police Station", "police", 0.32, 0.40, None, "100"),
        ("Pandeshwar Police", "police", 0.60, 0.50, None, "0824-2442333"),
        ("Central Fire Station", "fire", 0.45, 0.42, None, "101"),
        ("Kadri Fire Station", "fire", 0.30, 0.60, None, "0824-2223777"),
        ("Town Hall Shelter", "shelter", 0.50, 0.38, 500, None),
        ("Sports Complex Shelter", "shelter", 0.22, 0.55, 800, None),
        ("School Shelter", "shelter", 0.65, 0.62, 400, None),
        ("Ambulance Depot", "depot", 0.48, 0.32, None, None),
        ("NDRF Staging", "depot", 0.20, 0.70, None, None),
    ]
    existing = {f.name for f in db.query(db_models.Facility).all()}
    added = 0
    for name, ftype, lat_p, lng_p, cap, phone in presets:
        if name in existing:
            continue
        lat = lat_min + (lat_max - lat_min) * lat_p
        lng = lng_min + (lng_max - lng_min) * lng_p
        f = db_models.Facility(
            name=name,
            facility_type=ftype,
            lat=lat,
            lng=lng,
            capacity=cap,
            phone=phone,
            address=f"Mangalore, Karnataka",
        )
        db.add(f)
        added += 1
    db.commit()
    return added


def seed_sample_incidents(db: Session, count: int = 3) -> int:
    """Seed a few sample incidents to demo the dispatch flow."""
    lat_min, lng_min, lat_max, lng_max = settings.DEFAULT_BBOX
    samples = [
        ("Stranded family at low-lying area", "Citizen reports 4 people trapped by rising water", 5),
        ("Medical emergency - elderly resident", "Cardiac symptoms, needs immediate evacuation", 4),
        ("Vehicle submerged on main road", "Car stuck in floodwater, driver on roof", 3),
    ]
    existing = db.query(db_models.Incident).count()
    if existing > 0:
        return 0
    added = 0
    for i, (title, desc, pri) in enumerate(samples[:count]):
        lat = lat_min + (lat_max - lat_min) * (0.3 + 0.1 * i)
        lng = lng_min + (lng_max - lng_min) * (0.4 + 0.08 * i)
        inc = db_models.Incident(
            title=title,
            description=desc,
            priority=pri,
            lat=lat,
            lng=lng,
            status="open",
        )
        db.add(inc)
        added += 1
    db.commit()
    return added


def seed_sample_alerts(db: Session) -> int:
    samples = [
        ("warning", "Heavy Rainfall Alert", "IMD has issued a red alert for coastal Karnataka. Expect 200mm+ rainfall over next 24h.", "Mangalore City"),
        ("critical", "Flood Warning - Netravati River", "River flowing above danger mark. Low-lying areas at risk of inundation.", "Netravati Basin"),
        ("info", "High Tide Advisory", "High tide expected at 18:30 IST. Combine with rainfall may worsen waterlogging.", "Coastal Belt"),
    ]
    existing = db.query(db_models.Alert).count()
    if existing > 0:
        return 0
    added = 0
    for sev, title, body, area in samples:
        a = db_models.Alert(severity=sev, title=title, body=body, area=area, active=True)
        db.add(a)
        added += 1
    db.commit()
    return added
