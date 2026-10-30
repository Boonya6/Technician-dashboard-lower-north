import os
import csv
import json
import re
import urllib.request
from datetime import datetime
from collections import Counter, defaultdict
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Install Tracking Dashboard", version="1.0.0")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
WRITABLE_DIR = "/tmp" if os.environ.get("VERCEL") else BASE_DIR
CACHE_FILE = os.path.join(WRITABLE_DIR, "data_cache.json")
REPAIR_CACHE_FILE = os.path.join(WRITABLE_DIR, "repair_data_cache.json")
CONFIG_FILE = os.path.join(WRITABLE_DIR, "config.json")
BUNDLED_CACHE_FILE = os.path.join(BASE_DIR, "data_cache.json")
BUNDLED_REPAIR_CACHE_FILE = os.path.join(BASE_DIR, "repair_data_cache.json")
BUNDLED_CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
INDEX_HTML = os.path.join(STATIC_DIR, "index.html")

DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1SqNPkmM4I3GCxfHiKbahwVyPQJhKWxk4d-mzITLtUmg/export?format=csv&gid=0"
DEFAULT_REPAIR_SHEET_URL = "https://docs.google.com/spreadsheets/d/1SqNPkmM4I3GCxfHiKbahwVyPQJhKWxk4d-mzITLtUmg/export?format=csv&gid=470684857"

# รายชื่อ 11 อำเภอของจังหวัดเพชรบูรณ์สำหรับอ้างอิงและสลับตำแหน่งอัตโนมัติ
PHETCHABUN_DISTRICTS = [
    "เมืองเพชรบูรณ์",
    "หล่มสัก",
    "หล่มเก่า",
    "เขาค้อ",
    "น้ำหนาว",
    "ชนแดน",
    "วังโป่ง",
    "หนองไผ่",
    "บึงสามพัน",
    "วิเชียรบุรี",
    "ศรีเทพ"
]

# Ensure directories exist (ignore on read-only serverless filesystems like Vercel)
try:
    os.makedirs(STATIC_DIR, exist_ok=True)
    os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
    os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)
except OSError:
    pass
if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def load_config() -> dict:
    for cfg_path in (CONFIG_FILE, BUNDLED_CONFIG_FILE):
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    if "repair_sheet_url" not in cfg:
                        cfg["repair_sheet_url"] = DEFAULT_REPAIR_SHEET_URL
                    return cfg
            except Exception:
                pass
    return {
        "sheet_url": DEFAULT_SHEET_URL,
        "repair_sheet_url": DEFAULT_REPAIR_SHEET_URL,
        "auto_sync_interval": 300
    }


def save_config(cfg: dict):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except OSError:
        pass


