import math
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.samapta_event import SamaptaEvent
from app.models.event_participant import EventParticipant
from app.models.participant import Participant
from app.models.assessment_session import AssessmentSession
from app.schemas.samapta_event import (
    SamaptaEventCreate,
    SamaptaEventUpdate,
    SamaptaEventResponse,
    EventParticipantCreate,
    EventParticipantUpdate,
    EventParticipantResponse,
    BulkEventParticipantsRequest,
    BulkEventParticipantsResponse,
    DistributeWavesRequest,
    RunScoreInputRequest,
    WaveRunStartRequest,
    WaveRunControlRequest,
    WaveRunSaveRequest,
    WaveParticipantConfigRequest,
    EventRecapResponse,
    ParticipantRecapItem,
)
from app.services.assessment.wave_run_manager import wave_run_manager
from app.services.assessment.running_score import (
    calculate_run_distance,
    calculate_run_score,
    evaluate_run_category,
    calculate_calisthenics_score,
    evaluate_total_samapta,
)
from app.api.deps import require_roles

router = APIRouter(prefix="/events", tags=["Samapta Events"])


def generate_event_code(db: Session) -> str:
    today_str = datetime.now().strftime("%Y%m%d")
    prefix = f"EVT-{today_str}-"
    latest = (
        db.query(SamaptaEvent.event_code)
        .filter(SamaptaEvent.event_code.like(f"{prefix}%"))
        .order_by(SamaptaEvent.event_code.desc())
        .first()
    )
    if latest and latest[0]:
        try:
            num = int(latest[0].split("-")[-1]) + 1
        except Exception:
            num = db.query(SamaptaEvent).count() + 1
    else:
        num = 1

    candidate = f"{prefix}{num:04d}"
    while db.query(SamaptaEvent).filter(SamaptaEvent.event_code == candidate).first():
        num += 1
        candidate = f"{prefix}{num:04d}"
    return candidate


# --- 1. CRUD Samapta Events ---

@router.get("", response_model=List[SamaptaEventResponse])
def get_events(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(SamaptaEvent)
    if status_filter:
        query = query.filter(SamaptaEvent.status == status_filter)
    
    events = query.order_by(SamaptaEvent.created_at.desc()).offset(skip).limit(limit).all()
    
    result = []
    for evt in events:
        total_parts = db.query(EventParticipant).filter(EventParticipant.event_id == evt.id).count()
        evt_dict = {
            "id": evt.id,
            "event_code": evt.event_code,
            "name": evt.name,
            "location": evt.location,
            "start_date": evt.start_date,
            "end_date": evt.end_date,
            "description": evt.description,
            "track_length_meters": evt.track_length_meters,
            "total_waves": evt.total_waves,
            "status": evt.status,
            "created_at": evt.created_at,
            "updated_at": evt.updated_at,
            "total_participants": total_parts,
        }
        result.append(evt_dict)
    return result


@router.post("", response_model=SamaptaEventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    event_in: SamaptaEventCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles("admin", "event_manager"))
):
    event_code = generate_event_code(db)
    new_event = SamaptaEvent(
        event_code=event_code,
        name=event_in.name,
        location=event_in.location,
        start_date=event_in.start_date,
        end_date=event_in.end_date,
        description=event_in.description,
        track_length_meters=event_in.track_length_meters,
        total_waves=max(1, event_in.total_waves),
        status=event_in.status or "scheduled",
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    return {
        "id": new_event.id,
        "event_code": new_event.event_code,
        "name": new_event.name,
        "location": new_event.location,
        "start_date": new_event.start_date,
        "end_date": new_event.end_date,
        "description": new_event.description,
        "track_length_meters": new_event.track_length_meters,
        "total_waves": new_event.total_waves,
        "status": new_event.status,
        "created_at": new_event.created_at,
        "updated_at": new_event.updated_at,
        "total_participants": 0,
    }


@router.get("/{event_id}", response_model=SamaptaEventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")
    
    total_parts = db.query(EventParticipant).filter(EventParticipant.event_id == event.id).count()
    return {
        "id": event.id,
        "event_code": event.event_code,
        "name": event.name,
        "location": event.location,
        "start_date": event.start_date,
        "end_date": event.end_date,
        "description": event.description,
        "track_length_meters": event.track_length_meters,
        "total_waves": event.total_waves,
        "status": event.status,
        "created_at": event.created_at,
        "updated_at": event.updated_at,
        "total_participants": total_parts,
    }


@router.put("/{event_id}", response_model=SamaptaEventResponse)
def update_event(
    event_id: int,
    event_in: SamaptaEventUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles("admin", "event_manager"))
):
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    for field, value in event_in.model_dump(exclude_unset=True).items():
        setattr(event, field, value)

    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)

    total_parts = db.query(EventParticipant).filter(EventParticipant.event_id == event.id).count()
    return {
        "id": event.id,
        "event_code": event.event_code,
        "name": event.name,
        "location": event.location,
        "start_date": event.start_date,
        "end_date": event.end_date,
        "description": event.description,
        "track_length_meters": event.track_length_meters,
        "total_waves": event.total_waves,
        "status": event.status,
        "created_at": event.created_at,
        "updated_at": event.updated_at,
        "total_participants": total_parts,
    }


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles("admin", "event_manager"))
):
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")
    db.delete(event)
    db.commit()
    return None


