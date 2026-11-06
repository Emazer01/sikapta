import os
from pathlib import Path
from typing import Dict, Any, List
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from app.core.config import settings

def generate_assessment_pdf(session_data: Dict[str, Any], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0F172A'),
        alignment=1 # Center
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#D97706'),
        alignment=1 # Center
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=10,
        spaceAfter=5
    )

    cell_style = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1E293B')
    )

    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0F172A')
    )

    elements = []

    # 1. Header (Kop Surat Resmi)
    elements.append(Paragraph("SIKAPTA AI", title_style))
    elements.append(Paragraph("Sistem Inteligensi Kesamaptaan Jasmani Terpadu dan Adaptif", subtitle_style))
    elements.append(Paragraph("<i>\"Presisi Gerak, Akurasi Penilaian.\"</i>", subtitle_style))
    elements.append(Spacer(1, 6))
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0F172A'), spaceBefore=4, spaceAfter=2))
    elements.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor('#D97706'), spaceBefore=1, spaceAfter=12))

    # 2. Document Title
    elements.append(Paragraph("<b>BERITA ACARA & LAPORAN RESMI UJI KESAMAPTAAN JASMANI</b>", ParagraphStyle(
        'RepTitle', fontName='Helvetica-Bold', fontSize=13, alignment=1, textColor=colors.HexColor('#0F172A')
    )))
    elements.append(Spacer(1, 10))

    # 3. Participant & Session Meta Table
    part = session_data.get("participant", {})
    gender_code = session_data.get("gender") or part.get("gender")
    gender_label = "Laki-laki (Pria)" if gender_code == "L" else ("Perempuan (Wanita)" if gender_code == "P" else "-")
    tol_val = session_data.get("tolerance_deg", 5.0)

    dur_sec = int(session_data.get("duration_seconds", 0))
    mins = dur_sec // 60
    secs = dur_sec % 60
    duration_label = f"{dur_sec} Detik ({mins:02d}:{secs:02d})"

    exercise_name = str(session_data.get("exercise_type", "-")).upper()

    meta_table_data = [
        [
            Paragraph("Nomor Peserta / NRP", cell_bold), Paragraph(str(part.get("participant_number", "-")), cell_style),
            Paragraph("Kode Sesi Uji", cell_bold), Paragraph(str(session_data.get("session_code", "-")), cell_style)
        ],
        [
            Paragraph("Nama Lengkap", cell_bold), Paragraph(str(part.get("full_name", "-")), cell_bold),
            Paragraph("Waktu Pengujian", cell_bold), Paragraph(str(session_data.get("start_time", "-")), cell_style)
        ],
        [
            Paragraph("Satuan / Instansi", cell_bold), Paragraph(str(part.get("organization", "-")), cell_style),
            Paragraph("Jenis Tes Gerakan", cell_bold), Paragraph(f"<b>{exercise_name}</b>", cell_bold)
        ],
        [
            Paragraph("Kategori / Pangkat", cell_bold), Paragraph(str(part.get("category", "-")), cell_style),
            Paragraph("Model AI Pose", cell_bold), Paragraph(f"{str(session_data.get('model_used', '-')).upper()} (CPU)", cell_style)
        ],
        [
            Paragraph("Kategori Gender", cell_bold), Paragraph(gender_label, cell_style),
            Paragraph("Toleransi Sudut", cell_bold), Paragraph(f"±{tol_val}°", cell_style)
        ],
        [
            Paragraph("Profil Aturan", cell_bold), Paragraph(str(session_data.get("rule_profile_name", "Standar Kesamaptaan")), cell_style),
            Paragraph("Durasi Pelaksanaan", cell_bold), Paragraph(f"<b>{duration_label}</b>", cell_bold)
        ]
    ]

    meta_table = Table(meta_table_data, colWidths=[120, 145, 115, 140])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 10))

    # 4. Result Metrics Table
    ver = int(session_data.get("verified_reps", 0))
    rej = int(session_data.get("rejected_reps", 0))
    det = max(int(session_data.get("detected_reps", 0)), ver + rej)
    success_rate = round((ver / det * 100), 1) if det > 0 else 0.0

    if ver >= 35:
        predikat = "<font color='#059669'><b>SANGAT BAIK / MEMENUHI STANDAR TINGGI</b></font>"
    elif ver >= 20:
        predikat = "<font color='#10B981'><b>BAIK / MEMENUHI STANDAR</b></font>"
    elif ver > 0:
        predikat = "<font color='#D97706'><b>CUKUP / PERLU PEMBINAAN TEKNIK GERAK</b></font>"
    else:
        predikat = "<font color='#DC2626'><b>BELUM MEMENUHI STANDAR</b></font>"

    elements.append(Paragraph("Rekapitulasi Hasil Penilaian Komputer Vision", section_heading))
    metrics_data = [
        [Paragraph("Total Gerakan Terdeteksi", cell_bold), Paragraph(f"<b>{det}</b> Siklus Gerakan", cell_style)],
        [Paragraph("Repetisi Sah (Terverifikasi)", cell_bold), Paragraph(f"<font color='#059669'><b>{ver}</b></font> (Memenuhi batas sudut & validitas fleksi/ekstensi)", cell_style)],
        [Paragraph("Repetisi Tidak Sah (Ditolak)", cell_bold), Paragraph(f"<font color='#DC2626'><b>{rej}</b></font> (Tidak memenuhi puncak ekstensi atau sudut minimal)", cell_style)],
        [Paragraph("Tingkat Akurasi / Keberhasilan", cell_bold), Paragraph(f"<b>{success_rate}%</b>", cell_style)],
        [Paragraph("Predikat Evaluasi Gerakan", cell_bold), Paragraph(predikat, cell_style)],
        [Paragraph("Rata-rata FPS & Latensi AI", cell_bold), Paragraph(f"{session_data.get('avg_fps', 0.0)} FPS / {session_data.get('avg_latency_ms', 0.0)} ms", cell_style)],
        [Paragraph("Catatan Penguji / Verifikator", cell_bold), Paragraph(str(session_data.get("examiner_notes") or "Tidak ada catatan khusus"), cell_style)],
    ]
    metrics_table = Table(metrics_data, colWidths=[180, 340])
    metrics_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FFFFFF')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(metrics_table)
    elements.append(Spacer(1, 10))

    # 5. Repetition Details Table
    rep_events = session_data.get("rep_events", [])
    if rep_events:
        elements.append(Paragraph("Rincian Log Evaluasi Setiap Repetisi", section_heading))
        rep_table_data = [
            [Paragraph("Rep #", cell_bold), Paragraph("Status", cell_bold), Paragraph("Sudut Min / Puncak", cell_bold), Paragraph("Keterangan / Feedback AI", cell_bold)]
        ]
        for rep in rep_events:
            status_text = "<font color='#059669'><b>SAH</b></font>" if rep.get("status") == "verified" else "<font color='#DC2626'><b>DITOLAK</b></font>"
            angles_str = f"{rep.get('min_angle', 0.0):.1f}° / {rep.get('peak_angle', 0.0):.1f}°"
            feedback_str = rep.get("rejection_reason") or rep.get("feedback") or "Memenuhi kriteria siklus standar"
            rep_table_data.append([
                Paragraph(str(rep.get("rep_number")), cell_style),
                Paragraph(status_text, cell_style),
                Paragraph(angles_str, cell_style),
                Paragraph(feedback_str, cell_style)
            ])

        rep_table = Table(rep_table_data, colWidths=[50, 75, 115, 280])
        rep_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E2E8F0')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(rep_table)

    # 6. Signature / Verification Footer
    elements.append(Spacer(1, 20))
    date_str = session_data.get("start_time", "-")
    elements.append(Paragraph(f"Ditetapkan melalui Sistem Komputer Vision SIKAPTA AI pada: {date_str}", ParagraphStyle(
        'DateFooter', fontName='Helvetica-Oblique', fontSize=8, alignment=2, textColor=colors.HexColor('#64748B')
    )))
    elements.append(Spacer(1, 10))

    sig_data = [
        [Paragraph("Peserta Uji Yang Bersangkutan,", cell_style), Paragraph("Penguji / Tim Penilai SIKAPTA AI,", cell_style)],
        [Spacer(1, 40), Spacer(1, 40)],
        [Paragraph(f"( <b>{part.get('full_name', '................................')}</b> )<br/>NRP/NIP: {part.get('participant_number', '................')}", cell_style),
         Paragraph("( <b>................................................</b> )<br/>Petugas Penilai Resmi", cell_style)]
    ]
    sig_table = Table(sig_data, colWidths=[260, 260])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(sig_table)

    doc.build(elements)
    return output_path