PHETCHABUN_AREA_ALIAS_MAP = {
    "BAN SOK": ("หล่มสัก", "บ้านโสก"),
    "BAN TIO": ("หล่มสัก", "บ้านติ้ว"),
    "BAN TOK": ("เมืองเพชรบูรณ์", "บ้านโตก"),
    "BO RANG": ("วิเชียรบุรี", "บ่อรัง"),
    "BUA WATTHANA": ("หนองไผ่", "บัววัฒนา"),
    "BUENG SAM PHAN": ("บึงสามพัน", "บึงสามพัน"),
    "CHON DAEN": ("ชนแดน", "ชนแดน"),
    "DONG MUN LEK": ("เมืองเพชรบูรณ์", "ดงมูลเหล็ก"),
    "HIN HAO": ("หล่มเก่า", "หินฮาว"),
    "HUAI RAI": ("หล่มสัก", "ห้วยไร่"),
    "HUAI YAI": ("เมืองเพชรบูรณ์", "ห้วยใหญ่"),
    "LOM KAO": ("หล่มเก่า", "หล่มเก่า"),
    "LOM SAK": ("หล่มสัก", "หล่มสัก"),
    "NA CHALIANG": ("หนองไผ่", "นาเฉลียง"),
    "NA NGUA": ("เมืองเพชรบูรณ์", "นางั่ว"),
    "NA YOM": ("เมืองเพชรบูรณ์", "นายม"),
    "NAI MUEANG": ("เมืองเพชรบูรณ์", "ในเมือง"),
    "NAM KO": ("หล่มสัก", "น้ำก้อ"),
    "PHU TOEI": ("วิเชียรบุรี", "พุเตย"),
    "SA KRUAT": ("ศรีเทพ", "สระกรวด"),
    "SA PRADU": ("วิเชียรบุรี", "สระประดู่"),
    "SADIANG": ("เมืองเพชรบูรณ์", "สะเดียง"),
    "SAP POEP": ("วังโป่ง", "ซับเปิบ"),
    "SAP SAMO THOT": ("บึงสามพัน", "ซับสมอทอด"),
    "TABO": ("เมืองเพชรบูรณ์", "ตะเบาะ"),
    "THA DAENG": ("หนองไผ่", "ท่าแดง"),
    "THA RONG": ("วิเชียรบุรี", "ท่าโรง"),
    "THUNG SAMO": ("เขาค้อ", "ทุ่งสมอ"),
    "WANG CHOMPHU": ("เมืองเพชรบูรณ์", "วังชมภู"),
    "หมู่บ้านการเคหะแห่งชาติเพชรบูรณ์": ("เมืองเพชรบูรณ์", "สะเดียง"),
    "หมู่บ้านการ์เด้น วิลล์": ("เมืองเพชรบูรณ์", "สะเดียง"),
    "หมู่บ้านชอนวิลเลจ": ("เมืองเพชรบูรณ์", "ชอนไพร"),
    "หมู่บ้านซิตี้โฮม": ("เมืองเพชรบูรณ์", "สะเดียง"),
    "หมู่บ้านบ้านเพชรชมพู": ("เมืองเพชรบูรณ์", "สะเดียง"),
    "หมู่บ้านวังชมภู พาร์ควิลล์": ("เมืองเพชรบูรณ์", "วังชมภู"),
    "หมู่บ้านศรีเทพทาวน์": ("ศรีเทพ", "สระกรวด"),
    "หมู่บ้านเพชรพฤกษา": ("เมืองเพชรบูรณ์", "สะเดียง"),
    "หมู่บ้านเพอร์เฟค เลควิว เดอะ ทาวน์เฮ้าส์": ("เมืองเพชรบูรณ์", "สะเดียง"),
    "หมู่บ้านโฮมแลนด์": ("เมืองเพชรบูรณ์", "สะเดียง"),
}


def _clean_area_token(token: str) -> str:
    if not token:
        return ""
    t = re.sub(r"^(อำเภอ|อ\.|ตำบล|ต\.)\s*", "", str(token).strip()).strip()
    t = re.sub(r"[,;]+", "", t)
    t = t.replace("เเ", "แ")
    t = re.sub(r"ุ+", "ุ", t)
    t = re.sub(r"ู+", "ู", t)
    t = re.sub(r"่+", "่", t)
    t = re.sub(r"้+", "้", t).strip()
    if t in ["เมือง", "เพชรบูรณ์"]:
        return "เมืองเพชรบูรณ์"
    if t == "ทุงสมอ":
        return "ทุ่งสมอ"
    return t


def extract_district_and_sub(val: str) -> tuple:
    if not val:
        return ("ไม่ระบุพื้นที่", "")
    s = str(val).strip()
    if s.upper() in PHETCHABUN_AREA_ALIAS_MAP:
        return PHETCHABUN_AREA_ALIAS_MAP[s.upper()]
    if s in PHETCHABUN_AREA_ALIAS_MAP:
        return PHETCHABUN_AREA_ALIAS_MAP[s]

    parts = re.split(r"\s*[-–—]\s*", s, maxsplit=1)
    p1 = _clean_area_token(parts[0]) if parts and parts[0].strip() else _clean_area_token(s)
    p2 = _clean_area_token(parts[1]) if len(parts) > 1 and parts[1].strip() else ""

    # หากชุดหน้าไม่อยู่ในรายชื่อ 11 อำเภอ แต่ชุดหลังอยู่ใน 11 อำเภอ ให้สลับเป็น (อำเภอ, ตำบล) ให้ถูกต้อง
    if p1 not in PHETCHABUN_DISTRICTS and p2 in PHETCHABUN_DISTRICTS:
        return (p2, p1)
    return (p1 or "ไม่ระบุพื้นที่", p2)