# --- 2. Event Participants & Bulk Insert with NRP Lookup ---

@router.get("/{event_id}/participants", response_model=List[EventParticipantResponse])
def get_event_participants(
    event_id: int,
    wave_number: Optional[int] = None,
    db: Session = Depends(get_db)
):
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    query = db.query(EventParticipant).filter(EventParticipant.event_id == event_id)
    if wave_number:
        query = query.filter(EventParticipant.wave_number == wave_number)

    event_parts = query.order_by(EventParticipant.wave_number.asc(), EventParticipant.chest_number.asc()).all()

    # Pre-fetch completed sessions for this event's participants to calculate Samapta B
    part_ids = [ep.participant_id for ep in event_parts]
    sessions_by_part = {}
    if part_ids:
        completed_sessions = (
            db.query(AssessmentSession)
            .filter(
                AssessmentSession.participant_id.in_(part_ids),
                AssessmentSession.status == "completed"
            )
            .all()
        )
        for s in completed_sessions:
            sessions_by_part.setdefault(s.participant_id, []).append(s)

    results = []
    for ep in event_parts:
        part = ep.participant
        gender = (part.gender if part else "L") or "L"
        user_sessions = sessions_by_part.get(ep.participant_id, [])
        # Prioritize sessions linked to this event
        event_linked_sessions = [s for s in user_sessions if s.event_id == event_id]
        eval_sessions = event_linked_sessions if event_linked_sessions else user_sessions

        p_pullup = None
        p_pushup = None
        p_situp = None
        p_shuttle_sec = None

        for s in eval_sessions:
            ex = s.exercise_type.lower()
            if "pull" in ex:
                p_pullup = max(p_pullup or 0, s.verified_reps)
            elif "push" in ex:
                p_pushup = max(p_pushup or 0, s.verified_reps)
            elif "sit" in ex:
                p_situp = max(p_situp or 0, s.verified_reps)
            elif "shuttle" in ex:
                time_sec = None
                if s.rep_events:
                    for r in s.rep_events:
                        if r.peak_angle and r.peak_angle > 0:
                            time_sec = r.peak_angle
                if time_sec is None and s.duration_seconds and s.duration_seconds > 0:
                    time_sec = float(s.duration_seconds)
                if time_sec is not None and time_sec > 0:
                    p_shuttle_sec = min(p_shuttle_sec, time_sec) if p_shuttle_sec is not None else time_sec

        pullup_score = calculate_calisthenics_score("pullup", p_pullup, gender) if p_pullup is not None else None
        pushup_score = calculate_calisthenics_score("pushup", p_pushup, gender) if p_pushup is not None else None
        situp_score = calculate_calisthenics_score("situp", p_situp, gender) if p_situp is not None else None
        shuttlerun_score = calculate_calisthenics_score("shuttle", p_shuttle_sec, gender) if p_shuttle_sec is not None else None

        results.append({
            "id": ep.id,
            "event_id": ep.event_id,
            "participant_id": ep.participant_id,
            "chest_number": ep.chest_number,
            "vest_color": ep.vest_color,
            "wave_number": ep.wave_number,
            "group_name": ep.group_name,
            "attendance_status": ep.attendance_status,
            "run_laps": ep.run_laps,
            "run_extra_meters": ep.run_extra_meters,
            "run_total_distance_meters": ep.run_total_distance_meters,
            "run_score": ep.run_score,
            "run_notes": ep.run_notes,
            "pullup_reps": p_pullup,
            "pullup_score": pullup_score,
            "pushup_reps": p_pushup,
            "pushup_score": pushup_score,
            "situp_reps": p_situp,
            "situp_score": situp_score,
            "shuttlerun_seconds": p_shuttle_sec,
            "shuttlerun_score": shuttlerun_score,
            "created_at": ep.created_at,
            "updated_at": ep.updated_at,
            "participant": part,
        })

    return results


