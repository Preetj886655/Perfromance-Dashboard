#!/usr/bin/env python3
"""Test flexible import with non-DPR_OEE workbook."""

import sys
from pathlib import Path
from uuid import uuid4
from datetime import date

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.services.flexible_workbook_ingestion import ingest_flexible_workbook
from app.models.plant import Plant

# Use test database
DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(DATABASE_URL)

# Create all tables
from app.db.base import Base
Base.metadata.create_all(engine)

SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

# Create a test plant
test_plant = Plant(
    id=uuid4(),
    code="MEDCHAL",
    name="Medchal Plant",
    timezone="Asia/Kolkata",
    created_by="test",
)
db.add(test_plant)
db.commit()

# Test flexible import
test_file = Path(__file__).parent / "Medchal_Downtime & Prod.xlsx"

print(f"Testing flexible import with: {test_file.name}")
print(f"Plant ID: {test_plant.id}")
print()

try:
    result = ingest_flexible_workbook(
        db=db,
        file_path=test_file,
        plant_id=test_plant.id,
        import_job_id=None,
    )
    
    print("✓ Flexible import completed")
    print(f"  - Status: {result.status}")
    print(f"  - Total rows: {result.row_count}")
    print(f"  - Success count: {result.success_count}")
    print(f"  - Error count: {result.error_count}")
    print(f"  - Production record IDs: {len(result.production_record_ids)}")
    
    if result.error_summary:
        print(f"  - Errors: {result.error_summary}")
    
    # Verify external_row_key format
    if result.production_record_ids:
        from app.models.production_record import ProductionRecord
        rec = db.get(ProductionRecord, result.production_record_ids[0])
        if rec:
            print(f"  - Sample external_row_key: {rec.external_row_key}")
            print(f"    (Format validation: {'flexible:' in rec.external_row_key})")
    
    print("\n✓ Flexible import test PASSED")
    
except Exception as e:
    print(f"✗ Flexible import test FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
finally:
    db.close()