def normalize_service_event(ev: str) -> str:
    if not ev:
        return ""
    val = ev.strip()
    if val.lower() in ["new connection", "change address to"]:
        return "installation"
    return val


def fetch_sheet_csv(sheet_url: str) -> List[Dict[str, str]]:
    req = urllib.request.Request(
        sheet_url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw_bytes = resp.read()
        csv_text = raw_bytes.decode("utf-8-sig", errors="replace")

    lines = csv_text.splitlines()
    reader = csv.DictReader(lines)
    rows = []
    for idx, row in enumerate(reader):
        # Filter empty rows
        cleaned = {k.strip(): (v.strip() if v else "") for k, v in row.items() if k}
        if any(cleaned.values()):
            # เอาสถานะ ยกเลิก ออกทั้งหมด (ไม่นับเข้าสู่ระบบ)
            raw_st = cleaned.get("Status", "").strip().lower()
            if raw_st in ["cencel", "cancel", "cancelled", "ยกเลิก"]:
                continue

            cleaned["_id"] = idx + 1
            raw_area = cleaned.get("Area", "").strip()
            dist, sub = extract_district_and_sub(raw_area)
            cleaned["RawArea"] = raw_area
            cleaned["District"] = dist
            cleaned["Subdistrict"] = sub
            cleaned["Tambon"] = sub
            cleaned["Area"] = dist  # Area is normalized to district (ชุดหน้าของข้อมูล)
            
            raw_event = cleaned.get("Service Event", "").strip()
            cleaned["RawServiceEvent"] = raw_event
            cleaned["Service Event"] = normalize_service_event(raw_event)
            
            rows.append(cleaned)
    return rows


def process_metrics(rows: List[Dict[str, str]]) -> Dict[str, Any]:
    # เอาสถานะ ยกเลิก ออกทั้งหมด
    rows = [r for r in rows if r.get("Status", "").strip().lower() not in ["cencel", "cancel", "cancelled", "ยกเลิก"]]
    total_jobs = len(rows)
    if total_jobs == 0:
        return {
            "total_jobs": 0,
            "status_summary": {},
            "teams": [],
            "reason_codes": [],
            "service_events": [],
            "rows": []
        }

    # Normalize statuses (เหลือเฉพาะ Complete, Reject, Pending)
    status_counts = Counter()
    for r in rows:
        st = r.get("Status", "").strip()
        if st.lower() in ["complete", "completed", "เสร็จสิ้น", "เรียบร้อย"]:
            norm_st = "Complete"
        elif st.lower() in ["reject", "rejected", "ปฏิเสธ", "ไม่ผ่าน"]:
            norm_st = "Reject"
        elif not st:
            norm_st = "Pending"
        else:
            norm_st = "Pending"
        r["NormalizedStatus"] = norm_st
        status_counts[norm_st] += 1

    complete_cnt = status_counts.get("Complete", 0)
    reject_cnt = status_counts.get("Reject", 0)
    pending_cnt = status_counts.get("Pending", 0)
    other_cnt = pending_cnt

    complete_pct = round((complete_cnt / total_jobs) * 100, 1) if total_jobs > 0 else 0
    reject_pct = round((reject_cnt / total_jobs) * 100, 1) if total_jobs > 0 else 0
    other_pct = round((other_cnt / total_jobs) * 100, 1) if total_jobs > 0 else 0

    # Team analysis
    team_data = defaultdict(lambda: {
        "total": 0,
        "statuses": Counter(),
        "reasons": Counter(),
        "rows": []
    })

    for r in rows:
        team_name = r.get("ทีมช่างติดตั้ง", "").strip() or "ไม่ระบุทีมช่าง"
        team_data[team_name]["total"] += 1
        team_data[team_name]["statuses"][r["NormalizedStatus"]] += 1
        rs = r.get("Reason Code", "").strip()
        if rs:
            team_data[team_name]["reasons"][rs] += 1
        team_data[team_name]["rows"].append(r)

    teams_list = []
    for t_name, d in team_data.items():
        t_total = d["total"]
        t_comp = d["statuses"].get("Complete", 0)
        t_reject = d["statuses"].get("Reject", 0)
        t_comp_pct = round((t_comp / t_total) * 100, 1) if t_total > 0 else 0

        # Sort reasons for this team
        sorted_team_reasons = [
            {"reason": r, "count": c, "percentage": round((c / t_reject * 100), 1) if t_reject > 0 else 0}
            for r, c in d["reasons"].most_common()
        ]

        if t_comp_pct < 50:
            rate_tier = "low"  # Alert / Critical
        elif t_comp_pct < 75:
            rate_tier = "medium"  # Warning
        else:
            rate_tier = "high"  # Good / Excellent

        teams_list.append({
            "team_name": t_name,
            "total": t_total,
            "complete": t_comp,
            "complete_pct": t_comp_pct,
            "reject": t_reject,
            "other": t_total - (t_comp + t_reject),
            "reasons": sorted_team_reasons,
            "rate_tier": rate_tier
        })

    # Sort teams by completion percentage ascending (lowest completion first!)
    teams_list.sort(key=lambda x: (x["complete_pct"], -x["total"]))

    # Reason code analysis across all jobs
    reason_map = defaultdict(lambda: {"count": 0, "teams": Counter(), "statuses": Counter()})
    incomplete_total = reject_cnt

    for r in rows:
        rs = r.get("Reason Code", "").strip()
        if rs:
            t_name = r.get("ทีมช่างติดตั้ง", "").strip() or "ไม่ระบุช่าง"
            st = r.get("NormalizedStatus", "")
            reason_map[rs]["count"] += 1
            reason_map[rs]["teams"][t_name] += 1
            reason_map[rs]["statuses"][st] += 1

    reasons_list = []
    for r_text, d in sorted(reason_map.items(), key=lambda x: x[1]["count"], reverse=True):
        reasons_list.append({
            "reason": r_text,
            "count": d["count"],
            "pct_of_incomplete": round((d["count"] / incomplete_total) * 100, 1) if incomplete_total > 0 else 0,
            "pct_of_total": round((d["count"] / total_jobs) * 100, 1) if total_jobs > 0 else 0,
            "teams": [{"team": t, "count": c} for t, c in d["teams"].most_common()],
            "statuses": dict(d["statuses"])
        })

    # Service events breakdown
    service_events = Counter(r.get("Service Event", "").strip() for r in rows if r.get("Service Event", "").strip())
    service_events_list = [
        {"name": k, "count": v, "pct": round((v / total_jobs) * 100, 1)}
        for k, v in service_events.most_common()
    ]

    # Areas (Districts) breakdown
    areas = Counter(r.get("Area", "").strip() for r in rows if r.get("Area", "").strip())
    areas_list = [{"name": k, "count": v} for k, v in areas.most_common(12)]

    # Subdistricts (Tambons) breakdown
    subdistricts = Counter(r.get("Subdistrict", "").strip() for r in rows if r.get("Subdistrict", "").strip())
    subdistricts_list = [{"name": k, "count": v} for k, v in subdistricts.most_common()]

    # Appoint Dates breakdown
    dates_counter = Counter(r.get("Appoint Date", "").strip() for r in rows if r.get("Appoint Date", "").strip())
    dates_list = [{"date": k, "count": v} for k, v in sorted(dates_counter.items(), key=lambda x: x[0], reverse=True)]

    # Appoint Months breakdown
    months_counter = Counter(r.get("Appoint Date", "").strip()[:7] for r in rows if len(r.get("Appoint Date", "").strip()) >= 7)
    months_list = [{"month": k, "count": v} for k, v in sorted(months_counter.items(), key=lambda x: x[0], reverse=True)]

    # Years breakdown
    years_counter = Counter(r.get("Appoint Date", "").strip()[:4] for r in rows if len(r.get("Appoint Date", "").strip()) >= 4)
    years_list = [{"year": k, "count": v} for k, v in sorted(years_counter.items(), key=lambda x: x[0], reverse=True)]

    # Time-series: Daily Trend (chronological ascending)
    daily_map = defaultdict(lambda: {"total": 0, "complete": 0, "reject": 0, "other": 0})
    for r in rows:
        d_str = r.get("Appoint Date", "").strip()
        if d_str:
            daily_map[d_str]["total"] += 1
            st = r.get("NormalizedStatus", "")
            if st == "Complete": daily_map[d_str]["complete"] += 1
            elif st == "Reject": daily_map[d_str]["reject"] += 1
            else: daily_map[d_str]["other"] += 1

    daily_trend = []
    for d_str in sorted(daily_map.keys()):
        item = daily_map[d_str]
        tot = item["total"]
        daily_trend.append({
            "date": d_str,
            "total": tot,
            "complete": item["complete"],
            "complete_pct": round(item["complete"] / tot * 100, 1) if tot > 0 else 0,
            "reject": item["reject"],
            "other": item["other"]
        })

    # Time-series: Monthly Trend (chronological ascending)
    monthly_map = defaultdict(lambda: {"total": 0, "complete": 0, "reject": 0, "other": 0})
    for r in rows:
        d_str = r.get("Appoint Date", "").strip()
        if len(d_str) >= 7:
            m_str = d_str[:7]
            monthly_map[m_str]["total"] += 1
            st = r.get("NormalizedStatus", "")
            if st == "Complete": monthly_map[m_str]["complete"] += 1
            elif st == "Reject": monthly_map[m_str]["reject"] += 1
            else: monthly_map[m_str]["other"] += 1

    monthly_trend = []
    for m_str in sorted(monthly_map.keys()):
        item = monthly_map[m_str]
        tot = item["total"]
        monthly_trend.append({
            "month": m_str,
            "total": tot,
            "complete": item["complete"],
            "complete_pct": round(item["complete"] / tot * 100, 1) if tot > 0 else 0,
            "reject": item["reject"],
            "other": item["other"]
        })

    # Area detailed stats
    area_map = defaultdict(lambda: {"total": 0, "complete": 0, "reject": 0, "other": 0})
    for r in rows:
        a_str = r.get("Area", "").strip() or "ไม่ระบุพื้นที่"
        area_map[a_str]["total"] += 1
        st = r.get("NormalizedStatus", "")
        if st == "Complete": area_map[a_str]["complete"] += 1
        elif st == "Reject": area_map[a_str]["reject"] += 1
        else: area_map[a_str]["other"] += 1

    area_stats = []
    for a_name, d_item in sorted(area_map.items(), key=lambda x: x[1]["total"], reverse=True):
        area_stats.append({
            "area": a_name,
            "total": d_item["total"],
            "complete": d_item["complete"],
            "reject": d_item["reject"]
        })

    active_technicians_count = len(teams_list)
    lowest_team = teams_list[0] if teams_list else None

    return {
        "total_jobs": total_jobs,
        "complete_count": complete_cnt,
        "complete_pct": complete_pct,
        "reject_count": reject_cnt,
        "reject_pct": reject_pct,
        "other_count": other_cnt,
        "other_pct": other_pct,
        "active_technicians_count": active_technicians_count,
        "lowest_team": lowest_team,
        "years": years_list,
        "appoint_months": months_list,
        "appoint_dates": dates_list,
        "daily_trend": daily_trend,
        "monthly_trend": monthly_trend,
        "area_stats": area_stats,
        "status_distribution": {
            "Complete": complete_cnt,
            "Reject": reject_cnt,
            "Pending": pending_cnt
        },
        "teams": teams_list,
        "reason_codes": reasons_list,
        "service_events": service_events_list,
        "areas": areas_list,
        "subdistricts": subdistricts_list,
        "rows": rows
    }


def fetch_repair_sheet_csv(sheet_url: str) -> List[Dict[str, str]]:
    req = urllib.request.Request(
        sheet_url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw_bytes = resp.read()
        csv_text = raw_bytes.decode("utf-8-sig", errors="replace")

    lines = csv_text.splitlines()
    reader = csv.DictReader(lines)
    rows = []
    for idx, row in enumerate(reader):
        cleaned = {k.strip(): (v.strip() if v else "") for k, v in row.items() if k}
        if any(cleaned.values()):
            cleaned["_id"] = idx + 1

            # แยกวันที่และเวลาจาก Appoint Date เช่น "2026-10-24 15:00:00"
            raw_dt = cleaned.get("Appoint Date", "").strip()
            dt_parts = raw_dt.split()
            date_part = dt_parts[0] if dt_parts else ""
            time_part = dt_parts[1] if len(dt_parts) > 1 else ""
            cleaned["RawAppointDate"] = raw_dt
            cleaned["Appoint Date"] = date_part
            cleaned["Appoint Time"] = time_part

            # แยกอำเภอและตำบลจาก Area Name พร้อมสลับตำแหน่งอัตโนมัติตามรายชื่อ 11 อำเภอเพชรบูรณ์
            raw_area = (cleaned.get("Area Name") or cleaned.get("Area") or "").strip()
            dist, sub = extract_district_and_sub(raw_area)
            cleaned["RawArea"] = raw_area
            cleaned["District"] = dist
            cleaned["Subdistrict"] = sub
            cleaned["Tambon"] = sub
            cleaned["Area"] = dist

            # Normalize Status (Complete, Retrun, Cencel, Pending)
            st = cleaned.get("Status", "").strip()
            st_lower = st.lower()
            if st_lower in ["complete", "completed", "เสร็จสิ้น", "เรียบร้อย"]:
                norm_st = "Complete"
            elif st_lower in ["retrun", "return", "คืนงาน"]:
                norm_st = "Retrun"
            elif st_lower in ["cencel", "cancel", "cancelled", "ยกเลิก"]:
                norm_st = "Cencel"
            elif not st:
                norm_st = "Pending"
            else:
                norm_st = st
            cleaned["NormalizedStatus"] = norm_st

            # Normalize Status การซ่อม (เข้าซ่อม, ไม่เข้าซ่อม, รอดำเนินการ)
            rep_st = cleaned.get("Status การซ่อม", "").strip()
            if rep_st == "เข้าซ่อม":
                norm_rep_st = "เข้าซ่อม"
            elif rep_st == "ไม่เข้าซ่อม":
                norm_rep_st = "ไม่เข้าซ่อม"
            else:
                norm_rep_st = "รอดำเนินการ"
            cleaned["NormalizedRepairStatus"] = norm_rep_st

            rows.append(cleaned)
    return rows


def get_cached_or_fresh_repair_data(force_refresh: bool = False) -> Dict[str, Any]:
    cfg = load_config()
    repair_sheet_url = cfg.get("repair_sheet_url", DEFAULT_REPAIR_SHEET_URL)

    if not force_refresh and os.path.exists(REPAIR_CACHE_FILE):
        try:
            with open(REPAIR_CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
                return cached
        except Exception:
            pass

    try:
        rows = fetch_repair_sheet_csv(repair_sheet_url)
        data = {
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "repair_sheet_url": repair_sheet_url,
            "status": "success",
            "total_jobs": len(rows),
            "rows": rows
        }
        try:
            with open(REPAIR_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
        return data
    except Exception as e:
        for fallback_path in (REPAIR_CACHE_FILE, BUNDLED_REPAIR_CACHE_FILE):
            if os.path.exists(fallback_path):
                with open(fallback_path, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                    cached["sync_warning"] = f"Failed to sync repair sheet ({str(e)}). Displaying cached data."
                    return cached
        raise HTTPException(status_code=500, detail=f"Failed to fetch repair data: {str(e)}")


def get_cached_or_fresh_data(force_refresh: bool = False) -> Dict[str, Any]:
    cfg = load_config()
    sheet_url = cfg.get("sheet_url", DEFAULT_SHEET_URL)

    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
                return cached
        except Exception:
            pass

    # Fetch fresh
    try:
        rows = fetch_sheet_csv(sheet_url)
        metrics = process_metrics(rows)
        data = {
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "sheet_url": sheet_url,
            "status": "success",
            "metrics": metrics
        }
        try:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
        return data
    except Exception as e:
        # Fallback to cache if available
        for fallback_path in (CACHE_FILE, BUNDLED_CACHE_FILE):
            if os.path.exists(fallback_path):
                with open(fallback_path, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                    cached["sync_warning"] = f"Failed to sync with Google Sheets ({str(e)}). Displaying cached data."
                    return cached
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")


@app.get("/")
def index_page():
    if os.path.exists(INDEX_HTML):
        return FileResponse(INDEX_HTML, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    return HTMLResponse("<h1>Dashboard loading... Please create index.html</h1>")


@app.get("/api/data")
def api_get_data(month: Optional[str] = None, date: Optional[str] = None):
    data = get_cached_or_fresh_data(force_refresh=False)
    all_rows = data.get("metrics", {}).get("rows", [])
    filtered_rows = all_rows
    if month and month not in ["ALL", "all", ""]:
        filtered_rows = [r for r in filtered_rows if r.get("Appoint Date", "").strip().startswith(month.strip())]
    if date and date not in ["ALL", "all", ""]:
        filtered_rows = [r for r in filtered_rows if r.get("Appoint Date", "").strip() == date.strip()]

    if len(filtered_rows) != len(all_rows):
        filtered_metrics = process_metrics(filtered_rows)
        filtered_metrics["appoint_months"] = data.get("metrics", {}).get("appoint_months", [])
        filtered_metrics["appoint_dates"] = data.get("metrics", {}).get("appoint_dates", [])
        return JSONResponse(content={
            **data,
            "filter_month": month,
            "filter_date": date,
            "metrics": filtered_metrics
        })
    return JSONResponse(content=data)


@app.post("/api/sync")
def api_sync_data():
    data = get_cached_or_fresh_data(force_refresh=True)
    return JSONResponse(content=data)


@app.get("/api/repair/data")
def api_get_repair_data():
    data = get_cached_or_fresh_repair_data(force_refresh=False)
    return JSONResponse(content=data)


@app.post("/api/repair/sync")
def api_sync_repair_data():
    data = get_cached_or_fresh_repair_data(force_refresh=True)
    return JSONResponse(content=data)


class SettingsPayload(BaseModel):
    sheet_url: Optional[str] = None
    repair_sheet_url: Optional[str] = None
    auto_sync_interval: Optional[int] = None


@app.post("/api/settings")
def api_update_settings(payload: SettingsPayload):
    cfg = load_config()
    if payload.sheet_url:
        cfg["sheet_url"] = payload.sheet_url.strip()
    if payload.repair_sheet_url:
        cfg["repair_sheet_url"] = payload.repair_sheet_url.strip()
    if payload.auto_sync_interval is not None:
        cfg["auto_sync_interval"] = payload.auto_sync_interval
    save_config(cfg)
    # Refresh cache with new URL
    data = get_cached_or_fresh_data(force_refresh=True)
    return JSONResponse(content={"status": "updated", "config": cfg, "data": data})


@app.get("/api/health")
def api_health():
    return {"status": "ok", "time": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    # Pre-fetch cache upon starting
    try:
        print("[INIT] Fetching initial data from Google Sheets...")
        get_cached_or_fresh_data(force_refresh=True)
        get_cached_or_fresh_repair_data(force_refresh=True)
        print("[INIT] Data fetched and cached successfully.")
    except Exception as err:
        print(f"[INIT WARNING] Could not fetch initial data: {err}")

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
