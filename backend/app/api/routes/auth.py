from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password, hash_password, create_access_token
from app.models.user import User, ROLE_DEFINITIONS, VALID_ROLES
from app.models.audit_log import AuditLog
from app.schemas.user import UserLogin, UserCreate, UserUpdate, Token, UserResponse
from app.api.deps import get_current_authenticated_user, require_admin

router = APIRouter(prefix="/auth", tags=["Authentication & Users"])


@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    identifier = login_data.username.strip()
    user = (
        db.query(User)
        .filter(or_(User.username == identifier, User.email == identifier))
        .first()
    )
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username atau kata sandi tidak sesuai"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun pengguna sedang dinonaktifkan. Hubungi Administrator."
        )

    user.last_login = datetime.now(timezone.utc)
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.username, expires_delta=access_token_expires
    )

    # Log audit
    audit = AuditLog(
        user_id=user.id,
        action="LOGIN",
        resource_type="auth",
        resource_id=str(user.id),
        details=f"Pengguna '{user.username}' ({user.role_label}) berhasil masuk"
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_authenticated_user)):
    return current_user


@router.post("/logout")
def logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_authenticated_user)
):
    audit = AuditLog(
        user_id=current_user.id,
        action="LOGOUT",
        resource_type="auth",
        resource_id=str(current_user.id),
        details=f"Pengguna '{current_user.username}' keluar dari sistem"
    )
    db.add(audit)
    db.commit()
    return {"status": "success", "message": "Berhasil keluar dari sistem"}


@router.get("/roles")
def get_roles():
    return list(ROLE_DEFINITIONS.values())


@router.get("/users", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return db.query(User).order_by(User.id.asc()).all()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if data.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Peran '{data.role}' tidak valid. Pilihan: {', '.join(VALID_ROLES)}"
        )

    existing_username = db.query(User).filter(User.username == data.username.strip()).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{data.username}' sudah terdaftar"
        )

    existing_email = db.query(User).filter(User.email == data.email.strip()).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{data.email}' sudah terdaftar"
        )

    if len(data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kata sandi minimal terdiri dari 6 karakter"
        )

    new_user = User(
        username=data.username.strip(),
        email=data.email.strip(),
        full_name=data.full_name.strip(),
        role=data.role,
        is_active=data.is_active,
        hashed_password=hash_password(data.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    audit = AuditLog(
        user_id=current_user.id,
        action="CREATE",
        resource_type="user",
        resource_id=str(new_user.id),
        details=f"Administrator membuat akun '{new_user.username}' dengan peran {new_user.role_label}"
    )
    db.add(audit)
    db.commit()

    return new_user


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Akun pengguna tidak ditemukan"
        )

    if data.role is not None:
        if data.role not in VALID_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Peran '{data.role}' tidak valid"
            )
        if target_user.id == current_user.id and data.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tidak dapat menurunkan peran Administrator akun Anda sendiri"
            )
        target_user.role = data.role

    if data.is_active is not None:
        if target_user.id == current_user.id and not data.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif"
            )
        target_user.is_active = data.is_active

    if data.email is not None:
        dup_email = (
            db.query(User)
            .filter(User.email == data.email.strip(), User.id != user_id)
            .first()
        )
        if dup_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{data.email}' sudah digunakan oleh pengguna lain"
            )
        target_user.email = data.email.strip()

    if data.full_name is not None:
        target_user.full_name = data.full_name.strip()

    if data.password is not None and data.password.strip():
        if len(data.password.strip()) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kata sandi minimal terdiri dari 6 karakter"
            )
        target_user.hashed_password = hash_password(data.password.strip())

    db.commit()
    db.refresh(target_user)

    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE",
        resource_type="user",
        resource_id=str(target_user.id),
        details=f"Administrator memperbarui akun '{target_user.username}' ({target_user.role_label})"
    )
    db.add(audit)
    db.commit()

    return target_user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Akun pengguna tidak ditemukan"
        )
    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tidak dapat menghapus akun Anda sendiri yang sedang digunakan"
        )

    username_deleted = target_user.username
    db.delete(target_user)
    db.commit()

    audit = AuditLog(
        user_id=current_user.id,
        action="DELETE",
        resource_type="user",
        resource_id=str(user_id),
        details=f"Administrator menghapus akun '{username_deleted}'"
    )
    db.add(audit)
    db.commit()
    return None