@router.post("/{event_id}/participants/bulk", response_model=BulkEventParticipantsResponse)
def bulk_insert_event_participants(
    event_id: int,
    payload: BulkEventParticipantsRequest,
    db: Session = Depends(get_db)
):
    """
    Bulk insert peserta ke kegiatan samapta.
    Identifikasi dengan NRP:
    - Jika peserta dengan NRP sudah ada di database, gunakan data yang ada.
    - Jika belum ada, buat peserta baru di database.
    - Daftarkan peserta ke dalam kegiatan (EventParticipant) jika belum terdaftar.
    """
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    total_processed = 0
    existing_reused = 0
    new_created = 0
    linked_count = 0
    failed_rows = 0
    errors = []

    for idx, row in enumerate(payload.participants):
        nrp_clean = row.nrp.strip() if row.nrp else ""
        if not nrp_clean:
            failed_rows += 1
            errors.append(f"Baris {idx + 1}: NRP tidak boleh kosong")
            continue

        total_processed += 1
        try:
            # 1. Cari peserta di tabel participants berdasarkan NRP (participant_number)
            participant = db.query(Participant).filter(Participant.participant_number == nrp_clean).first()
            if participant:
                existing_reused += 1
                # Update data peserta jika ada field baru yang diberikan
                if row.name and row.name.strip():
                    participant.full_name = row.name.strip()
                if row.gender and row.gender.strip():
                    participant.gender = row.gender.strip().upper()
                if row.unit:
                    participant.organization = row.unit.strip()
                if row.category:
                    participant.category = row.category.strip()
                if row.phone:
                    participant.phone = row.phone.strip()
            else:
                # Buat peserta baru di database
                participant = Participant(
                    participant_number=nrp_clean,
                    full_name=row.name.strip() if row.name else f"Peserta {nrp_clean}",
                    gender=row.gender.strip().upper() if row.gender else "L",
                    organization=row.unit.strip() if row.unit else "-",
                    category=row.category.strip() if row.category else "Umum",
                    phone=row.phone.strip() if row.phone else None,
                )
                db.add(participant)
                db.flush()  # dapatkan participant.id
                new_created += 1

            # 2. Hubungkan ke event_participants
            event_p = db.query(EventParticipant).filter(
                EventParticipant.event_id == event_id,
                EventParticipant.participant_id == participant.id
            ).first()

            if not event_p:
                event_p = EventParticipant(
                    event_id=event_id,
                    participant_id=participant.id,
                    chest_number=row.chest_number.strip() if row.chest_number else None,
                    vest_color=row.vest_color.strip() if row.vest_color else None,
                    wave_number=row.wave_number or 1,
                    attendance_status="registered",
                    run_laps=0,
                    run_extra_meters=0.0,
                    run_total_distance_meters=0.0,
                )
                db.add(event_p)
                linked_count += 1
            else:
                # Update nomor dada / warna rompi / gelombang jika disediakan
                if row.chest_number:
                    event_p.chest_number = row.chest_number.strip()
                if row.vest_color:
                    event_p.vest_color = row.vest_color.strip()
                if row.wave_number:
                    event_p.wave_number = row.wave_number

        except Exception as e:
            failed_rows += 1
            errors.append(f"Baris {idx + 1} (NRP: {nrp_clean}): {str(e)}")

    db.commit()

    return BulkEventParticipantsResponse(
        total_processed=total_processed,
        existing_participants_reused=existing_reused,
        new_participants_created=new_created,
        linked_to_event=linked_count,
        failed_rows=failed_rows,
        errors=errors
    )


