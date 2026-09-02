#!/usr/bin/env python
"""Create a test user for dashboard verification."""

import sys
sys.path.insert(0, '.')

from app.db.session import get_session_factory
from app.core.security import hash_password
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from sqlalchemy import select

def create_test_user():
    session_factory = get_session_factory()
    db = session_factory()
    
    try:
        # Check if test user already exists
        existing = db.query(User).filter(User.email == 'alice@patil.local').first()
        if existing:
            print(f"User {existing.email} already exists")
            return
        
        # Get or create SUPER_ADMIN role
        role = db.query(Role).filter(Role.code == 'SUPER_ADMIN').first()
        if not role:
            role = Role(code='SUPER_ADMIN', name='Super Administrator', description='Full system access')
            db.add(role)
            db.flush()
        
        # Create user
        user = User(
            email='alice@patil.local',
            employee_code='EMP-1001',
            password_hash=hash_password('Secret123!'),
            is_active=True
        )
        db.add(user)
        db.flush()
        
        # Assign role
        user_role = UserRole(user_id=user.id, role_id=role.id)
        db.add(user_role)
        
        db.commit()
        print(f"Created test user: alice@patil.local with password: Secret123!")
        print(f"Employee code: EMP-1001")
        
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == '__main__':
    create_test_user()