@router.delete("/{event_id}/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_participant_from_event(event_id: int, participant_id: int, db: Session = Depends(get_db)):
    record = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id,
        EventParticipant.participant_id == participant_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Peserta tidak terdaftar pada kegiatan ini")
    db.delete(record)
    db.commit()
    return None


# --- 3. Auto Wave Distribution ---

@router.post("/{event_id}/distribute-waves")
def distribute_event_waves(
    event_id: int,
    request: DistributeWavesRequest,
    db: Session = Depends(get_db)
):
    """
    Membagi otomatis jumlah peserta dengan gelombang pelaksanaan.
    Menentukan peserta ada pada gelombang berapa dan nomor dada yang teratur.
    """
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    total_waves = max(1, request.total_waves)
    event.total_waves = total_waves

    participants = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id
    ).order_by(EventParticipant.id.asc()).all()

    total_p = len(participants)
    if total_p == 0:
        db.commit()
        return {
            "message": "Kegiatan belum memiliki peserta untuk dibagi ke dalam gelombang",
            "total_participants": 0,
            "total_waves": total_waves,
            "distribution": []
        }

    # Distribusi Gelombang
    distribution_summary = {w: 0 for w in range(1, total_waves + 1)}

    if request.strategy == "round_robin":
        for i, ep in enumerate(participants):
            wave = (i % total_waves) + 1
            ep.wave_number = wave
            distribution_summary[wave] += 1
            if request.auto_chest_numbers:
                ep.chest_number = f"{distribution_summary[wave]:02d}"
    else:
        # Sequential: hitung kapasitas rata-rata tiap gelombang
        base_size = total_p // total_waves
        remainder = total_p % total_waves

        current_idx = 0
        for w in range(1, total_waves + 1):
            wave_size = base_size + (1 if w <= remainder else 0)
            for wave_idx in range(wave_size):
                if current_idx < total_p:
                    ep = participants[current_idx]
                    ep.wave_number = w
                    distribution_summary[w] += 1
                    if request.auto_chest_numbers:
                        ep.chest_number = f"{wave_idx + 1:02d}"
                    current_idx += 1

    event.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "message": f"Berhasil membagi {total_p} peserta ke dalam {total_waves} gelombang pelaksanaan",
        "total_participants": total_p,
        "total_waves": total_waves,
        "distribution": [
            {"wave_number": w, "participant_count": count}
            for w, count in distribution_summary.items()
        ]
    }


# --- 4. Running Assessment (Samapta A) ---

@router.put("/{event_id}/participants/{participant_id}/run-score", response_model=EventParticipantResponse)
def submit_run_score(
    event_id: int,
    participant_id: int,
    score_data: RunScoreInputRequest,
    db: Session = Depends(get_db)
):
    """
    Input dan hitung penilaian lari:
    - Input putaran dan lebihan meter
    - Hitung total jarak = (putaran * lintasan) + lebihan
    - Hitung skor lari 12 menit standar TNI/Polri berdasarkan gender
    """
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    ep = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id,
        EventParticipant.participant_id == participant_id
    ).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan dalam kegiatan ini")

    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    gender = participant.gender if participant else "L"

    # Hitung Jarak & Skor Lari
    total_dist = calculate_run_distance(
        laps=score_data.run_laps,
        track_length_meters=event.track_length_meters,
        extra_meters=score_data.run_extra_meters
    )
    run_score = calculate_run_score(total_dist, gender=gender)

    ep.run_laps = score_data.run_laps
    ep.run_extra_meters = score_data.run_extra_meters
    ep.run_total_distance_meters = total_dist
    ep.run_score = run_score
    if score_data.run_notes is not None:
        ep.run_notes = score_data.run_notes
    ep.attendance_status = "completed" if run_score > 0 else ep.attendance_status
    ep.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(ep)
    return ep


# --- 4b. Wave Run Live Cam Assessment (Penilaian Lari Live Cam Satu Gelombang) ---

@router.post("/{event_id}/waves/{wave_number}/configure-participants")
def configure_wave_participants(
    event_id: int,
    wave_number: int,
    req: WaveParticipantConfigRequest,
    db: Session = Depends(get_db)
):
    """
    Menentukan nomor dada dan warna rompi/kaos peserta sebelum memulai tes lari.
    Data disimpan ke database terlebih dahulu sebelum sesi live cam lari diizinkan berjalan.
    """
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    updated_count = 0
    for item in req.participants:
        ep = db.query(EventParticipant).filter(
            EventParticipant.event_id == event_id,
            EventParticipant.participant_id == item.participant_id
        ).first()
        if ep:
            if item.chest_number is not None:
                ep.chest_number = item.chest_number.strip()
            if item.vest_color is not None:
                ep.vest_color = item.vest_color.strip()
            ep.wave_number = wave_number
            ep.updated_at = datetime.now(timezone.utc)
            updated_count += 1

    db.commit()
    return {
        "message": f"Berhasil menyimpan konfigurasi nomor dada dan warna rompi/kaos untuk {updated_count} peserta Gelombang {wave_number}",
        "event_id": event_id,
        "wave_number": wave_number,
        "saved_count": updated_count
    }


@router.post("/{event_id}/waves/{wave_number}/run-live/start")
def start_wave_run_live(
    event_id: int,
    wave_number: int,
    req: WaveRunStartRequest,
    db: Session = Depends(get_db)
):
    """
    Memulai sesi Live Cam penilaian lari untuk 1 gelombang penuh.
    Otomatis mendeteksi nomor dada peserta gelombang tersebut saat melewati kamera (1 putaran).
    """
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    wave_parts = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id,
        EventParticipant.wave_number == wave_number
    ).count()
    if wave_parts == 0:
        raise HTTPException(
            status_code=400,
            detail=f"Gelombang {wave_number} tidak memiliki peserta terdaftar"
        )

    session = wave_run_manager.start_or_replace_session(
        db=db,
        event_id=event_id,
        wave_number=wave_number,
        camera_id=req.camera_id,
        target_duration_seconds=req.target_duration_seconds,
        lap_cooldown_seconds=req.lap_cooldown_seconds,
        confirm_frames_required=req.confirm_frames_required,
    )
    payload = session.get_current_state_payload()
    payload.pop("frame", None)
    return payload


@router.get("/{event_id}/waves/{wave_number}/run-live/state")
def get_wave_run_live_state(
    event_id: int,
    wave_number: int,
    db: Session = Depends(get_db)
):
    session = wave_run_manager.get_session(event_id, wave_number)
    if not session:
        event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")
        event_parts = (
            db.query(EventParticipant)
            .filter(
                EventParticipant.event_id == event_id,
                EventParticipant.wave_number == wave_number
            )
            .order_by(EventParticipant.chest_number.asc(), EventParticipant.id.asc())
            .all()
        )
        participants_list = []
        for idx, ep in enumerate(event_parts):
            part = ep.participant
            participants_list.append({
                "event_participant_id": ep.id,
                "participant_id": ep.participant_id,
                "nrp": part.participant_number if part else "-",
                "full_name": part.full_name if part else f"Peserta #{ep.participant_id}",
                "gender": (part.gender if part else "L") or "L",
                "unit": (part.organization if part else "-") or "-",
                "chest_number": (ep.chest_number or f"{idx + 1:02d}").strip(),
                "vest_color": ep.vest_color or "Netral",
                "assigned_vest_color": ep.vest_color or "Netral",
                "wave_number": wave_number,
                "run_laps": ep.run_laps or 0,
                "run_extra_meters": ep.run_extra_meters or 0.0,
                "run_total_distance_meters": ep.run_total_distance_meters or 0.0,
                "run_score": ep.run_score or 0.0,
                "in_cooldown": False,
                "cooldown_remaining_seconds": 0.0,
                "recently_detected": False,
                "last_lap_time_str": None,
                "lap_history": [],
            })
        return {
            "event_id": event_id,
            "event_name": event.name,
            "wave_number": wave_number,
            "track_length_meters": event.track_length_meters,
            "status": "idle",
            "elapsed_seconds": 0,
            "target_duration_seconds": 720,
            "remaining_seconds": 720,
            "lap_cooldown_seconds": 15.0,
            "fps": 0.0,
            "participants": participants_list,
            "lap_crossing_log": [],
        }

    payload = session.get_current_state_payload()
    payload.pop("frame", None)
    return payload


@router.post("/{event_id}/waves/{wave_number}/run-live/control")
def control_wave_run_live(
    event_id: int,
    wave_number: int,
    req: WaveRunControlRequest,
):
    session = wave_run_manager.get_session(event_id, wave_number)
    if not session:
        raise HTTPException(status_code=404, detail="Sesi Live Cam Lari untuk gelombang ini tidak aktif")

    action = req.action.lower().strip()
    if action == "pause":
        session.pause()
    elif action == "resume":
        session.resume()
    elif action == "stop":
        wave_run_manager.stop_session(event_id, wave_number)
    elif action == "adjust_lap":
        if req.participant_id is None:
            raise HTTPException(status_code=400, detail="participant_id wajib diisi untuk adjust_lap")
        updated = session.adjust_lap(req.participant_id, req.delta if req.delta is not None else 1)
        if not updated:
            raise HTTPException(status_code=404, detail="Peserta tidak ditemukan dalam gelombang aktif")
    elif action == "set_extra_meters":
        if req.participant_id is None:
            raise HTTPException(status_code=400, detail="participant_id wajib diisi untuk set_extra_meters")
        updated = session.set_extra_meters(req.participant_id, req.extra_meters or 0.0)
        if not updated:
            raise HTTPException(status_code=404, detail="Peserta tidak ditemukan dalam gelombang aktif")
    else:
        raise HTTPException(status_code=400, detail=f"Action tidak dikenali: {action}")

    payload = session.get_current_state_payload()
    payload.pop("frame", None)
    return payload


@router.post("/{event_id}/waves/{wave_number}/run-live/save")
def save_wave_run_live(
    event_id: int,
    wave_number: int,
    req: WaveRunSaveRequest,
    db: Session = Depends(get_db)
):
    """
    Menyimpan resmi perolehan putaran & lebihan jarak seluruh peserta pada 1 gelombang ke database.
    """
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    session = wave_run_manager.get_session(event_id, wave_number)
    overrides = [item.model_dump() for item in req.participants] if req.participants else None

    if session:
        saved_records = session.save_to_database(db=db, overrides=overrides)
        if req.stop_session:
            wave_run_manager.stop_session(event_id, wave_number)
    else:
        # Jika sesi sudah dihentikan namun form disubmit dari UI
        saved_records = []
        if overrides:
            for ov in overrides:
                pid = ov["participant_id"]
                ep = db.query(EventParticipant).filter(
                    EventParticipant.event_id == event_id,
                    EventParticipant.participant_id == pid
                ).first()
                if ep:
                    part = ep.participant
                    gender = (part.gender if part else "L") or "L"
                    laps = max(0, int(ov["run_laps"]))
                    extra = max(0.0, float(ov["run_extra_meters"]))
                    total_dist = calculate_run_distance(laps, event.track_length_meters, extra)
                    score = calculate_run_score(total_dist, gender=gender)
                    ep.run_laps = laps
                    ep.run_extra_meters = extra
                    ep.run_total_distance_meters = total_dist
                    ep.run_score = score
                    if laps > 0 or extra > 0:
                        ep.attendance_status = "completed"
                    ep.updated_at = datetime.now(timezone.utc)
                    saved_records.append(ep)
            db.commit()

    return {
        "message": f"Berhasil menyimpan hasil lari Gelombang {wave_number} ({len(saved_records)} peserta)",
        "event_id": event_id,
        "wave_number": wave_number,
        "saved_count": len(saved_records),
    }


# --- 5. Integrated Event Recap & SIM Dashboard ---

@router.get("/{event_id}/recap", response_model=EventRecapResponse)
def get_event_recap(event_id: int, db: Session = Depends(get_db)):
    """
    Rekapitulasi lengkap Kegiatan Samapta:
    - Informasi Acara & Gelombang
    - Samapta A (Lari 12 Menit)
    - Samapta B (Pullup, Pushup, Situp dari Deteksi AI)
    - Total Nilai Akhir & Predikat Evaluasi
    """
    event = db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Kegiatan Samapta tidak ditemukan")

    event_parts = db.query(EventParticipant).filter(
        EventParticipant.event_id == event_id
    ).order_by(EventParticipant.wave_number.asc(), EventParticipant.chest_number.asc()).all()

    # Hitung ringkasan gelombang
    waves_dict = {}
    for w in range(1, event.total_waves + 1):
        waves_dict[w] = {"wave_number": w, "total": 0, "completed": 0}

    recap_items: List[ParticipantRecapItem] = []

    for ep in event_parts:
        part = ep.participant
        w_num = ep.wave_number
        if w_num not in waves_dict:
            waves_dict[w_num] = {"wave_number": w_num, "total": 0, "completed": 0}
        waves_dict[w_num]["total"] += 1

        # Samapta A (Lari)
        run_dist = ep.run_total_distance_meters
        run_score = ep.run_score
        run_pred = evaluate_run_category(run_score) if run_score is not None else None

        # Samapta B (Cari sesi penilaian AI terbaik untuk peserta ini)
        sessions_query = db.query(AssessmentSession).filter(
            AssessmentSession.participant_id == ep.participant_id,
            AssessmentSession.status == "completed"
        )
        # Prioritaskan sesi yang ditandai dengan event_id jika ada
        event_sessions = sessions_query.filter(AssessmentSession.event_id == event_id).all()
        if not event_sessions:
            event_sessions = sessions_query.all()

        pullup_reps = None
        pushup_reps = None
        situp_reps = None
        shuttlerun_seconds = None

        for s in event_sessions:
            ex = s.exercise_type.lower()
            if "pull" in ex:
                pullup_reps = max(pullup_reps or 0, s.verified_reps)
            elif "push" in ex:
                pushup_reps = max(pushup_reps or 0, s.verified_reps)
            elif "sit" in ex:
                situp_reps = max(situp_reps or 0, s.verified_reps)
            elif "shuttle" in ex:
                time_sec = None
                if s.rep_events:
                    for r in s.rep_events:
                        if r.peak_angle and r.peak_angle > 0:
                            time_sec = r.peak_angle
                if time_sec is None and s.duration_seconds and s.duration_seconds > 0:
                    time_sec = float(s.duration_seconds)
                if time_sec is not None and time_sec > 0:
                    shuttlerun_seconds = min(shuttlerun_seconds, time_sec) if shuttlerun_seconds is not None else time_sec

        gender = part.gender if part else "L"
        pullup_score = calculate_calisthenics_score("pullup", pullup_reps, gender) if pullup_reps is not None else None
        pushup_score = calculate_calisthenics_score("pushup", pushup_reps, gender) if pushup_reps is not None else None
        situp_score = calculate_calisthenics_score("situp", situp_reps, gender) if situp_reps is not None else None
        shuttlerun_score = calculate_calisthenics_score("shuttle", shuttlerun_seconds, gender) if shuttlerun_seconds is not None else None

        # Samapta B Rata-rata
        b_scores = [s for s in [pullup_score, pushup_score, situp_score, shuttlerun_score] if s is not None]
        avg_b = round(sum(b_scores) / len(b_scores), 1) if b_scores else None

        # Total Nilai Akhir
        final_score, final_pred = evaluate_total_samapta(
            score_a=run_score or 0.0,
            scores_b=b_scores
        )

        if final_score > 0:
            waves_dict[w_num]["completed"] += 1

        recap_items.append(ParticipantRecapItem(
            event_participant_id=ep.id,
            participant_id=ep.participant_id,
            nrp=part.participant_number if part else "-",
            name=part.full_name if part else f"Peserta #{ep.participant_id}",
            gender=gender,
            unit=part.organization if part else None,
            category=part.category if part else None,
            chest_number=ep.chest_number,
            wave_number=ep.wave_number,
            run_laps=ep.run_laps,
            run_extra_meters=ep.run_extra_meters,
            run_distance_meters=run_dist,
            run_score=run_score,
            run_predicate=run_pred,
            pullup_reps=pullup_reps,
            pullup_score=pullup_score,
            pushup_reps=pushup_reps,
            pushup_score=pushup_score,
            situp_reps=situp_reps,
            situp_score=situp_score,
            shuttlerun_seconds=shuttlerun_seconds,
            shuttlerun_score=shuttlerun_score,
            samapta_a_score=run_score,
            samapta_b_avg_score=avg_b,
            total_final_score=final_score if final_score > 0 else None,
            final_predicate=final_pred if final_score > 0 else None,
        ))

    event_response = SamaptaEventResponse(
        id=event.id,
        event_code=event.event_code,
        name=event.name,
        location=event.location,
        start_date=event.start_date,
        end_date=event.end_date,
        description=event.description,
        track_length_meters=event.track_length_meters,
        total_waves=event.total_waves,
        status=event.status,
        created_at=event.created_at,
        updated_at=event.updated_at,
        total_participants=len(event_parts)
    )

    return EventRecapResponse(
        event=event_response,
        total_participants=len(event_parts),
        waves=list(waves_dict.values()),
        participants=recap_items
    )
