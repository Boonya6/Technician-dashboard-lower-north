/**
 * Install Performance Dashboard
 * Frontend Engine matching Reference Mockup:
 * - 2-Tab Navigation (Trend Summary vs Jobs Monitor)
 * - Daily vs Monthly Performance Trend Line Chart
 * - Status Share Donut, By Area Stacked Bar, Technician Ranking Bar
 * - Dynamic Multi-filter Toolbar & KPI Cards
 */

// Global State
let dashboardData = null;
let allRows = [];
let filteredRows = [];
let currentPage = 1;
let rowsPerPage = 10;
let autoSyncTimer = null;
let autoSyncSecondsLeft = 0;
let countdownInterval = null;

// Tab & Mode State
let currentTab = "trend"; // "trend" | "monitor" | "productivity"
let trendTimeMode = "daily"; // "daily" | "monthly"
let trendTeamFilter = "ALL";
let dailyLogFilter = "all"; // "all" | "gt2" | "lte2"

// Chart Instances
let trendLineChart = null;
let statusDonutChart = null;
let areaBreakdownChart = null;
let techRankingChart = null;
let techProductivityChart = null;
let dailyTargetDonutChart = null;
let reasonDonutTrendChart = null;
let reasonDonutMonitorChart = null;

const REASON_DONUT_COLORS = [
    "#ef4444", // #1 Red
    "#f97316", // #2 Orange
    "#f59e0b", // #3 Amber
    "#ec4899", // #4 Pink
    "#8b5cf6", // #5 Violet
    "#3b82f6", // #6 Blue
    "#06b6d4", // #7 Cyan
    "#94a3b8"  // #8 Slate (Others)
];

// Filter Toolbar State
let filterYear = "ALL";
let filterMonth = "ALL";
let filterDate = "ALL";
let filterStatus = "ALL";
let filterArea = "ALL";
let filterSubdistrict = "ALL";
let filterTeam = "ALL";
let filterEvent = "ALL";
let searchQuery = "";

// Thai Month Names Helper
const THAI_MONTH_NAMES = {
    "01": "มกราคม", "02": "กุมภาพันธ์", "03": "มีนาคม", "04": "เมษายน",
    "05": "พฤษภาคม", "06": "มิถุนายน", "07": "กรกฎาคม", "08": "สิงหาคม",
    "09": "กันยายน", "10": "ตุลาคม", "11": "พฤศจิกายน", "12": "ธันวาคม"
};

const THAI_MONTH_SHORT = {
    "01": "ม.ค.", "02": "ก.พ.", "03": "มี.ค.", "04": "เม.ย.",
    "05": "พ.ค.", "06": "มิ.ย.", "07": "ก.ค.", "08": "ส.ค.",
    "09": "ก.ย.", "10": "ต.ค.", "11": "พ.ย.", "12": "ธ.ค."
};

function formatMonthTitle(ym) {
    if (!ym || ym === "ALL") return "ทุกเดือน";
    const parts = ym.split("-");
    if (parts.length < 2) return ym;
    const mName = THAI_MONTH_NAMES[parts[1]] || parts[1];
    return `${mName} ${parts[0]}`;
}

function formatDateShortThai(dStr) {
    if (!dStr) return "-";
    const parts = dStr.split("-");
    if (parts.length === 3) {
        const m = THAI_MONTH_SHORT[parts[1]] || parts[1];
        return `${parseInt(parts[2])} ${m}`;
    }
    return dStr;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// รายชื่อ 11 อำเภอของจังหวัดเพชรบูรณ์ สำหรับอ้างอิงและสลับตำแหน่ง อำเภอ-ตำบล ให้ถูกต้องอัตโนมัติ
const PHETCHABUN_DISTRICTS = new Set([
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
]);

let currentMainPage = "install"; // "install" | "repair"
let isDashboardInitialized = false;

// Initialization (supports both standard browser DOMContentLoaded and Google Apps Script HtmlService iframe)
function initDashboardApp() {
    if (isDashboardInitialized) return;
    isDashboardInitialized = true;
    initLucide();
    setupTabNavigation();
    setupEventListeners();
    setupRepairEventListeners();
    loadDashboardData();
    loadRepairDashboardData();
    setupAutoSync(300);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboardApp);
} else {
    setTimeout(initDashboardApp, 0);
}
window.addEventListener("load", initDashboardApp);

function initLucide() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Global function to switch Page 1 (งานติดตั้ง) sub-tabs ("trend" | "monitor" | "productivity")
function switchInstallTab(tabName) {
    currentTab = tabName;
    const btnTrend = document.getElementById("nav-btn-trend");
    const btnMonitor = document.getElementById("nav-btn-monitor");
    const btnProductivity = document.getElementById("nav-btn-productivity");
    const viewTrend = document.getElementById("view-trend-section");
    const viewMonitor = document.getElementById("view-monitor-section");
    const viewProductivity = document.getElementById("view-productivity-section");

    if (btnTrend) btnTrend.classList.toggle("active", tabName === "trend");
    if (btnMonitor) btnMonitor.classList.toggle("active", tabName === "monitor");
    if (btnProductivity) btnProductivity.classList.toggle("active", tabName === "productivity");

    if (viewTrend) viewTrend.classList.toggle("hidden", tabName !== "trend");
    if (viewMonitor) viewMonitor.classList.toggle("hidden", tabName !== "monitor");
    if (viewProductivity) viewProductivity.classList.toggle("hidden", tabName !== "productivity");

    setTimeout(() => {
        if (dashboardData) {
            const metrics = computeCurrentMetrics(filteredRows);
            if (tabName === "trend") {
                renderTrendCharts(metrics);
            } else if (tabName === "monitor") {
                renderReasonCodesAnalysis(metrics.reason_codes, metrics.reject_count);
            } else if (tabName === "productivity") {
                renderProductivityView(metrics);
            }
        }
        initLucide();
    }, 50);
}

// Setup Top Tabs Navigation
function setupTabNavigation() {
    const btnInstallMain = document.getElementById("sidebar-btn-install");
    const btnRepairMain = document.getElementById("sidebar-btn-repair");
    if (btnInstallMain) btnInstallMain.addEventListener("click", () => switchMainPage("install"));
    if (btnRepairMain) btnRepairMain.addEventListener("click", () => switchMainPage("repair"));

    const btnTrend = document.getElementById("nav-btn-trend");
    const btnMonitor = document.getElementById("nav-btn-monitor");
    const btnProductivity = document.getElementById("nav-btn-productivity");
    if (btnTrend) btnTrend.addEventListener("click", () => switchInstallTab("trend"));
    if (btnMonitor) btnMonitor.addEventListener("click", () => switchInstallTab("monitor"));
    if (btnProductivity) btnProductivity.addEventListener("click", () => switchInstallTab("productivity"));

    for (let i = 1; i <= 6; i++) {
        const rBtn = document.getElementById(`repair-nav-btn-${i}`);
        if (rBtn) rBtn.addEventListener("click", () => switchRepairTab(i));
    }

    // Productivity Daily Log Filter Buttons
    const btnDailyAll = document.getElementById("btn-filter-daily-all");
    const btnDailyGt2 = document.getElementById("btn-filter-daily-gt2");
    const btnDailyLte2 = document.getElementById("btn-filter-daily-lte2");

    if (btnDailyAll && btnDailyGt2 && btnDailyLte2) {
        btnDailyAll.addEventListener("click", () => {
            dailyLogFilter = "all";
            updateDailyLogFilterButtons();
            if (dashboardData) {
                const metrics = computeCurrentMetrics(filteredRows);
                renderDailyLogTable(metrics.productivity.daily_logs);
            }
        });
        btnDailyGt2.addEventListener("click", () => {
            dailyLogFilter = "gt2";
            updateDailyLogFilterButtons();
            if (dashboardData) {
                const metrics = computeCurrentMetrics(filteredRows);
                renderDailyLogTable(metrics.productivity.daily_logs);
            }
        });
        btnDailyLte2.addEventListener("click", () => {
            dailyLogFilter = "lte2";
            updateDailyLogFilterButtons();
            if (dashboardData) {
                const metrics = computeCurrentMetrics(filteredRows);
                renderDailyLogTable(metrics.productivity.daily_logs);
            }
        });
    }

    // Daily / Monthly Toggle Buttons on Trend Chart
    const btnDaily = document.getElementById("btn-toggle-daily");
    const btnMonthly = document.getElementById("btn-toggle-monthly");
    const matrixModeLabel = document.getElementById("matrix-mode-label");

    if (btnDaily && btnMonthly) {
        btnDaily.addEventListener("click", () => {
            trendTimeMode = "daily";
            btnDaily.classList.add("active");
            btnMonthly.classList.remove("active");
            if (matrixModeLabel) matrixModeLabel.textContent = "รายวัน";
            const metrics = computeCurrentMetrics(filteredRows);
            renderTrendLineChart(metrics);
            renderMatrixTable(metrics);
        });

        btnMonthly.addEventListener("click", () => {
            trendTimeMode = "monthly";
            btnMonthly.classList.add("active");
            btnDaily.classList.remove("active");
            if (matrixModeLabel) matrixModeLabel.textContent = "รายเดือน";
            const metrics = computeCurrentMetrics(filteredRows);
            renderTrendLineChart(metrics);
            renderMatrixTable(metrics);
        });
    }

    // Team Filter on Trend Chart
    const trendTeamSelect = document.getElementById("trend-team-filter");
    if (trendTeamSelect) {
        trendTeamSelect.addEventListener("change", (e) => {
            trendTeamFilter = e.target.value;
            const metrics = computeCurrentMetrics(filteredRows);
            renderTrendLineChart(metrics);
            renderMatrixTable(metrics);
        });
    }
}

function updateDailyLogFilterButtons() {
    const btnDailyAll = document.getElementById("btn-filter-daily-all");
    const btnDailyGt2 = document.getElementById("btn-filter-daily-gt2");
    const btnDailyLte2 = document.getElementById("btn-filter-daily-lte2");

    if (btnDailyAll) {
        btnDailyAll.className = dailyLogFilter === "all"
            ? "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-blue-600 shadow-sm"
            : "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
    }
    if (btnDailyGt2) {
        btnDailyGt2.className = dailyLogFilter === "gt2"
            ? "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-emerald-600 shadow-sm"
            : "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
    }
    if (btnDailyLte2) {
        btnDailyLte2.className = dailyLogFilter === "lte2"
            ? "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-rose-600 shadow-sm"
            : "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
    }
}

// Handle loaded data from Backend API, Google Apps Script, or direct fallback
// Apps Script server functions return a JSON string (safest for google.script.run serialization)
function parseServerPayload(data) {
    if (typeof data === "string") {
        try {
            return JSON.parse(data);
        } catch (e) {
            return { status: "error", message: "อ่านข้อมูลจากเซิร์ฟเวอร์ไม่ได้ (JSON ไม่ถูกต้อง): " + e.message, rows: [] };
        }
    }
    return data;
}

// Persistent on-screen error banner (stays visible until dismissed, unlike the 3-second toast)
function showFatalBanner(message) {
    let banner = document.getElementById("app-fatal-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "app-fatal-banner";
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#b91c1c;color:#fff;padding:10px 16px;font:13px/1.5 sans-serif;white-space:pre-wrap;box-shadow:0 2px 8px rgba(0,0,0,.3)";
        document.body.appendChild(banner);
    }
    const line = document.createElement("div");
    line.textContent = "⚠️ " + message;
    banner.appendChild(line);
}

function handleDataLoaded(data, forceSync = false) {
    const syncIcon = document.getElementById("sync-icon");
    const syncText = document.getElementById("sync-status-text");
    data = parseServerPayload(data);
    try {
        if (!data || data.status === "error") {
            throw new Error(data ? data.message : "ไม่สามารถดึงข้อมูลได้");
        }
        dashboardData = data;
        const rawRows = (data.metrics && data.metrics.rows) || data.rows || [];

        // เอาสถานะ ยกเลิก ออกทั้งหมด
        allRows = rawRows.filter(r => {
            const st = (r["Status"] || "").trim().toLowerCase();
            return !["cencel", "cancel", "cancelled", "ยกเลิก"].includes(st);
        });

        // Normalize rows status & district
        allRows.forEach(r => {
            let st = (r["Status"] || "").trim();
            if (st.toLowerCase() in { "complete": 1, "completed": 1, "เสร็จสิ้น": 1, "เรียบร้อย": 1 }) st = "Complete";
            else if (st.toLowerCase() in { "reject": 1, "rejected": 1, "ปฏิเสธ": 1, "ไม่ผ่าน": 1 }) st = "Reject";
            else st = "Pending";
            r.NormalizedStatus = st;

            // Extract District (ชุดหน้าของข้อมูล เช่น เขาค้อ - แคมป์สน -> เขาค้อ)
            const rawArea = (r.RawArea || r.Area || "").trim();
            const { district, subdistrict } = parseDistrictAndSub(rawArea);
            r.RawArea = rawArea;
            r.District = district;
            r.Subdistrict = subdistrict || r.Subdistrict || "";
            r.Area = district;

            // Normalize Service Event (New Connection = installation, Change Address To = installation)
            const rawEv = (r.RawServiceEvent || r["Service Event"] || "").trim();
            r.RawServiceEvent = rawEv;
            r["Service Event"] = normalizeServiceEvent(rawEv);
        });

        // Update dropdown options while preserving all current filter selections
        populateToolbarDropdowns(data.metrics);

        // Apply filters with the user's active filter selections (DO NOT reset filters)
        applyAllFilters();

        // Update Header Timestamps
        const timeEl = document.getElementById("header-last-updated");
        if (timeEl) {
            timeEl.textContent = data.last_updated ? data.last_updated.slice(11) : new Date().toLocaleTimeString('th-TH');
        }

        const badgeTotal = document.getElementById("header-total-badge");
        if (badgeTotal && currentMainPage === "install") {
            badgeTotal.textContent = `(${allRows.length} งานติดตั้ง)`;
        }
        const sideBadgeInstall = document.getElementById("sidebar-badge-install");
        if (sideBadgeInstall) {
            sideBadgeInstall.textContent = allRows.length;
        }

        if (syncText) syncText.textContent = "ซิงค์ข้อมูล";
        if (forceSync) {
            showToast("ซิงค์ข้อมูลล่าสุดสำเร็จ", "success");
        }
    } catch (error) {
        console.error("Failed to sync dashboard data:", error);
        if (syncText) syncText.textContent = "ซิงค์ข้อมูล";
        showToast("ไม่สามารถซิงค์ข้อมูลได้: " + error.message, "error");
        showFatalBanner("โหลดข้อมูลงานติดตั้งไม่สำเร็จ: " + error.message);
    } finally {
        if (syncIcon) syncIcon.classList.remove("spin-anim");
        initLucide();
    }
}

// JSONP fallback for Google Sheets (works inside Google Apps Script sandboxed iframes without CORS or OAuth)
function fetchSheetViaJsonp(gid = "0") {
    return new Promise((resolve, reject) => {
        const cbName = "__gvizCallback_" + gid + "_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
        const script = document.createElement("script");
        const timer = setTimeout(() => {
            delete window[cbName];
            if (script.parentNode) script.parentNode.removeChild(script);
            reject(new Error("หมดเวลาเชื่อมต่อ Google Sheet (JSONP Timeout)"));
        }, 15000);

        window[cbName] = function(resp) {
            clearTimeout(timer);
            delete window[cbName];
            if (script.parentNode) script.parentNode.removeChild(script);
            try {
                if (!resp || !resp.table || !resp.table.cols) {
                    throw new Error("รูปแบบข้อมูล gviz ไม่ถูกต้อง");
                }
                const headers = resp.table.cols.map(c => (c && c.label ? String(c.label).trim() : ""));
                const rawRows = resp.table.rows || [];
                const rows = [];
                let lastSeenDate = "";
                for (let i = 0; i < rawRows.length; i++) {
                    const cells = (rawRows[i] && rawRows[i].c) || [];
                    const rowObj = { _id: i + 1 };
                    let hasVal = false;
                    for (let j = 0; j < headers.length; j++) {
                        const h = headers[j];
                        if (!h) continue;
                        const cell = cells[j];
                        let val = "";
                        if (cell !== null && cell !== undefined) {
                            if (cell.f !== undefined && cell.f !== null) {
                                val = String(cell.f).trim();
                            } else if (cell.v !== undefined && cell.v !== null) {
                                val = String(cell.v).trim();
                            }
                        }
                        if (val) hasVal = true;
                        rowObj[h] = val;
                    }
                    if (!hasVal) continue;
                    if (rowObj["Appoint Date"]) {
                        lastSeenDate = rowObj["Appoint Date"];
                    } else if (lastSeenDate && (rowObj["CCID"] || rowObj["ทีมช่างติดตั้ง"] || rowObj["ทีมช่าง"])) {
                        rowObj["Appoint Date"] = lastSeenDate;
                    }
                    rows.push(rowObj);
                }
                resolve({
                    status: "success",
                    last_updated: new Date().toLocaleString("th-TH"),
                    rows: rows
                });
            } catch (err) {
                reject(err);
            }
        };

        script.onerror = function() {
            clearTimeout(timer);
            delete window[cbName];
            if (script.parentNode) script.parentNode.removeChild(script);
            reject(new Error("ไม่สามารถโหลดข้อมูลผ่าน JSONP ได้"));
        };

        script.src = "https://docs.google.com/spreadsheets/d/1SqNPkmM4I3GCxfHiKbahwVyPQJhKWxk4d-mzITLtUmg/gviz/tq?tqx=responseHandler:" + cbName + "&gid=" + encodeURIComponent(gid);
        document.head.appendChild(script);
    });
}

// Fetch Data from Google Apps Script, Backend API, or direct fallback (Sync Data)
async function loadDashboardData(forceSync = false) {
    const syncIcon = document.getElementById("sync-icon");
    const syncText = document.getElementById("sync-status-text");

    if (syncIcon) syncIcon.classList.add("spin-anim");
    if (syncText) syncText.textContent = forceSync ? "กำลังซิงค์..." : "กำลังโหลด...";

    // 1. Google Apps Script Web App environment
    if (typeof google !== "undefined" && google.script && google.script.run) {
        google.script.run
            .withSuccessHandler(async function(raw) {
                const data = parseServerPayload(raw);
                const rowsList = (data && data.metrics && data.metrics.rows) || (data && data.rows) || [];
                if (!data || data.status === "error" || rowsList.length === 0) {
                    console.warn("Apps Script getDashboardData returned empty/error, falling back to JSONP...", data);
                    try {
                        const jsonpData = await fetchSheetViaJsonp("0");
                        handleDataLoaded(jsonpData, forceSync);
                        return;
                    } catch (jpErr) {
                        console.error("JSONP fallback failed:", jpErr);
                    }
                }
                handleDataLoaded(data, forceSync);
            })
            .withFailureHandler(async function(err) {
                console.warn("Apps Script getDashboardData failed, falling back to JSONP:", err);
                try {
                    const jsonpData = await fetchSheetViaJsonp("0");
                    handleDataLoaded(jsonpData, forceSync);
                } catch (jpErr) {
                    if (syncText) syncText.textContent = "ซิงค์ข้อมูล";
                    if (syncIcon) syncIcon.classList.remove("spin-anim");
                    const msg = (err && err.message) ? err.message : String(err);
                    showFatalBanner("เรียก getDashboardData() บน Apps Script ไม่สำเร็จ: " + msg);
                }
            })
            .getDashboardData();
        return;
    }

    // 2. FastAPI Backend or direct CSV / JSONP fallback
    try {
        const url = forceSync ? "/api/sync" : "/api/data";
        const method = forceSync ? "POST" : "GET";
        let data;
        try {
            const response = await fetch(url, { method });
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            data = await response.json();
        } catch (netErr) {
            try {
                const fb = await fetchDirectGoogleSheet();
                data = await fb.json();
            } catch (csvErr) {
                data = await fetchSheetViaJsonp("0");
            }
        }

        handleDataLoaded(data, forceSync);
    } catch (error) {
        console.error("Failed to sync dashboard data:", error);
        if (syncText) syncText.textContent = "ซิงค์ข้อมูล";
        if (syncIcon) syncIcon.classList.remove("spin-anim");
        showToast("ไม่สามารถซิงค์ข้อมูลได้: " + error.message, "error");
        initLucide();
    }
}

// แผนที่จับคู่ชื่อภาษาอังกฤษ / หมู่บ้าน / ตำบลเดี่ยว -> (อำเภอ, ตำบล) ของจังหวัดเพชรบูรณ์
const PHETCHABUN_AREA_ALIAS_MAP = {
    "BAN SOK": { district: "หล่มสัก", subdistrict: "บ้านโสก" },
    "BAN TIO": { district: "หล่มสัก", subdistrict: "บ้านติ้ว" },
    "BAN TOK": { district: "เมืองเพชรบูรณ์", subdistrict: "บ้านโตก" },
    "BO RANG": { district: "วิเชียรบุรี", subdistrict: "บ่อรัง" },
    "BUA WATTHANA": { district: "หนองไผ่", subdistrict: "บัววัฒนา" },
    "BUENG SAM PHAN": { district: "บึงสามพัน", subdistrict: "บึงสามพัน" },
    "CHON DAEN": { district: "ชนแดน", subdistrict: "ชนแดน" },
    "DONG MUN LEK": { district: "เมืองเพชรบูรณ์", subdistrict: "ดงมูลเหล็ก" },
    "HIN HAO": { district: "หล่มเก่า", subdistrict: "หินฮาว" },
    "HUAI RAI": { district: "หล่มสัก", subdistrict: "ห้วยไร่" },
    "HUAI YAI": { district: "เมืองเพชรบูรณ์", subdistrict: "ห้วยใหญ่" },
    "LOM KAO": { district: "หล่มเก่า", subdistrict: "หล่มเก่า" },
    "LOM SAK": { district: "หล่มสัก", subdistrict: "หล่มสัก" },
    "NA CHALIANG": { district: "หนองไผ่", subdistrict: "นาเฉลียง" },
    "NA NGUA": { district: "เมืองเพชรบูรณ์", subdistrict: "นางั่ว" },
    "NA YOM": { district: "เมืองเพชรบูรณ์", subdistrict: "นายม" },
    "NAI MUEANG": { district: "เมืองเพชรบูรณ์", subdistrict: "ในเมือง" },
    "NAM KO": { district: "หล่มสัก", subdistrict: "น้ำก้อ" },
    "PHU TOEI": { district: "วิเชียรบุรี", subdistrict: "พุเตย" },
    "SA KRUAT": { district: "ศรีเทพ", subdistrict: "สระกรวด" },
    "SA PRADU": { district: "วิเชียรบุรี", subdistrict: "สระประดู่" },
    "SADIANG": { district: "เมืองเพชรบูรณ์", subdistrict: "สะเดียง" },
    "SAP POEP": { district: "วังโป่ง", subdistrict: "ซับเปิบ" },
    "SAP SAMO THOT": { district: "บึงสามพัน", subdistrict: "ซับสมอทอด" },
    "TABO": { district: "เมืองเพชรบูรณ์", subdistrict: "ตะเบาะ" },
    "THA DAENG": { district: "หนองไผ่", subdistrict: "ท่าแดง" },
    "THA RONG": { district: "วิเชียรบุรี", subdistrict: "ท่าโรง" },
    "THUNG SAMO": { district: "เขาค้อ", subdistrict: "ทุ่งสมอ" },
    "WANG CHOMPHU": { district: "เมืองเพชรบูรณ์", subdistrict: "วังชมภู" },
    "หมู่บ้านการเคหะแห่งชาติเพชรบูรณ์": { district: "เมืองเพชรบูรณ์", subdistrict: "สะเดียง" },
    "หมู่บ้านการ์เด้น วิลล์": { district: "เมืองเพชรบูรณ์", subdistrict: "สะเดียง" },
    "หมู่บ้านชอนวิลเลจ": { district: "เมืองเพชรบูรณ์", subdistrict: "ชอนไพร" },
    "หมู่บ้านซิตี้โฮม": { district: "เมืองเพชรบูรณ์", subdistrict: "สะเดียง" },
    "หมู่บ้านบ้านเพชรชมพู": { district: "เมืองเพชรบูรณ์", subdistrict: "สะเดียง" },
    "หมู่บ้านวังชมภู พาร์ควิลล์": { district: "เมืองเพชรบูรณ์", subdistrict: "วังชมภู" },
    "หมู่บ้านศรีเทพทาวน์": { district: "ศรีเทพ", subdistrict: "สระกรวด" },
    "หมู่บ้านเพชรพฤกษา": { district: "เมืองเพชรบูรณ์", subdistrict: "สะเดียง" },
    "หมู่บ้านเพอร์เฟค เลควิว เดอะ ทาวน์เฮ้าส์": { district: "เมืองเพชรบูรณ์", subdistrict: "สะเดียง" },
    "หมู่บ้านโฮมแลนด์": { district: "เมืองเพชรบูรณ์", subdistrict: "สะเดียง" }
};

function cleanPhetchabunToken(token) {
    if (!token) return "";
    let t = String(token)
        .replace(/^(\u0e2d\u0e33\u0e40\u0e20\u0e2d|\u0e2d\.|\u0e15\u0e33\u0e1a\u0e25|\u0e15\.)\s*/g, "")
        .replace(/[,;]+/g, "")
        .replace(/\u0e40\u0e40/g, "\u0e41")
        .replace(/\u0e38+/g, "\u0e38")
        .replace(/\u0e39+/g, "\u0e39")
        .replace(/\u0e48+/g, "\u0e48")
        .replace(/\u0e49+/g, "\u0e49")
        .trim();
    if (t === "เมือง" || t === "เพชรบูรณ์") t = "เมืองเพชรบูรณ์";
    if (t === "ทุงสมอ") t = "ทุ่งสมอ";
    return t;
}

// Extract District (อำเภอ) and Subdistrict (ตำบล) with auto-swap using 11 Phetchabun districts
function parseDistrictAndSub(val) {
    if (!val) return { district: "ไม่ระบุพื้นที่", subdistrict: "", swapped: false };
    const s = String(val).trim();

    // Check direct alias map (English names or Housing Estates)
    const upperKey = s.toUpperCase();
    if (PHETCHABUN_AREA_ALIAS_MAP[upperKey]) {
        return { ...PHETCHABUN_AREA_ALIAS_MAP[upperKey], swapped: false };
    }
    if (PHETCHABUN_AREA_ALIAS_MAP[s]) {
        return { ...PHETCHABUN_AREA_ALIAS_MAP[s], swapped: false };
    }

    const parts = s.split(/\s*[-\u2013\u2014]\s*/);
    let p1 = parts[0] && parts[0].trim() ? cleanPhetchabunToken(parts[0]) : cleanPhetchabunToken(s);
    let p2 = parts.length > 1 && parts[1].trim() ? cleanPhetchabunToken(parts[1]) : "";

    let swapped = false;
    if (p2 && !PHETCHABUN_DISTRICTS.has(p1) && PHETCHABUN_DISTRICTS.has(p2)) {
        const tmp = p1;
        p1 = p2;
        p2 = tmp;
        swapped = true;
    }

    return {
        district: p1 || "ไม่ระบุพื้นที่",
        subdistrict: p2 || "",
        swapped: swapped
    };
}

// Normalize Service Event (New Connection = installation, Change Address To = installation)
function normalizeServiceEvent(ev) {
    if (!ev) return "";
    const val = String(ev).trim();
    const valLower = val.toLowerCase();
    if (valLower === "new connection" || valLower === "change address to") {
        return "installation";
    }
    return val;
}

// Fallback client-side parser
async function fetchDirectGoogleSheet() {
    const url = "https://docs.google.com/spreadsheets/d/1SqNPkmM4I3GCxfHiKbahwVyPQJhKWxk4d-mzITLtUmg/export?format=csv&gid=0";
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length > 0 && values.some(v => v.trim())) {
            const rowObj = { _id: i };
            headers.forEach((h, idx) => { rowObj[h] = values[idx] || ""; });

            // เอาสถานะ ยกเลิก ออกทั้งหมด
            const rawSt = (rowObj["Status"] || "").trim().toLowerCase();
            if (["cencel", "cancel", "cancelled", "ยกเลิก"].includes(rawSt)) continue;

            const rawArea = (rowObj["Area"] || "").trim();
            const { district, subdistrict } = parseDistrictAndSub(rawArea);
            rowObj["RawArea"] = rawArea;
            rowObj["District"] = district;
            rowObj["Subdistrict"] = subdistrict;
            rowObj["Area"] = district;

            const rawEv = (rowObj["Service Event"] || "").trim();
            rowObj["RawServiceEvent"] = rawEv;
            rowObj["Service Event"] = normalizeServiceEvent(rawEv);

            rows.push(rowObj);
        }
    }
    const metrics = computeCurrentMetrics(rows);
    return {
        ok: true,
        json: async () => ({ last_updated: new Date().toLocaleString('th-TH'), status: "success", metrics: metrics })
    };
}

function parseCSVLine(text) {
    let p = '', c = false, r = [];
    for (let i = 0; i < text.length; i++) {
        let cc = text[i], nc = text[i+1];
        if (cc === '"') {
            if (c && nc === '"') { p += '"'; i++; }
            else { c = !c; }
        } else if (cc === ',' && !c) {
            r.push(p.trim());
            p = '';
        } else {
            p += cc;
        }
    }
    r.push(p.trim());
    return r;
}

// Populate Toolbar Dropdowns
function populateToolbarDropdowns(m) {
    // 1. Year select
    const yearSelect = document.getElementById("filter-year");
    if (yearSelect) {
        const yearsMap = {};
        allRows.forEach(r => {
            const y = (r["Appoint Date"] || "").trim().slice(0, 4);
            if (y) yearsMap[y] = (yearsMap[y] || 0) + 1;
        });
        const years = Object.entries(yearsMap).sort((a,b) => b[0].localeCompare(a[0]));
        yearSelect.innerHTML = `<option value="ALL">ทุกปี (รวม ${allRows.length} งาน)</option>` +
            years.map(([y, c]) => `<option value="${y}">ปี ${y} (${c} งาน)</option>`).join("");
        if (filterYear && Array.from(yearSelect.options).some(o => o.value === filterYear)) {
            yearSelect.value = filterYear;
        } else {
            filterYear = "ALL";
            yearSelect.value = "ALL";
        }
    }

    // 2. Month select
    const monthSelect = document.getElementById("filter-month");
    if (monthSelect) {
        const monthMap = {};
        allRows.forEach(r => {
            const dt = (r["Appoint Date"] || "").trim();
            if (dt.length >= 7) {
                const ym = dt.slice(0, 7);
                monthMap[ym] = (monthMap[ym] || 0) + 1;
            }
        });
        const months = Object.entries(monthMap).sort((a,b) => b[0].localeCompare(a[0]));
        monthSelect.innerHTML = `<option value="ALL">-- ทุกเดือน (${allRows.length} งาน) --</option>` +
            months.map(([ym, c]) => `<option value="${ym}">${formatMonthTitle(ym)} (${c} งาน)</option>`).join("");
        if (filterMonth && Array.from(monthSelect.options).some(o => o.value === filterMonth)) {
            monthSelect.value = filterMonth;
        } else {
            filterMonth = "ALL";
            monthSelect.value = "ALL";
        }
    }

    // 3. District (อำเภอ) select
    const areaSelect = document.getElementById("filter-area");
    if (areaSelect) {
        const areaMap = {};
        allRows.forEach(r => {
            const a = (r["Area"] || "").trim() || "ไม่ระบุพื้นที่";
            areaMap[a] = (areaMap[a] || 0) + 1;
        });
        const areas = Object.entries(areaMap).sort((a,b) => b[1] - a[1]);
        areaSelect.innerHTML = `<option value="ALL">-- ทุกอำเภอ (${allRows.length} งาน) --</option>` +
            areas.map(([a, c]) => `<option value="${escapeHtml(a)}">อ. ${escapeHtml(a)} (${c} งาน)</option>`).join("");
        if (filterArea && Array.from(areaSelect.options).some(o => o.value === filterArea)) {
            areaSelect.value = filterArea;
        } else {
            filterArea = "ALL";
            areaSelect.value = "ALL";
        }
    }

    // 3.1 Subdistrict (ตำบล) select
    updateSubdistrictDropdown();

    // 4. Team select & Trend Team select
    const teamSelect = document.getElementById("filter-team");
    const trendTeamSelect = document.getElementById("trend-team-filter");
    const teamMap = {};
    allRows.forEach(r => {
        const t = (r["ทีมช่างติดตั้ง"] || "").trim() || "ไม่ระบุช่าง";
        teamMap[t] = (teamMap[t] || 0) + 1;
    });
    const teams = Object.entries(teamMap).sort((a,b) => a[0].localeCompare(b[0]));
    
    if (teamSelect) {
        teamSelect.innerHTML = `<option value="ALL">ทั้งหมด (${teams.length})</option>` +
            teams.map(([t, c]) => `<option value="${t}">${t} (${c})</option>`).join("");
        if (filterTeam && Array.from(teamSelect.options).some(o => o.value === filterTeam)) {
            teamSelect.value = filterTeam;
        } else {
            filterTeam = "ALL";
            teamSelect.value = "ALL";
        }
    }
    if (trendTeamSelect) {
        trendTeamSelect.innerHTML = `<option value="ALL">-- ทุกทีมช่าง (${teams.length}) --</option>` +
            teams.map(([t, c]) => `<option value="${t}">${t}</option>`).join("");
        if (trendTeamFilter && Array.from(trendTeamSelect.options).some(o => o.value === trendTeamFilter)) {
            trendTeamSelect.value = trendTeamFilter;
        } else {
            trendTeamFilter = "ALL";
            trendTeamSelect.value = "ALL";
        }
    }

    // 5. Service Event select
    const eventSelect = document.getElementById("filter-event");
    if (eventSelect) {
        const eventMap = {};
        allRows.forEach(r => {
            const ev = (r["Service Event"] || "").trim() || "ไม่ระบุ";
            eventMap[ev] = (eventMap[ev] || 0) + 1;
        });
        const events = Object.entries(eventMap).sort((a,b) => b[1] - a[1]);
        eventSelect.innerHTML = `<option value="ALL">ทั้งหมด (${events.length})</option>` +
            events.map(([ev, c]) => `<option value="${ev}">${ev} (${c})</option>`).join("");
        if (filterEvent && Array.from(eventSelect.options).some(o => o.value === filterEvent)) {
            eventSelect.value = filterEvent;
        } else {
            filterEvent = "ALL";
            eventSelect.value = "ALL";
        }
    }

    // 6. Status select
    const statusSelect = document.getElementById("filter-status");
    if (statusSelect && filterStatus) {
        statusSelect.value = filterStatus;
    }

    // 7. Populate Single Date in Month Select
    populateDateDropdown(filterMonth, filterYear);
}

// Populate Subdistrict (ตำบล) dropdown dynamically based on selected District (อำเภอ)
function updateSubdistrictDropdown() {
    const subdistrictSelect = document.getElementById("filter-subdistrict");
    if (!subdistrictSelect) return;

    // Filter subdistricts based on selected District (if any)
    const matchingRows = (filterArea && filterArea !== "ALL")
        ? allRows.filter(r => (r["Area"] || "").trim() === filterArea)
        : allRows;

    const subMap = {};
    matchingRows.forEach(r => {
        const s = (r["Subdistrict"] || "").trim();
        if (s) {
            subMap[s] = (subMap[s] || 0) + 1;
        }
    });

    const subs = Object.entries(subMap).sort((a, b) => b[1] - a[1]);
    const labelPrefix = (filterArea && filterArea !== "ALL")
        ? `-- ทุกตำบลใน อ. ${filterArea} (${subs.length} ตำบล) --`
        : `-- ทุกตำบล (${subs.length} ตำบล) --`;

    subdistrictSelect.innerHTML = `<option value="ALL">${labelPrefix}</option>` +
        subs.map(([s, c]) => `<option value="${escapeHtml(s)}">ต. ${escapeHtml(s)} (${c} งาน)</option>`).join("");

    if (filterSubdistrict && Array.from(subdistrictSelect.options).some(o => o.value === filterSubdistrict)) {
        subdistrictSelect.value = filterSubdistrict;
    } else {
        filterSubdistrict = "ALL";
        subdistrictSelect.value = "ALL";
    }
}

// Populate single Date dropdown (filtered by selected month/year)
function populateDateDropdown(selectedMonth = filterMonth, selectedYear = filterYear) {
    const dateSelect = document.getElementById("filter-date");
    const dateLabel = document.getElementById("label-filter-date");
    const dateHint = document.getElementById("date-count-hint");
    if (!dateSelect) return;

    // Filter rows to only matching month and year
    let rowsToInspect = allRows;
    if (selectedYear && selectedYear !== "ALL") {
        rowsToInspect = rowsToInspect.filter(r => (r["Appoint Date"] || "").trim().startsWith(selectedYear));
    }
    if (selectedMonth && selectedMonth !== "ALL") {
        rowsToInspect = rowsToInspect.filter(r => (r["Appoint Date"] || "").trim().startsWith(selectedMonth));
    }

    const dateMap = {};
    rowsToInspect.forEach(r => {
        const dt = (r["Appoint Date"] || "").trim();
        if (dt) {
            dateMap[dt] = (dateMap[dt] || 0) + 1;
        }
    });

    // Sort descending chronologically
    const dates = Object.entries(dateMap).sort((a, b) => b[0].localeCompare(a[0]));

    if (selectedMonth && selectedMonth !== "ALL") {
        if (dateLabel) dateLabel.textContent = `เลือกวันที่ (ในเดือน ${formatMonthTitle(selectedMonth)})`;
        if (dateHint) dateHint.textContent = `มีงาน ${dates.length} วัน`;
        dateSelect.innerHTML = `<option value="ALL">-- ทุกวันในเดือนนี้ (${rowsToInspect.length} งาน) --</option>` +
            dates.map(([dt, c]) => `<option value="${dt}">${formatDateShortThai(dt)} (${dt}) - ${c} งาน</option>`).join("");
    } else {
        if (dateLabel) dateLabel.textContent = `เลือกวันที่ (Appoint Date)`;
        if (dateHint) dateHint.textContent = `มีงาน ${dates.length} วัน`;
        dateSelect.innerHTML = `<option value="ALL">-- ทุกวันที่ (${rowsToInspect.length} งาน) --</option>` +
            dates.map(([dt, c]) => `<option value="${dt}">${formatDateShortThai(dt)} (${dt}) - ${c} งาน</option>`).join("");
    }

    // Preserve selection if still valid, else set to ALL
    if (filterDate && filterDate !== "ALL" && dateMap[filterDate]) {
        dateSelect.value = filterDate;
    } else {
        filterDate = "ALL";
        dateSelect.value = "ALL";
    }
}

// Compute Productivity Metrics for each technician
function computeProductivityMetrics(rows) {
    const teamDailyMap = {};

    rows.forEach(r => {
        const team = (r["ทีมช่างติดตั้ง"] || "").trim() || "ไม่ระบุช่าง";
        const date = (r["Appoint Date"] || "").trim() || "ไม่ระบุวันที่";
        const status = r.NormalizedStatus || "Pending";
        const area = (r["Area"] || "").trim();

        if (!teamDailyMap[team]) {
            teamDailyMap[team] = {};
        }
        if (!teamDailyMap[team][date]) {
            teamDailyMap[team][date] = { total: 0, complete: 0, reject: 0, pending: 0, areas: new Set() };
        }

        const dayEntry = teamDailyMap[team][date];
        dayEntry.total++;
        if (status === "Complete") dayEntry.complete++;
        else if (status === "Reject") dayEntry.reject++;
        else dayEntry.pending++;

        if (area) dayEntry.areas.add(area);
    });

    const teamsProd = [];
    let totalWorkingDaysAll = 0;
    let totalCompleteAll = 0;
    let daysGt2CountAll = 0;
    let days1To2CountAll = 0;
    let days0CountAll = 0;
    const dailyLogs = [];

    Object.entries(teamDailyMap).forEach(([team, daysObj]) => {
        const workingDays = Object.keys(daysObj).length;
        let totalAssigned = 0;
        let totalComplete = 0;
        let daysGt2 = 0;
        let daysLte2 = 0;

        const dayList = Object.entries(daysObj).map(([dt, d]) => {
            totalAssigned += d.total;
            totalComplete += d.complete;
            const isGt2 = d.complete > 2;
            if (isGt2) {
                daysGt2++;
                daysGt2CountAll++;
            } else {
                daysLte2++;
                if (d.complete > 0) days1To2CountAll++;
                else days0CountAll++;
            }

            return {
                date: dt,
                total: d.total,
                complete: d.complete,
                reject: d.reject,
                pending: d.pending,
                is_gt_2: isGt2,
                areas: Array.from(d.areas).join(", ")
            };
        }).sort((a, b) => b.date.localeCompare(a.date));

        const avgCompletePerDay = workingDays > 0 ? Math.round((totalComplete / workingDays) * 100) / 100 : 0;
        const isAbove2_5 = avgCompletePerDay > 2.5;
        const completePct = totalAssigned > 0 ? Math.round((totalComplete / totalAssigned) * 1000) / 10 : 0;
        const pctDaysGt2 = workingDays > 0 ? Math.round((daysGt2 / workingDays) * 1000) / 10 : 0;

        totalWorkingDaysAll += workingDays;
        totalCompleteAll += totalComplete;

        teamsProd.push({
            team_name: team,
            working_days: workingDays,
            total_assigned: totalAssigned,
            total_complete: totalComplete,
            complete_pct: completePct,
            days_gt_2: daysGt2,
            days_lte_2: daysLte2,
            pct_days_gt_2: pctDaysGt2,
            avg_complete_per_day: avgCompletePerDay,
            is_above_2_5: isAbove2_5,
            days: dayList
        });

        dayList.forEach(dl => {
            dailyLogs.push({
                team_name: team,
                ...dl
            });
        });
    });

    // Sort teams descending by avg_complete_per_day
    teamsProd.sort((a, b) => b.avg_complete_per_day - a.avg_complete_per_day);

    // Sort daily logs descending by date
    dailyLogs.sort((a, b) => b.date.localeCompare(a.date));

    const techAbove2_5 = teamsProd.filter(t => t.is_above_2_5);
    const techBelow2_5 = teamsProd.filter(t => !t.is_above_2_5);
    const teamAvgCompletePerDay = totalWorkingDaysAll > 0 ? Math.round((totalCompleteAll / totalWorkingDaysAll) * 100) / 100 : 0;
    const totalDaysAll = daysGt2CountAll + days1To2CountAll + days0CountAll;
    const pctDaysGt2All = totalDaysAll > 0 ? Math.round((daysGt2CountAll / totalDaysAll) * 1000) / 10 : 0;

    return {
        teams: teamsProd,
        tech_above_2_5_count: techAbove2_5.length,
        tech_below_2_5_count: techBelow2_5.length,
        tech_above_2_5: techAbove2_5,
        tech_below_2_5: techBelow2_5,
        total_working_days: totalWorkingDaysAll,
        total_complete: totalCompleteAll,
        team_avg_complete_per_day: teamAvgCompletePerDay,
        days_gt_2_total: daysGt2CountAll,
        days_1_to_2_total: days1To2CountAll,
        days_0_total: days0CountAll,
        pct_days_gt_2_total: pctDaysGt2All,
        daily_logs: dailyLogs
    };
}

// Compute Metrics for current active filteredRows
function computeCurrentMetrics(rows) {
    let complete = 0, reject = 0, pending = 0;
    const teamData = {};
    const reasonData = {};
    const areaData = {};
    const dailyData = {};
    const monthlyData = {};

    rows.forEach(r => {
        const st = r.NormalizedStatus;
        if (st === "Complete") complete++;
        else if (st === "Reject") reject++;
        else pending++;

        // Team
        const t = (r["ทีมช่างติดตั้ง"] || "").trim() || "ไม่ระบุช่าง";
        if (!teamData[t]) {
            teamData[t] = { team_name: t, total: 0, complete: 0, reject: 0, reasons: {} };
        }
        teamData[t].total++;
        if (st === "Complete") teamData[t].complete++;
        else if (st === "Reject") teamData[t].reject++;

        // Reason
        const rs = (r["Reason Code"] || "").trim();
        if (rs) {
            teamData[t].reasons[rs] = (teamData[t].reasons[rs] || 0) + 1;
            if (!reasonData[rs]) reasonData[rs] = { count: 0, teams: {}, statuses: {} };
            reasonData[rs].count++;
            reasonData[rs].teams[t] = (reasonData[rs].teams[t] || 0) + 1;
            reasonData[rs].statuses[st] = (reasonData[rs].statuses[st] || 0) + 1;
        }

        // Area
        const ar = (r["Area"] || "").trim() || "ไม่ระบุพื้นที่";
        if (!areaData[ar]) {
            areaData[ar] = { area: ar, total: 0, complete: 0, reject: 0 };
        }
        areaData[ar].total++;
        if (st === "Complete") areaData[ar].complete++;
        else if (st === "Reject") areaData[ar].reject++;

        // Date (Daily)
        const dt = (r["Appoint Date"] || "").trim();
        if (dt) {
            if (!dailyData[dt]) {
                dailyData[dt] = { date: dt, total: 0, complete: 0, pending: 0, reject: 0, teams: new Set() };
            }
            dailyData[dt].total++;
            if (st === "Complete") dailyData[dt].complete++;
            else if (st === "Reject") dailyData[dt].reject++;
            else dailyData[dt].pending++;
            dailyData[dt].teams.add(t);

            // Month (Monthly)
            if (dt.length >= 7) {
                const ym = dt.slice(0, 7);
                if (!monthlyData[ym]) {
                    monthlyData[ym] = { month: ym, total: 0, complete: 0, pending: 0, reject: 0, teams: new Set() };
                }
                monthlyData[ym].total++;
                if (st === "Complete") monthlyData[ym].complete++;
                else if (st === "Reject") monthlyData[ym].reject++;
                else monthlyData[ym].pending++;
                monthlyData[ym].teams.add(t);
            }
        }
    });

    const total = rows.length;
    const teamsList = Object.values(teamData).map(t => {
        t.complete_pct = t.total > 0 ? Math.round((t.complete / t.total) * 1000) / 10 : 0;
        t.rate_tier = t.complete_pct < 50 ? "low" : (t.complete_pct < 75 ? "medium" : "high");
        t.reasons = Object.entries(t.reasons).map(([r, c]) => ({ reason: r, count: c })).sort((a,b) => b.count - a.count);
        return t;
    }).sort((a, b) => a.complete_pct - b.complete_pct);

    const reasonsList = Object.entries(reasonData).map(([r, d]) => ({
        reason: r,
        count: d.count,
        pct_of_incomplete: reject > 0 ? Math.round((d.count / reject) * 1000) / 10 : 0,
        pct_of_total: total > 0 ? Math.round((d.count / total) * 1000) / 10 : 0,
        teams: Object.entries(d.teams).map(([tm, c]) => ({ team: tm, count: c })).sort((a,b) => b.count - a.count),
        statuses: d.statuses
    })).sort((a, b) => b.count - a.count);

    const areaList = Object.values(areaData).sort((a, b) => b.total - a.total);

    // Sort time-series ascending chronologically
    const dailyTrend = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
        ...d,
        teams: Array.from(d.teams),
        complete_pct: d.total > 0 ? Math.round((d.complete / d.total) * 1000) / 10 : 0
    }));

    const monthlyTrend = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
        ...m,
        teams: Array.from(m.teams),
        complete_pct: m.total > 0 ? Math.round((m.complete / m.total) * 1000) / 10 : 0
    }));

    return {
        total_jobs: total,
        complete_count: complete,
        complete_pct: total > 0 ? Math.round((complete / total) * 1000) / 10 : 0,
        pending_count: pending,
        pending_pct: total > 0 ? Math.round((pending / total) * 1000) / 10 : 0,
        reject_count: reject,
        reject_pct: total > 0 ? Math.round((reject / total) * 1000) / 10 : 0,
        failed_count: reject,
        failed_pct: total > 0 ? Math.round((reject / total) * 1000) / 10 : 0,
        active_teams_count: teamsList.length,
        lowest_team: teamsList[0] || null,
        teams: teamsList,
        reason_codes: reasonsList,
        areas: areaList,
        daily_trend: dailyTrend,
        monthly_trend: monthlyTrend,
        productivity: computeProductivityMetrics(rows),
        rows: rows
    };
}

// Update Entire Dashboard View
function updateDashboardView() {
    const metrics = computeCurrentMetrics(filteredRows);

    // 1. Update 5 KPI Cards
    renderKPICards(metrics);

    // 2. Update Badge in Toolbar
    const countBadge = document.getElementById("filtered-count-badge");
    if (countBadge) {
        countBadge.textContent = `พบ ${filteredRows.length} รายการ`;
    }

    // 3. Render View 1 (Trend Summary)
    renderTrendCharts(metrics);
    renderMatrixTable(metrics);

    // 4. Render View 2 (Jobs Monitor & Details)
    renderTechnicianCards(metrics.teams);
    renderReasonCodesAnalysis(metrics.reason_codes, metrics.reject_count);
    updateAlertLowestTeam(metrics.lowest_team, metrics.total_jobs);

    // 5. Render View 3 (Technician Productivity)
    renderProductivityView(metrics);

    currentPage = 1;
    renderTable();
}

// Render 5 KPI Cards matching Reference Mockup
function renderKPICards(m) {
    document.getElementById("kpi-total-jobs").textContent = m.total_jobs || 0;
    
    // Complete
    document.getElementById("kpi-complete-count").textContent = m.complete_count || 0;
    const completePill = document.getElementById("kpi-complete-pill");
    if (completePill) completePill.textContent = `${m.complete_pct || 0}% อัตราสำเร็จ`;

    // Pending
    document.getElementById("kpi-pending-count").textContent = m.pending_count || 0;
    const pendingPill = document.getElementById("kpi-pending-pill");
    if (pendingPill) pendingPill.textContent = `${m.pending_pct || 0}% ของงานทั้งหมด`;

    // Reject / Failed
    document.getElementById("kpi-failed-count").textContent = m.reject_count || 0;
    const rejectSub = document.getElementById("kpi-reject-sub");
    if (rejectSub) rejectSub.textContent = m.reject_count || 0;
    const failedPill = document.getElementById("kpi-failed-pill");
    if (failedPill) failedPill.textContent = `${m.reject_pct || 0}% ไม่ผ่าน`;

    // Active Teams
    document.getElementById("kpi-active-teams").textContent = m.active_teams_count || 0;
}

// Render View 1: Trend Charts
function renderTrendCharts(m) {
    renderTrendLineChart(m);
    renderStatusDonutChart(m);
    renderAreaBreakdownChart(m.areas);
    renderTechRankingChart(m.teams);
    renderTrendReasonSection(m);
}

// 1. Performance Trend Line Chart (Smooth Bezier with Gradient Fill)
function renderTrendLineChart(m) {
    const ctx = document.getElementById("chart-trend-line");
    if (!ctx) return;

    if (trendLineChart) trendLineChart.destroy();

    // Determine data source (daily vs monthly)
    let sourceData = trendTimeMode === "daily" ? m.daily_trend : m.monthly_trend;

    // Apply Team Filter if selected
    if (trendTeamFilter !== "ALL") {
        const filteredByTeamRows = filteredRows.filter(r => (r["ทีมช่างติดตั้ง"] || "").trim() === trendTeamFilter);
        const teamMetrics = computeCurrentMetrics(filteredByTeamRows);
        sourceData = trendTimeMode === "daily" ? teamMetrics.daily_trend : teamMetrics.monthly_trend;
    }

    if (!sourceData || sourceData.length === 0) {
        return;
    }

    const labels = sourceData.map(d => {
        if (trendTimeMode === "daily") {
            return formatDateShortThai(d.date);
        } else {
            return formatMonthTitle(d.month);
        }
    });

    const totalSeries = sourceData.map(d => d.total);
    const completeSeries = sourceData.map(d => d.complete);
    const pendingSeries = sourceData.map(d => d.pending || 0);
    const rejectSeries = sourceData.map(d => d.reject);

    // Create gradient fill for Total line matching reference
    const chartContext = ctx.getContext("2d");
    const gradientFill = chartContext.createLinearGradient(0, 0, 0, 260);
    gradientFill.addColorStop(0, "rgba(59, 130, 246, 0.25)");
    gradientFill.addColorStop(1, "rgba(59, 130, 246, 0.0)");

    trendLineChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "ยอดรวมที่จ่ายให้ช่าง (Total Assigned)",
                    data: totalSeries,
                    borderColor: "#3b82f6",
                    backgroundColor: gradientFill,
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: "#3b82f6"
                },
                {
                    label: "ติดตั้งเรียบร้อย (Complete)",
                    data: completeSeries,
                    borderColor: "#10b981",
                    backgroundColor: "#10b981",
                    fill: false,
                    tension: 0.35,
                    borderWidth: 2,
                    pointRadius: 3.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: "#10b981"
                },
                {
                    label: "รอดำเนินการ (Pending)",
                    data: pendingSeries,
                    borderColor: "#64748b",
                    backgroundColor: "#64748b",
                    fill: false,
                    tension: 0.35,
                    borderWidth: 1.8,
                    borderDash: [4, 4],
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: "#64748b"
                },
                {
                    label: "ปฏิเสธ/ไม่ผ่าน (Reject)",
                    data: rejectSeries,
                    borderColor: "#ef4444",
                    backgroundColor: "#ef4444",
                    fill: false,
                    tension: 0.35,
                    borderWidth: 1.8,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: "#ef4444"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: {
                    position: "top",
                    labels: {
                        font: { family: "'Prompt', sans-serif", size: 11 },
                        usePointStyle: true,
                        pointStyle: "circle",
                        padding: 14
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const item = sourceData[items[0].dataIndex];
                            return trendTimeMode === "daily" ? `วันที่: ${item.date}` : `เดือน: ${formatMonthTitle(item.month)}`;
                        },
                        afterBody: (items) => {
                            const item = sourceData[items[0].dataIndex];
                            return `ความสำเร็จ: ${item.complete_pct}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: "#f1f5f9" },
                    ticks: { font: { family: "'Prompt', sans-serif", size: 11 } }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: { family: "'Prompt', sans-serif", size: 11 }
                    },
                    grid: { color: "#f1f5f9" }
                }
            }
        }
    });
}

// 2. Status Share Donut Chart
function renderStatusDonutChart(m) {
    const ctx = document.getElementById("chart-status-donut");
    if (!ctx) return;

    if (statusDonutChart) statusDonutChart.destroy();

    const dataValues = [m.complete_count, m.pending_count, m.reject_count];
    const isZero = m.total_jobs === 0;

    statusDonutChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["ติดตั้งเรียบร้อย", "รอดำเนินการ", "ไม่ผ่าน/ปฏิเสธ"],
            datasets: [{
                data: isZero ? [0, 0, 0] : dataValues,
                backgroundColor: [
                    "#10b981", // green
                    "#f59e0b", // amber
                    "#ef4444"  // red
                ],
                borderWidth: 3,
                borderColor: "#ffffff",
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        font: { family: "'Prompt', sans-serif", size: 11 },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: "circle"
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const val = ctx.raw || 0;
                            const pct = m.total_jobs > 0 ? ((val / m.total_jobs) * 100).toFixed(1) : 0;
                            return ` ${ctx.label}: ${val} งาน (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    const centerEl = document.getElementById("status-donut-center");
    if (centerEl) {
        centerEl.innerHTML = `
            <div class="text-3xl font-black text-slate-900">${m.total_jobs > 0 ? m.complete_pct + '%' : '0%'}</div>
            <div class="text-xs text-slate-500 font-semibold mt-0.5">สำเร็จ</div>
        `;
    }
}

// 3. By Area Stacked Bar Chart
function renderAreaBreakdownChart(areas) {
    const ctx = document.getElementById("chart-area-breakdown");
    if (!ctx) return;

    if (areaBreakdownChart) areaBreakdownChart.destroy();

    const topAreas = areas.slice(0, 10);
    const labels = topAreas.map(a => a.area);
    const completeData = topAreas.map(a => a.complete);
    const rejectData = topAreas.map(a => a.reject);

    areaBreakdownChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "ติดตั้งเรียบร้อย",
                    data: completeData,
                    backgroundColor: "#10b981",
                    stack: "areaStack",
                    borderRadius: 4
                },
                {
                    label: "ปฏิเสธ",
                    data: rejectData,
                    backgroundColor: "#ef4444",
                    stack: "areaStack",
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "top",
                    labels: { font: { family: "'Prompt', sans-serif", size: 10 }, usePointStyle: true }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => topAreas[items[0].dataIndex].area
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { font: { family: "'Prompt', sans-serif", size: 10 } },
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { family: "'Prompt', sans-serif", size: 10 } },
                    grid: { color: "#f1f5f9" }
                }
            }
        }
    });
}

// 4. Technician Ranking Horizontal Bar Chart
function renderTechRankingChart(teams) {
    const ctx = document.getElementById("chart-tech-ranking");
    if (!ctx) return;

    if (techRankingChart) techRankingChart.destroy();

    // Sort descending for top ranking
    const sortedTeams = [...teams].sort((a, b) => b.complete_pct - a.complete_pct);
    const labels = sortedTeams.map(t => t.team_name.replace("Install Team ", "Team "));
    const rates = sortedTeams.map(t => t.complete_pct);

    techRankingChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "% ความสำเร็จ (Complete Rate)",
                data: rates,
                backgroundColor: "#3b82f6",
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => sortedTeams[items[0].dataIndex].team_name,
                        label: (ctx) => ` สำเร็จ: ${ctx.raw}% (${sortedTeams[ctx.dataIndex].complete}/${sortedTeams[ctx.dataIndex].total} งาน)`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { callback: v => v + "%", font: { family: "'Prompt', sans-serif", size: 10 } },
                    grid: { color: "#f1f5f9" }
                },
                y: {
                    ticks: { font: { family: "'Prompt', sans-serif", size: 10 } },
                    grid: { display: false }
                }
            }
        }
    });
}

// Render Trend Summary Matrix Table
function renderMatrixTable(m) {
    const tbody = document.getElementById("matrix-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    const sourceData = trendTimeMode === "daily" ? m.daily_trend : m.monthly_trend;

    if (!sourceData || sourceData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">ไม่มีข้อมูลในช่วงเวลาที่เลือก</td></tr>`;
        return;
    }

    sourceData.forEach(row => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition border-b border-gray-100";

        const label = trendTimeMode === "daily" 
            ? `${row.date} (${formatDateShortThai(row.date)})` 
            : formatMonthTitle(row.month);

        const teamsPills = (row.teams || []).map(t => `<span class="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 mr-1 mb-0.5">${escapeHtml(t)}</span>`).join("");

        const rejectCellHtml = row.reject > 0
            ? `<button type="button" class="btn-matrix-reject inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 transition cursor-pointer shadow-2xs" title="คลิกเพื่อดูรายการงานที่ถูกปฏิเสธ (${row.reject} เคส)">${row.reject}</button>`
            : `<span class="text-xs text-slate-400 font-medium">0</span>`;

        tr.innerHTML = `
            <td class="font-semibold text-xs text-slate-900">${label}</td>
            <td class="font-bold text-xs text-blue-600">${row.total} งาน</td>
            <td class="font-bold text-xs text-emerald-600">${row.complete} งาน</td>
            <td>
                <span class="px-2 py-0.5 rounded-full text-xs font-bold ${row.complete_pct >= 75 ? 'bg-emerald-50 text-emerald-700' : (row.complete_pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}">
                    ${row.complete_pct}%
                </span>
            </td>
            <td class="text-xs text-slate-600 font-medium">${row.pending || 0}</td>
            <td>${rejectCellHtml}</td>
            <td><div class="flex flex-wrap">${teamsPills || '-'}</div></td>
        `;

        const btnReject = tr.querySelector(".btn-matrix-reject");
        if (btnReject) {
            btnReject.addEventListener("click", () => {
                if (trendTimeMode === "daily") {
                    openRejectCasesModal({
                        date: row.date,
                        team: trendTeamFilter !== "ALL" ? trendTeamFilter : "ALL",
                        title: `รายการงานที่ถูกปฏิเสธ (Reject) ประจำวันที่ ${label}`
                    });
                } else {
                    openRejectCasesModal({
                        month: row.month,
                        team: trendTeamFilter !== "ALL" ? trendTeamFilter : "ALL",
                        title: `รายการงานที่ถูกปฏิเสธ (Reject) ประจำเดือน ${label}`
                    });
                }
            });
        }

        tbody.appendChild(tr);
    });
}

// =========================================================================
// VIEW 3: TECHNICIAN PRODUCTIVITY RENDERING FUNCTIONS
// =========================================================================

function renderProductivityView(m) {
    if (!m || !m.productivity) return;
    const prod = m.productivity;

    renderProductivityKPICards(prod);
    renderProductivityBarChart(prod.teams);
    renderDailyTargetDonutChart(prod);
    renderProductivityTable(prod.teams);
    renderDailyLogTable(prod.daily_logs);
}

// 1. Productivity KPI Cards
function renderProductivityKPICards(prod) {
    const aboveEl = document.getElementById("prod-kpi-above-count");
    if (aboveEl) aboveEl.textContent = prod.tech_above_2_5_count;

    const aboveBadge = document.getElementById("prod-kpi-above-badge");
    if (aboveBadge) aboveBadge.textContent = `${prod.tech_above_2_5_count} ทีม (> 2.5)`;

    const belowEl = document.getElementById("prod-kpi-below-count");
    if (belowEl) belowEl.textContent = prod.tech_below_2_5_count;

    const belowBadge = document.getElementById("prod-kpi-below-badge");
    if (belowBadge) belowBadge.textContent = `${prod.tech_below_2_5_count} ทีม (<= 2.5)`;

    const teamAvgEl = document.getElementById("prod-kpi-team-avg");
    if (teamAvgEl) teamAvgEl.textContent = prod.team_avg_complete_per_day.toFixed(2);

    const daysGt2El = document.getElementById("prod-kpi-days-gt2");
    if (daysGt2El) daysGt2El.textContent = prod.days_gt_2_total;

    const daysGt2Pct = document.getElementById("prod-kpi-days-gt2-pct");
    if (daysGt2Pct) daysGt2Pct.textContent = `${prod.pct_days_gt_2_total}% ของวันทำงาน`;

    const manDaysEl = document.getElementById("prod-kpi-total-mandays");
    if (manDaysEl) manDaysEl.textContent = prod.total_working_days;

    const activeTechs = document.getElementById("prod-kpi-active-techs");
    if (activeTechs) activeTechs.textContent = `จากทั้งหมด ${prod.teams.length} ทีมช่าง`;
}

// 2. Bar Chart: Productivity vs 2.5 Benchmark Line
function renderProductivityBarChart(teams) {
    const ctx = document.getElementById("chart-tech-productivity");
    if (!ctx) return;

    if (techProductivityChart) techProductivityChart.destroy();

    if (!teams || teams.length === 0) return;

    const labels = teams.map(t => t.team_name.replace("Install Team ", "Team "));
    const dataValues = teams.map(t => t.avg_complete_per_day);
    const bgColors = teams.map(t => t.is_above_2_5 ? "rgba(16, 185, 129, 0.85)" : "rgba(245, 158, 11, 0.85)");
    const borderColors = teams.map(t => t.is_above_2_5 ? "#10b981" : "#f59e0b");

    const targetLinePlugin = {
        id: 'targetLinePlugin',
        afterDraw: (chart) => {
            const { ctx, chartArea, scales: { y } } = chart;
            if (!y || !chartArea) return;
            const yCoord = y.getPixelForValue(2.5);
            if (yCoord < chartArea.top || yCoord > chartArea.bottom) return;

            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.moveTo(chartArea.left, yCoord);
            ctx.lineTo(chartArea.right, yCoord);
            ctx.stroke();

            // Benchmark Label
            ctx.fillStyle = '#ef4444';
            ctx.font = "bold 11px 'Prompt', sans-serif";
            ctx.textAlign = 'right';
            ctx.fillText('เป้าหมายเกณฑ์มาตรฐาน 2.5 งาน/วัน', chartArea.right - 8, yCoord - 6);
            ctx.restore();
        }
    };

    techProductivityChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "เฉลี่ยงานสำเร็จ/วันทำงาน (Avg Complete/Day)",
                data: dataValues,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => teams[items[0].dataIndex].team_name,
                        label: (ctx) => {
                            const t = teams[ctx.dataIndex];
                            return [
                                ` เฉลี่ยสำเร็จ: ${t.avg_complete_per_day.toFixed(2)} งาน/วัน`,
                                ` งานสำเร็จ: ${t.total_complete}/${t.total_assigned} งาน (${t.complete_pct}%)`,
                                ` วันทำงานจริง: ${t.working_days} วัน (วันสำเร็จ > 2: ${t.days_gt_2} วัน)`,
                                ` ผลการประเมิน: ${t.is_above_2_5 ? '✓ ผ่านเกณฑ์มาตรฐานสูง (> 2.5)' : '⚠️ ต่ำกว่าเกณฑ์ (<= 2.5)'}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: "'Prompt', sans-serif", size: 11 } }
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: 3.5,
                    ticks: {
                        stepSize: 0.5,
                        font: { family: "'Prompt', sans-serif", size: 11 },
                        callback: (v) => v + " งาน"
                    },
                    grid: { color: "#f1f5f9" }
                }
            }
        },
        plugins: [targetLinePlugin]
    });
}

// 3. Donut Chart: Daily Target Share
function renderDailyTargetDonutChart(prod) {
    const ctx = document.getElementById("chart-daily-target-donut");
    if (!ctx) return;

    if (dailyTargetDonutChart) dailyTargetDonutChart.destroy();

    const dataVals = [prod.days_gt_2_total, prod.days_1_to_2_total, prod.days_0_total];
    const labels = ["สำเร็จ > 2 งาน (ผ่านเกณฑ์)", "สำเร็จ 1 - 2 งาน (ปกติ)", "สำเร็จ 0 งาน (ไม่มีงานเสร็จ)"];
    const colors = ["#10b981", "#3b82f6", "#ef4444"];

    dailyTargetDonutChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: dataVals,
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: "#ffffff",
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        font: { family: "'Prompt', sans-serif", size: 11 },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: "circle"
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const val = ctx.raw || 0;
                            const total = prod.total_working_days || 1;
                            const pct = Math.round((val / total) * 1000) / 10;
                            return ` ${ctx.label}: ${val} วัน (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// 4. Technician Productivity Summary Table
function renderProductivityTable(teams) {
    const tbody = document.getElementById("productivity-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!teams || teams.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center py-6 text-slate-400">ไม่มีข้อมูลช่างในช่วงเวลาที่เลือก</td></tr>`;
        return;
    }

    teams.forEach((t, idx) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition border-b border-gray-100";

        const pctOfTarget = Math.min(100, Math.round((t.avg_complete_per_day / 2.5) * 100));
        const badge2_5 = t.is_above_2_5
            ? `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">⭐ &gt; 2.5 (ผ่านเกณฑ์)</span>`
            : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">⚠️ &le; 2.5 (ต่ำกว่าเกณฑ์)</span>`;

        tr.innerHTML = `
            <td class="text-center font-bold text-xs text-slate-400">#${idx + 1}</td>
            <td class="font-bold text-xs text-slate-900">${t.team_name}</td>
            <td class="text-center text-xs font-semibold text-slate-700">${t.total_assigned} งาน</td>
            <td class="text-center text-xs font-bold text-emerald-600">${t.total_complete} งาน</td>
            <td class="text-center text-xs font-semibold text-slate-600">${t.complete_pct}%</td>
            <td class="text-center text-xs font-bold text-blue-600">${t.working_days} วัน</td>
            <td class="text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${t.days_gt_2 > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}">
                    ${t.days_gt_2} วัน (${t.pct_days_gt_2}%)
                </span>
            </td>
            <td class="text-center text-xs text-slate-500 font-medium">${t.days_lte_2} วัน</td>
            <td class="text-center">
                <span class="text-base font-black ${t.is_above_2_5 ? 'text-emerald-600' : 'text-slate-800'}">
                    ${t.avg_complete_per_day.toFixed(2)}
                </span>
                <span class="text-[10px] text-slate-400 block font-normal">งาน/วัน</span>
            </td>
            <td class="text-center">${badge2_5}</td>
            <td class="w-36">
                <div class="flex items-center space-x-2">
                    <div class="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div class="h-2 rounded-full ${t.is_above_2_5 ? 'bg-emerald-500' : 'bg-amber-500'}" style="width: ${pctOfTarget}%"></div>
                    </div>
                    <span class="text-[11px] font-bold ${t.is_above_2_5 ? 'text-emerald-700' : 'text-amber-700'}">${pctOfTarget}%</span>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 5. Daily Operational Record by Technician
function renderDailyLogTable(dailyLogs) {
    const tbody = document.getElementById("productivity-daily-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!dailyLogs || dailyLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">ไม่มีข้อมูลบันทึกรายวัน</td></tr>`;
        return;
    }

    let filteredLogs = dailyLogs;
    if (dailyLogFilter === "gt2") {
        filteredLogs = dailyLogs.filter(dl => dl.is_gt_2);
    } else if (dailyLogFilter === "lte2") {
        filteredLogs = dailyLogs.filter(dl => !dl.is_gt_2);
    }

    if (filteredLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">ไม่พบรายการที่ตรงตามตัวกรอง</td></tr>`;
        return;
    }

    filteredLogs.forEach(dl => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition border-b border-gray-100";

        const badgeResult = dl.is_gt_2
            ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">🎉 ปิดสำเร็จ &gt; 2 งาน (${dl.complete} งาน)</span>`
            : (dl.complete > 0 
                ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">สำเร็จ ${dl.complete} งาน (&le; 2)</span>`
                : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700">0 งานสำเร็จ</span>`
              );

        const rejectCellHtml = dl.reject > 0
            ? `<button type="button" class="btn-daily-reject inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 transition cursor-pointer" title="คลิกดูงานที่ถูกปฏิเสธ (${dl.reject} เคส)">${dl.reject}</button>`
            : `<span class="text-xs text-slate-400 font-medium">0</span>`;

        tr.innerHTML = `
            <td class="font-semibold text-xs text-slate-900">${dl.date} (${formatDateShortThai(dl.date)})</td>
            <td class="font-bold text-xs text-slate-800">${escapeHtml(dl.team_name)}</td>
            <td class="text-center font-bold text-xs text-blue-600">${dl.total} งาน</td>
            <td class="text-center font-bold text-xs text-emerald-600">${dl.complete} งาน</td>
            <td class="text-center">${rejectCellHtml}</td>
            <td class="text-center">${badgeResult}</td>
            <td class="text-xs text-slate-600">${dl.areas || '-'}</td>
        `;

        const btnReject = tr.querySelector(".btn-daily-reject");
        if (btnReject) {
            btnReject.addEventListener("click", () => {
                openRejectCasesModal({
                    date: dl.date,
                    team: dl.team_name,
                    title: `งานที่ถูกปฏิเสธ: ${dl.team_name} — วันที่ ${dl.date} (${formatDateShortThai(dl.date)})`
                });
            });
        }
        tbody.appendChild(tr);
    });
}

// Update Alert Banner on Jobs Monitor View
function updateAlertLowestTeam(lowestTeam, totalJobs) {
    const alertCard = document.getElementById("alert-lowest-team");
    if (!alertCard) return;

    if (lowestTeam && totalJobs > 0) {
        alertCard.style.display = "flex";
        document.getElementById("lowest-team-name").textContent = lowestTeam.team_name;
        document.getElementById("lowest-team-pct").textContent = `${lowestTeam.complete_pct}%`;
        document.getElementById("lowest-team-counts").textContent = `สำเร็จ ${lowestTeam.complete}/${lowestTeam.total} งาน (ปฏิเสธ ${lowestTeam.reject} งาน)`;

        const reasonsContainer = document.getElementById("lowest-team-reasons");
        if (reasonsContainer) {
            reasonsContainer.innerHTML = "";
            if (lowestTeam.reasons && lowestTeam.reasons.length > 0) {
                lowestTeam.reasons.forEach(r => {
                    const tag = document.createElement("button");
                    tag.type = "button";
                    tag.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-100 hover:bg-white text-red-800 border border-red-200 transition cursor-pointer shadow-2xs";
                    tag.title = "คลิกเพื่อดูรายการงานของสาเหตุนี้";
                    tag.textContent = `${r.reason} (${r.count})`;
                    tag.addEventListener("click", () => openReasonDetailModal(r.reason, lowestTeam.team_name));
                    reasonsContainer.appendChild(tag);
                });
            } else {
                reasonsContainer.innerHTML = `<span class="text-xs text-white/80">ไม่มีเคสปฏิเสธ</span>`;
            }
        }
    } else {
        alertCard.style.display = "none";
    }
}

// Render Technician Deep-dive Cards on Monitor View
function renderTechnicianCards(teams) {
    const container = document.getElementById("technician-cards-grid");
    if (!container) return;

    container.innerHTML = "";

    teams.forEach((t, idx) => {
        const card = document.createElement("div");
        const rankClass = t.rate_tier === "low" ? "rank-low" : (t.rate_tier === "medium" ? "rank-medium" : "rank-high");
        
        let statusBadge = "";
        if (t.complete_pct < 50) {
            statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white animate-pulse">⚠️ ต่ำสุด</span>`;
        } else if (t.complete_pct < 75) {
            statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500 text-white">เฝ้าระวัง</span>`;
        } else {
            statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600 text-white">ยอดเยี่ยม</span>`;
        }

        let reasonsHtml = "";
        if (t.reasons && t.reasons.length > 0) {
            reasonsHtml = t.reasons.map(r => `
                <div onclick="openReasonDetailModal(${escapeHtml(JSON.stringify(r.reason))}, ${escapeHtml(JSON.stringify(t.team_name))})" class="flex items-center justify-between text-xs py-1 px-1.5 -mx-1.5 rounded-md hover:bg-red-50/80 cursor-pointer transition border-b border-gray-100 last:border-0" title="คลิกดูข้อมูลเคส: ${escapeHtml(r.reason)}">
                    <span class="text-gray-700 hover:text-red-700 truncate pr-2 font-medium">• ${escapeHtml(r.reason)}</span>
                    <span class="font-bold text-red-600 whitespace-nowrap bg-red-50 px-1.5 py-0.5 rounded text-[11px] border border-red-100">${r.count} เคส</span>
                </div>
            `).join("");
        } else {
            reasonsHtml = `<div class="text-xs text-emerald-600 font-medium py-0.5">✓ งานเรียบร้อยทุกเคส</div>`;
        }

        card.className = `panel-card p-4 hover:shadow-md transition-all ${rankClass} relative`;
        card.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <div>
                    <div class="flex items-center space-x-1.5">
                        <span class="text-[11px] font-bold text-slate-400">#${idx + 1}</span>
                        ${statusBadge}
                    </div>
                    <h3 class="font-bold text-sm text-slate-900 mt-0.5">${t.team_name}</h3>
                </div>
                <div class="text-right">
                    <div class="text-xl font-black ${t.complete_pct < 50 ? 'text-red-600' : (t.complete_pct < 75 ? 'text-amber-600' : 'text-emerald-600')}">
                        ${t.complete_pct}%
                    </div>
                </div>
            </div>

            <div class="w-full bg-slate-100 rounded-full h-1.5 mb-3 overflow-hidden">
                <div class="h-1.5 rounded-full ${t.complete_pct < 50 ? 'bg-red-500' : (t.complete_pct < 75 ? 'bg-amber-500' : 'bg-emerald-500')}" style="width: ${t.complete_pct}%"></div>
            </div>

            <div class="grid grid-cols-3 gap-1.5 mb-3 text-center">
                <div class="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    <div class="text-[10px] text-slate-500 font-medium">ทั้งหมด</div>
                    <div class="text-xs font-bold text-slate-800">${t.total}</div>
                </div>
                <div class="bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                    <div class="text-[10px] text-emerald-700 font-medium">สำเร็จ</div>
                    <div class="text-xs font-bold text-emerald-700">${t.complete}</div>
                </div>
                <div onclick="openRejectCasesModal({ team: ${escapeHtml(JSON.stringify(t.team_name))}, title: 'งานที่ถูกปฏิเสธ: ' + ${escapeHtml(JSON.stringify(t.team_name))} })" class="bg-red-50 hover:bg-red-100 p-1.5 rounded-lg border border-red-100 hover:border-red-300 cursor-pointer transition" title="คลิกดูงานที่ถูกปฏิเสธของช่างนี้">
                    <div class="text-[10px] text-red-700 font-medium">ปฏิเสธ</div>
                    <div class="text-xs font-bold text-red-700 underline decoration-dotted">${t.reject}</div>
                </div>
            </div>

            <div class="bg-slate-50 rounded-lg p-2.5 border border-slate-100 mb-2.5">
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>สาเหตุปัญหา (Reason Code)</span>
                    <span class="text-slate-400 font-normal">${t.reject} เคส</span>
                </div>
                <div class="space-y-0.5">${reasonsHtml}</div>
            </div>

            <button onclick="filterByTechnician('${t.team_name}')" class="w-full text-xs font-semibold py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 transition flex items-center justify-center space-x-1">
                <span>กรองดูงานของช่างนี้</span>
                <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
        `;
        container.appendChild(card);
    });

    initLucide();
}

function filterByTechnician(teamName) {
    const teamSelect = document.getElementById("filter-team");
    if (teamSelect) {
        teamSelect.value = teamName;
        filterTeam = teamName;
    }
    applyAllFilters();

    // Switch to monitor view and scroll to table
    const btnMonitor = document.getElementById("nav-btn-monitor");
    if (btnMonitor) btnMonitor.click();
}

// Helper: Group Reason Codes into Top 7 + "อื่นๆ (Others)" for Donut Charts
function buildTopReasonSlices(reasons = [], rejectCount = 0, topLimit = 7) {
    const list = Array.isArray(reasons) ? reasons : [];
    const totalReasonCases = list.reduce((sum, item) => sum + (item.count || 0), 0);
    const denom = totalReasonCases > 0 ? totalReasonCases : (rejectCount > 0 ? rejectCount : 1);

    const topItems = list.slice(0, topLimit).map((item, idx) => ({
        reason: item.reason,
        count: item.count,
        pct: Math.round((item.count / denom) * 1000) / 10,
        color: REASON_DONUT_COLORS[idx % (REASON_DONUT_COLORS.length - 1)],
        isOther: false,
        teams: item.teams || []
    }));

    const restItems = list.slice(topLimit);
    if (restItems.length > 0) {
        const otherCount = restItems.reduce((sum, item) => sum + (item.count || 0), 0);
        topItems.push({
            reason: `อื่นๆ (${restItems.length} หัวข้อ)`,
            count: otherCount,
            pct: Math.round((otherCount / denom) * 1000) / 10,
            color: REASON_DONUT_COLORS[REASON_DONUT_COLORS.length - 1],
            isOther: true,
            subReasons: restItems
        });
    }

    return {
        slices: topItems,
        totalReasonCases: totalReasonCases,
        displayTotal: rejectCount > 0 ? rejectCount : totalReasonCases
    };
}

// Render a Reject Reason Code Donut Chart + Center Overlay + Custom HTML Legend
function renderReasonDonutWidget({
    canvasId,
    centerId,
    legendId,
    existingChart,
    reasons,
    rejectCount
}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return existingChart;

    if (existingChart) {
        existingChart.destroy();
    }

    const { slices, totalReasonCases, displayTotal } = buildTopReasonSlices(reasons, rejectCount, 7);
    const hasData = slices.length > 0 && totalReasonCases > 0;

    const chartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: hasData ? slices.map(s => s.reason) : ["ไม่มีเคสปฏิเสธ"],
            datasets: [{
                data: hasData ? slices.map(s => s.count) : [1],
                backgroundColor: hasData ? slices.map(s => s.color) : ["#e2e8f0"],
                borderWidth: 2.5,
                borderColor: "#ffffff",
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            onClick: (evt, activeEls) => {
                if (!hasData || !activeEls || activeEls.length === 0) return;
                const idx = activeEls[0].index;
                const s = slices[idx];
                if (!s) return;
                if (s.isOther && s.subReasons) {
                    openReasonDetailModal("__OTHERS__", "ALL", s.subReasons.map(sr => sr.reason), s.reason);
                } else {
                    openReasonDetailModal(s.reason, "ALL");
                }
            },
            onHover: (evt, activeEls) => {
                if (evt && evt.native && evt.native.target) {
                    evt.native.target.style.cursor = (hasData && activeEls && activeEls.length > 0) ? "pointer" : "default";
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: hasData,
                    callbacks: {
                        title: (items) => {
                            if (!items || !items.length) return "";
                            const s = slices[items[0].dataIndex];
                            return s ? s.reason : "";
                        },
                        label: (context) => {
                            const s = slices[context.dataIndex];
                            if (!s) return "";
                            return ` จำนวน: ${s.count} เคส (${s.pct}%) — คลิกเพื่อดูรายการ`;
                        },
                        afterBody: (items) => {
                            if (!items || !items.length) return [];
                            const s = slices[items[0].dataIndex];
                            if (s && s.isOther && s.subReasons && s.subReasons.length > 0) {
                                const preview = s.subReasons.slice(0, 4).map(sr => `• ${sr.reason}: ${sr.count} เคส`);
                                if (s.subReasons.length > 4) {
                                    preview.push(`...และอีก ${s.subReasons.length - 4} หัวข้อ`);
                                }
                                return preview;
                            }
                            if (s && s.teams && s.teams.length > 0) {
                                const topTeam = s.teams[0];
                                return [`ทีมที่พบมากสุด: ${topTeam.team} (${topTeam.count} เคส)`];
                            }
                            return [];
                        }
                    }
                }
            }
        }
    });

    // Update Center Text
    const centerEl = document.getElementById(centerId);
    if (centerEl) {
        centerEl.innerHTML = `
            <div class="text-2xl sm:text-3xl font-black ${hasData ? 'text-rose-600' : 'text-slate-400'} leading-none">${displayTotal}</div>
            <div class="text-[11px] text-slate-500 font-semibold mt-1">เคสปฏิเสธ</div>
        `;
    }

    // Update Custom Compact Legend (Clickable!)
    const legendEl = document.getElementById(legendId);
    if (legendEl) {
        legendEl.innerHTML = "";
        if (!hasData) {
            legendEl.innerHTML = `<div class="col-span-full text-center text-slate-400 py-2">ไม่มีข้อมูลสาเหตุการปฏิเสธ</div>`;
        } else {
            slices.forEach((s, idx) => {
                const rowEl = document.createElement("div");
                rowEl.className = "flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white border border-slate-100 hover:border-rose-200 hover:bg-rose-50/40 cursor-pointer transition";
                rowEl.title = `คลิกเพื่อดูข้อมูล: ${s.reason} (${s.count} เคส / ${s.pct}%)`;
                rowEl.innerHTML = `
                    <div class="flex items-center space-x-1.5 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${s.color}"></span>
                        <span class="text-slate-700 font-medium truncate">${!s.isOther ? `<strong class="text-slate-400 mr-0.5">#${idx + 1}</strong>` : ''}${escapeHtml(s.reason)}</span>
                    </div>
                    <span class="font-bold text-slate-800 whitespace-nowrap shrink-0">${s.count} <span class="text-[10px] text-rose-600 font-semibold">(${s.pct}%)</span></span>
                `;
                rowEl.addEventListener("click", () => {
                    if (s.isOther && s.subReasons) {
                        openReasonDetailModal("__OTHERS__", "ALL", s.subReasons.map(sr => sr.reason), s.reason);
                    } else {
                        openReasonDetailModal(s.reason, "ALL");
                    }
                });
                legendEl.appendChild(rowEl);
            });
        }
    }

    return chartInstance;
}

// Render View 1: Reject Reason Code Donut + Top Reject Reasons List
function renderTrendReasonSection(m) {
    const reasons = (m && m.reason_codes) || [];
    const rejectCount = (m && m.reject_count) || 0;

    const totalBadge = document.getElementById("trend-reject-total-badge");
    if (totalBadge) {
        totalBadge.textContent = `ปฏิเสธรวม ${rejectCount} เคส`;
    }

    reasonDonutTrendChart = renderReasonDonutWidget({
        canvasId: "chart-reason-donut-trend",
        centerId: "reason-donut-trend-center",
        legendId: "reason-donut-trend-legend",
        existingChart: reasonDonutTrendChart,
        reasons: reasons,
        rejectCount: rejectCount
    });

    const listContainer = document.getElementById("trend-top-reasons-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    if (!reasons || reasons.length === 0) {
        listContainer.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">ไม่มีเคสปฏิเสธในช่วงเวลาที่เลือก</div>`;
        return;
    }

    const totalReasonCases = reasons.reduce((sum, r) => sum + (r.count || 0), 0) || 1;
    reasons.forEach((r, idx) => {
        const color = idx < 7 ? REASON_DONUT_COLORS[idx] : REASON_DONUT_COLORS[7];
        const pct = Math.round((r.count / totalReasonCases) * 1000) / 10;

        const card = document.createElement("div");
        card.className = "p-2.5 rounded-xl bg-slate-50/70 hover:bg-rose-50/40 border border-slate-100 hover:border-rose-200 transition shadow-2xs cursor-pointer group";
        card.title = `คลิกเพื่อดูรายการงานที่ติดปัญหา: ${r.reason}`;
        card.addEventListener("click", () => openReasonDetailModal(r.reason, "ALL"));

        card.innerHTML = `
            <div class="flex items-start justify-between gap-2 mb-1">
                <div class="flex items-center space-x-2 min-w-0">
                    <span class="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style="background-color: ${color}">
                        ${idx + 1}
                    </span>
                    <span class="text-xs font-bold text-slate-800 group-hover:text-rose-700 truncate transition" title="${escapeHtml(r.reason)}">${escapeHtml(r.reason)}</span>
                </div>
                <div class="flex items-center space-x-1.5 shrink-0">
                    <span class="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-100">
                        ${r.count} เคส (${pct}%)
                    </span>
                </div>
            </div>
            <div class="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden mb-1.5">
                <div class="h-1.5 rounded-full transition-all duration-300" style="width: ${Math.min(100, pct)}%; background-color: ${color}"></div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
                <div class="flex flex-wrap items-center gap-1 team-badges-slot"></div>
                <span class="text-blue-600 font-semibold group-hover:underline">คลิกดูข้อมูล &rarr;</span>
            </div>
        `;

        const slot = card.querySelector(".team-badges-slot");
        if (slot && r.teams) {
            r.teams.slice(0, 3).forEach(t => {
                const badge = document.createElement("button");
                badge.type = "button";
                badge.className = "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 transition";
                badge.textContent = `${t.team} (${t.count})`;
                badge.title = `คลิกดูเฉพาะงานของ ${t.team} ในหัวข้อนี้`;
                badge.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openReasonDetailModal(r.reason, t.team);
                });
                slot.appendChild(badge);
            });
        }

        listContainer.appendChild(card);
    });
}

// Render Reason Codes Analysis Section (View 2: Donut Chart + Detailed Clickable Cards)
function renderReasonCodesAnalysis(reasons, rejectCount = 0) {
    const badgeEl = document.getElementById("monitor-reject-total-badge");
    const totalCases = (reasons || []).reduce((s, r) => s + (r.count || 0), 0);
    const displayReject = rejectCount > 0 ? rejectCount : totalCases;
    if (badgeEl) {
        badgeEl.textContent = `งานปฏิเสธรวม ${displayReject} เคส (${(reasons || []).length} หัวข้อ)`;
    }

    reasonDonutMonitorChart = renderReasonDonutWidget({
        canvasId: "chart-reason-donut-monitor",
        centerId: "reason-donut-monitor-center",
        legendId: "reason-donut-monitor-legend",
        existingChart: reasonDonutMonitorChart,
        reasons: reasons || [],
        rejectCount: displayReject
    });

    const container = document.getElementById("reasons-analysis-container");
    if (!container) return;

    container.innerHTML = "";

    if (!reasons || reasons.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">ไม่มีเคสยกเลิกหรือปฏิเสธ</div>`;
        return;
    }

    const denom = totalCases > 0 ? totalCases : 1;

    reasons.forEach((r, idx) => {
        const item = document.createElement("div");
        item.className = "bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm text-xs hover:border-rose-300 hover:shadow-md cursor-pointer transition group";
        item.title = `คลิกเพื่อเปิดป๊อปอัพดูรายการงานของหัวข้อ: ${r.reason}`;
        item.addEventListener("click", () => openReasonDetailModal(r.reason, "ALL"));

        const color = idx < 7 ? REASON_DONUT_COLORS[idx] : REASON_DONUT_COLORS[7];
        const pct = Math.round((r.count / denom) * 1000) / 10;

        item.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
                <div class="flex items-center space-x-2">
                    <span class="w-5 h-5 flex items-center justify-center rounded-full text-white text-[11px] font-bold shrink-0" style="background-color: ${color}">#${idx + 1}</span>
                    <h4 class="font-bold text-slate-800 group-hover:text-rose-600 transition">${escapeHtml(r.reason)}</h4>
                </div>
                <div class="flex items-center space-x-2 shrink-0">
                    <span class="text-[11px] text-blue-600 font-semibold opacity-80 group-hover:opacity-100 group-hover:underline">คลิกดูรายละเอียด</span>
                    <span class="px-2 py-0.5 bg-red-50 text-red-700 rounded-lg text-[11px] font-bold border border-red-100">
                        ${r.count} เคส (${pct}%)
                    </span>
                </div>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mb-2">
                <div class="h-1.5 rounded-full" style="width: ${Math.min(100, pct)}%; background-color: ${color}"></div>
            </div>
            <div class="flex flex-wrap items-center mt-1 reason-team-badges"></div>
        `;

        const badgesWrap = item.querySelector(".reason-team-badges");
        if (badgesWrap && r.teams) {
            r.teams.forEach(t => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 mr-1 mb-1 transition font-medium";
                btn.textContent = `${t.team} (${t.count} เคส)`;
                btn.title = `คลิกดูเฉพาะงานของ ${t.team} ในหัวข้อนี้`;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openReasonDetailModal(r.reason, t.team);
                });
                badgesWrap.appendChild(btn);
            });
        }

        container.appendChild(item);
    });
}

// =========================================================================
// REASON CODE DETAIL POPUP MODAL
// =========================================================================
let modalActiveReason = ""; // "" / "ALL" = all reject reasons, "__OTHERS__" = other reasons set, or specific reason string
let modalActiveReasonSet = null; // Used when clicking "อื่นๆ (Others)"
let modalActiveDate = null; // Optional YYYY-MM-DD filter
let modalActiveMonth = null; // Optional YYYY-MM filter
let modalSubReasonFilter = "ALL"; // Filter by a specific reason when viewing all rejects for a date/month/team
let modalActiveTitle = "";
let modalSelectedTeam = "ALL";
let modalSearchText = "";

// Open Modal for a specific Reason Code
function openReasonDetailModal(reasonText, initialTeam = "ALL", multiReasonsList = null, customTitle = "") {
    const modal = document.getElementById("reason-detail-modal");
    if (!modal) return;

    modalActiveReason = reasonText;
    modalActiveReasonSet = Array.isArray(multiReasonsList) ? new Set(multiReasonsList) : null;
    modalActiveDate = null;
    modalActiveMonth = null;
    modalSubReasonFilter = "ALL";
    modalActiveTitle = customTitle || reasonText;
    modalSelectedTeam = initialTeam || "ALL";
    modalSearchText = "";

    const searchInput = document.getElementById("reason-modal-search");
    if (searchInput) searchInput.value = "";

    renderReasonDetailModalContent();
    modal.classList.remove("hidden");
    initLucide();
}

// Open Modal when clicking "ปฏิเสธ" (Reject count) in Matrix Table, Daily Log Table, Technician Card, or KPI Card
function openRejectCasesModal({ date = null, month = null, team = "ALL", title = "รายการงานที่ถูกปฏิเสธ (Reject)" } = {}) {
    const modal = document.getElementById("reason-detail-modal");
    if (!modal) return;

    modalActiveReason = "ALL";
    modalActiveReasonSet = null;
    modalActiveDate = date || null;
    modalActiveMonth = month || null;
    modalSubReasonFilter = "ALL";
    modalActiveTitle = title;
    modalSelectedTeam = team || "ALL";
    modalSearchText = "";

    const searchInput = document.getElementById("reason-modal-search");
    if (searchInput) searchInput.value = "";

    renderReasonDetailModalContent();
    modal.classList.remove("hidden");
    initLucide();
}

function closeReasonDetailModal() {
    const modal = document.getElementById("reason-detail-modal");
    if (modal) modal.classList.add("hidden");
}

function getModalBaseRows() {
    return filteredRows.filter(r => {
        const dt = (r["Appoint Date"] || "").trim();
        if (modalActiveDate && dt !== modalActiveDate) return false;
        if (modalActiveMonth && !dt.startsWith(modalActiveMonth)) return false;

        const rs = (r["Reason Code"] || "").trim();

        if (modalActiveReason === "ALL") {
            return r.NormalizedStatus === "Reject";
        }
        if (!rs) return false;
        if (modalActiveReason === "__OTHERS__" && modalActiveReasonSet) {
            return modalActiveReasonSet.has(rs);
        }
        return rs === modalActiveReason;
    });
}

function renderReasonDetailModalContent() {
    const baseRows = getModalBaseRows();
    const metrics = computeCurrentMetrics(filteredRows);
    const totalReject = metrics.reject_count || 1;
    const rankIdx = (metrics.reason_codes || []).findIndex(rc => rc.reason === modalActiveReason);

    // Header Info
    const rankBadge = document.getElementById("reason-modal-rank-badge");
    if (rankBadge) {
        if (modalActiveReason === "ALL") {
            rankBadge.style.backgroundColor = "#e11d48";
            rankBadge.textContent = "Rej";
        } else {
            const rankColor = (rankIdx >= 0 && rankIdx < 7) ? REASON_DONUT_COLORS[rankIdx] : REASON_DONUT_COLORS[7];
            rankBadge.style.backgroundColor = rankColor;
            rankBadge.textContent = rankIdx >= 0 ? `#${rankIdx + 1}` : "อื่นๆ";
        }
    }

    const titleEl = document.getElementById("reason-modal-title");
    if (titleEl) titleEl.textContent = modalActiveTitle;

    const countBadge = document.getElementById("reason-modal-count-badge");
    if (countBadge) countBadge.textContent = `${baseRows.length} เคส`;

    const pctBadge = document.getElementById("reason-modal-pct-badge");
    if (pctBadge) {
        const pct = Math.round((baseRows.length / totalReject) * 1000) / 10;
        pctBadge.textContent = `(${pct}% ของงานปฏิเสธในช่วงที่เลือก)`;
    }

    // Team Filter Pills Bar
    const teamCounts = {};
    baseRows.forEach(r => {
        const t = (r["ทีมช่างติดตั้ง"] || "").trim() || "ไม่ระบุช่าง";
        teamCounts[t] = (teamCounts[t] || 0) + 1;
    });
    const sortedTeams = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);

    const teamsBar = document.getElementById("reason-modal-teams-bar");
    if (teamsBar) {
        teamsBar.innerHTML = "";

        const allBtn = document.createElement("button");
        allBtn.type = "button";
        const isAll = modalSelectedTeam === "ALL";
        allBtn.className = isAll
            ? "px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-xs transition"
            : "px-3 py-1 rounded-full text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition";
        allBtn.textContent = `ทุกทีมช่าง (${baseRows.length} เคส)`;
        allBtn.addEventListener("click", () => {
            modalSelectedTeam = "ALL";
            renderReasonDetailModalContent();
        });
        teamsBar.appendChild(allBtn);

        sortedTeams.forEach(([teamName, cnt]) => {
            const btn = document.createElement("button");
            btn.type = "button";
            const active = modalSelectedTeam === teamName;
            btn.className = active
                ? "px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-xs transition"
                : "px-3 py-1 rounded-full text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition";
            btn.textContent = `${teamName} (${cnt} เคส)`;
            btn.addEventListener("click", () => {
                modalSelectedTeam = teamName;
                renderReasonDetailModalContent();
            });
            teamsBar.appendChild(btn);
        });
    }

    // Filter rows by selected team first (to compute Reason Code pills when modalActiveReason === "ALL" or "__OTHERS__")
    const rowsAfterTeam = baseRows.filter(r => {
        const t = (r["ทีมช่างติดตั้ง"] || "").trim() || "ไม่ระบุช่าง";
        return modalSelectedTeam === "ALL" || t === modalSelectedTeam;
    });

    // Reason Code Breakdown Pills Bar (shown when viewing Reject cases by Date/Month/Team or Others)
    const reasonsBarEl = document.getElementById("reason-modal-reasons-bar");
    if (reasonsBarEl) {
        if (modalActiveReason === "ALL" || modalActiveReason === "__OTHERS__") {
            const rMap = {};
            rowsAfterTeam.forEach(r => {
                const rs = (r["Reason Code"] || "").trim() || "ไม่ระบุ Reason Code";
                rMap[rs] = (rMap[rs] || 0) + 1;
            });
            const sortedReasons = Object.entries(rMap).sort((a, b) => b[1] - a[1]);
            reasonsBarEl.classList.remove("hidden");
            reasonsBarEl.innerHTML = `<span class="text-slate-500 font-semibold mr-1">สาเหตุที่พบ (คลิกกรอง):</span>`;

            const allReasonBtn = document.createElement("button");
            allReasonBtn.type = "button";
            allReasonBtn.className = modalSubReasonFilter === "ALL"
                ? "px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-rose-600 text-white transition"
                : "px-2.5 py-0.5 rounded-lg text-[11px] font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition";
            allReasonBtn.textContent = `ทุกสาเหตุ (${rowsAfterTeam.length})`;
            allReasonBtn.addEventListener("click", () => {
                modalSubReasonFilter = "ALL";
                renderReasonDetailModalContent();
            });
            reasonsBarEl.appendChild(allReasonBtn);

            sortedReasons.forEach(([rName, cnt]) => {
                const rBtn = document.createElement("button");
                rBtn.type = "button";
                const isSelected = modalSubReasonFilter === rName;
                rBtn.className = isSelected
                    ? "px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-rose-600 text-white transition"
                    : "px-2.5 py-0.5 rounded-lg text-[11px] font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition";
                rBtn.textContent = `${rName} (${cnt} เคส)`;
                rBtn.addEventListener("click", () => {
                    modalSubReasonFilter = isSelected ? "ALL" : rName;
                    renderReasonDetailModalContent();
                });
                reasonsBarEl.appendChild(rBtn);
            });
        } else {
            reasonsBarEl.classList.add("hidden");
            reasonsBarEl.innerHTML = "";
        }
    }

    // Filter rows by subReason & modal search input
    const displayRows = rowsAfterTeam.filter(r => {
        if ((modalActiveReason === "ALL" || modalActiveReason === "__OTHERS__") && modalSubReasonFilter !== "ALL") {
            const rs = (r["Reason Code"] || "").trim() || "ไม่ระบุ Reason Code";
            if (rs !== modalSubReasonFilter) return false;
        }

        if (modalSearchText) {
            const q = modalSearchText.toLowerCase();
            const haystack = [
                r["Appoint Date"],
                r["Appoint Time"],
                r["CCID"],
                r["ชื่อลูกค้า"],
                r["เบอร์ติดต่อลูกค้า"],
                r["Area"],
                r["Subdistrict"],
                r["RawArea"],
                r["ทีมช่างติดตั้ง"],
                r["Service Event"],
                r["Reason Code"],
                r["Remark"]
            ].filter(Boolean).join(" ").toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });

    // Area / District Summary Bar
    const areaSummaryEl = document.getElementById("reason-modal-area-summary");
    if (areaSummaryEl) {
        const areaMap = {};
        displayRows.forEach(r => {
            const ar = (r["Area"] || "").trim() || "ไม่ระบุพื้นที่";
            areaMap[ar] = (areaMap[ar] || 0) + 1;
        });
        const sortedAreas = Object.entries(areaMap).sort((a, b) => b[1] - a[1]);
        if (sortedAreas.length > 0) {
            areaSummaryEl.innerHTML = `<span class="text-slate-500 font-semibold mr-1">พื้นที่ที่พบปัญหา:</span>` +
                sortedAreas.map(([ar, c]) =>
                    `<span class="inline-flex items-center px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-medium text-[11px]">อ. ${escapeHtml(ar)} (${c} เคส)</span>`
                ).join("");
        } else {
            areaSummaryEl.innerHTML = "";
        }
    }

    // Render Table Rows
    const tbody = document.getElementById("reason-modal-table-body");
    if (tbody) {
        tbody.innerHTML = "";
        if (displayRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 text-xs">ไม่พบรายการที่ตรงกับเงื่อนไข</td></tr>`;
        } else {
            displayRows.forEach((r, idx) => {
                const tr = document.createElement("tr");
                tr.className = "hover:bg-slate-50 transition border-b border-gray-100 text-xs";

                const appointDate = r["Appoint Date"] || "-";
                const appointTime = r["Appoint Time"] || "-";
                const ccid = r["CCID"] || "-";
                const team = r["ทีมช่างติดตั้ง"] || "-";
                const customerName = r["ชื่อลูกค้า"] || "-";
                const phone = r["เบอร์ติดต่อลูกค้า"] || "-";
                const serviceEvent = r["Service Event"] || "-";
                const reasonCode = r["Reason Code"] || "-";
                const remark = r["Remark"] || "";
                const st = r.NormalizedStatus || "Reject";

                const statusBadge = st === "Reject"
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold badge-reject"><span class="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span>Reject</span>`
                    : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold badge-other">${escapeHtml(st)}</span>`;

                tr.innerHTML = `
                    <td class="font-mono text-slate-400">${idx + 1}</td>
                    <td class="whitespace-nowrap">
                        <div class="font-bold text-slate-900">${escapeHtml(appointDate)}</div>
                        <div class="text-slate-500 font-mono text-[11px]">${escapeHtml(appointTime)}</div>
                    </td>
                    <td class="whitespace-nowrap">
                        <div class="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded inline-block">${escapeHtml(ccid)}</div>
                        <div class="text-slate-500 mt-0.5 font-medium text-[11px]">${escapeHtml(serviceEvent)}</div>
                    </td>
                    <td class="whitespace-nowrap"><div class="font-semibold text-slate-800">${escapeHtml(team)}</div></td>
                    <td class="whitespace-nowrap">
                        <div class="font-semibold text-slate-900">${escapeHtml(customerName)}</div>
                        <div class="text-slate-500 flex items-center mt-0.5">
                            <a href="tel:${escapeHtml(phone)}" class="hover:text-blue-600 font-mono">${escapeHtml(phone)}</a>
                        </div>
                    </td>
                    <td class="whitespace-nowrap">${statusBadge}</td>
                    <td class="min-w-[360px] whitespace-normal break-words">
                        <div class="text-rose-700 font-semibold leading-snug">${escapeHtml(reasonCode)}</div>
                        ${remark ? `<div class="text-[11px] text-slate-700 bg-amber-50/70 border border-amber-200/80 rounded-lg px-2.5 py-1 mt-1 whitespace-normal break-words"><strong>หมายเหตุ:</strong> ${escapeHtml(remark)}</div>` : '<div class="text-[11px] text-slate-400 mt-0.5">- ไม่มีหมายเหตุเพิ่มเติม -</div>'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    const footerSummary = document.getElementById("reason-modal-footer-summary");
    if (footerSummary) {
        footerSummary.textContent = `แสดง ${displayRows.length} จากทั้งหมด ${baseRows.length} เคสในหัวข้อนี้`;
    }
}

// Render Monitor View Job Table
function renderTable() {
    const tbody = document.getElementById("jobs-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    const filteredCountEl = document.getElementById("table-filtered-count");
    if (filteredCountEl) {
        filteredCountEl.textContent = `แสดง ${filteredRows.length} จากทั้งหมด ${allRows.length} รายการ`;
    }

    if (filteredRows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-slate-400 text-xs">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
                    ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา
                </td>
            </tr>
        `;
        initLucide();
        renderPagination(0);
        return;
    }

    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, filteredRows.length);
    const pageRows = filteredRows.slice(startIdx, endIdx);

    pageRows.forEach((r, idx) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 transition border-b border-gray-100 text-xs";

        let statusBadge = "";
        const st = r.NormalizedStatus;
        if (st === "Complete") {
            statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold badge-complete"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>Complete</span>`;
        } else if (st === "Reject") {
            statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold badge-reject"><span class="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span>Reject</span>`;
        } else {
            statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold badge-other">${st || 'Pending'}</span>`;
        }

        const appointDate = r["Appoint Date"] || "-";
        const appointTime = r["Appoint Time"] || "-";
        const ccid = r["CCID"] || "-";
        const team = r["ทีมช่างติดตั้ง"] || "-";
        const customerName = r["ชื่อลูกค้า"] || "-";
        const phone = r["เบอร์ติดต่อลูกค้า"] || "-";
        const area = r["Area"] || "-";
        const rawArea = r["RawArea"] || area;
        const subdistrict = r["Subdistrict"] || "";
        const serviceEvent = r["Service Event"] || "-";
        const reasonCode = r["Reason Code"] || "-";
        const remark = r["Remark"] || "";

        tr.innerHTML = `
            <td class="font-mono text-slate-400">${startIdx + idx + 1}</td>
            <td>
                <div class="font-bold text-slate-900">${appointDate}</div>
                <div class="text-slate-500 font-mono">${appointTime}</div>
            </td>
            <td>
                <div class="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded inline-block">${ccid}</div>
                <div class="text-slate-500 mt-0.5 font-medium">${serviceEvent}</div>
            </td>
            <td><div class="font-medium text-slate-800">${team}</div></td>
            <td>
                <div class="font-semibold text-slate-900">${customerName}</div>
                <div class="text-slate-500 flex items-center mt-0.5">
                    <i data-lucide="phone" class="w-3 h-3 mr-1 text-slate-400"></i>
                    <a href="tel:${phone}" class="hover:text-blue-600">${phone}</a>
                </div>
            </td>
            <td>
                <div class="font-semibold text-slate-800 max-w-xs truncate" title="${escapeHtml(rawArea)}">${escapeHtml(area)}</div>
                ${subdistrict ? `<div class="text-[11px] text-slate-400">ต. ${escapeHtml(subdistrict)}</div>` : ''}
            </td>
            <td>${statusBadge}</td>
            <td class="min-w-[320px] whitespace-normal break-words">
                <div class="${reasonCode !== '-' ? 'text-red-700 font-medium leading-snug' : 'text-slate-400'}">
                    ${escapeHtml(reasonCode)}
                </div>
                ${remark ? `<div class="text-[11px] text-slate-600 bg-slate-100 rounded px-2 py-1 mt-1 whitespace-normal break-words"><strong>หมายเหตุ:</strong> ${escapeHtml(remark)}</div>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    initLucide();
    renderPagination(filteredRows.length);
}

// Pagination Controls
function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
    const container = document.getElementById("pagination-container");
    if (!container) return;

    container.innerHTML = `
        <div class="flex items-center space-x-1 text-xs">
            <button onclick="changePage(1)" ${currentPage === 1 ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">หน้าแรก</button>
            <button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} class="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">ก่อนหน้า</button>
            <span class="px-3 py-1 font-semibold text-slate-700">หน้า ${currentPage} จาก ${totalPages}</span>
            <button onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} class="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">ถัดไป</button>
            <button onclick="changePage(${totalPages})" ${currentPage >= totalPages ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">หน้าสุดท้าย</button>
        </div>
    `;
}

function changePage(page) {
    const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderTable();
    }
}

// Apply All Filters across both views
function applyAllFilters() {
    filteredRows = allRows.filter(r => {
        const d = (r["Appoint Date"] || "").trim();

        // Year filter
        if (filterYear !== "ALL" && !d.startsWith(filterYear)) return false;

        // Month filter
        if (filterMonth !== "ALL" && !d.startsWith(filterMonth)) return false;

        // Single Date in Month filter
        if (filterDate && filterDate !== "ALL" && d !== filterDate) return false;

        // Status filter
        if (filterStatus !== "ALL" && r.NormalizedStatus !== filterStatus) return false;

        // District (อำเภอ) filter
        if (filterArea !== "ALL" && (r["Area"] || "").trim() !== filterArea) return false;

        // Subdistrict (ตำบล) filter
        if (filterSubdistrict !== "ALL" && (r["Subdistrict"] || "").trim() !== filterSubdistrict) return false;

        // Team filter
        if (filterTeam !== "ALL" && (r["ทีมช่างติดตั้ง"] || "").trim() !== filterTeam) return false;

        // Event filter
        if (filterEvent !== "ALL" && (r["Service Event"] || "").trim() !== filterEvent) return false;

        // Text search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const textToSearch = [
                r["Appoint Date"],
                r["CCID"],
                r["ชื่อลูกค้า"],
                r["เบอร์ติดต่อลูกค้า"],
                r["Area"],
                r["RawArea"],
                r["District"],
                r["Subdistrict"],
                `อ.${r["District"] || r["Area"]}`,
                `อำเภอ${r["District"] || r["Area"]}`,
                `ต.${r["Subdistrict"]}`,
                `ตำบล${r["Subdistrict"]}`,
                r["ทีมช่างติดตั้ง"],
                r["Service Event"],
                r["RawServiceEvent"],
                r["Reason Code"],
                r["Remark"]
            ].filter(Boolean).join(" ").toLowerCase();

            if (!textToSearch.includes(q)) return false;
        }

        return true;
    });

    updateDashboardView();
}

// Setup Event Listeners
function setupEventListeners() {
    // 1. Sync button (syncs both Install and Repair data)
    const btnSync = document.getElementById("btn-sync");
    if (btnSync) {
        btnSync.addEventListener("click", () => {
            if (currentMainPage === "repair") {
                loadRepairDashboardData(true);
                loadDashboardData(false);
            } else {
                loadDashboardData(true);
                loadRepairDashboardData(false);
            }
        });
    }

    // 2. Toolbar filters
    const yearSelect = document.getElementById("filter-year");
    if (yearSelect) {
        yearSelect.addEventListener("change", (e) => {
            filterYear = e.target.value;
            populateDateDropdown(filterMonth, filterYear);
            applyAllFilters();
        });
    }

    const monthSelect = document.getElementById("filter-month");
    if (monthSelect) {
        monthSelect.addEventListener("change", (e) => {
            filterMonth = e.target.value;
            filterDate = "ALL"; // Reset date selection when switching month
            populateDateDropdown(filterMonth, filterYear);
            applyAllFilters();
        });
    }

    // Single Date in Month select
    const dateSelect = document.getElementById("filter-date");
    if (dateSelect) {
        dateSelect.addEventListener("change", (e) => {
            filterDate = e.target.value;
            applyAllFilters();
        });
    }

    // Calendar Picker integration
    const customDateInput = document.getElementById("filter-custom-date");
    const btnOpenCalendar = document.getElementById("btn-open-calendar");

    if (btnOpenCalendar && customDateInput) {
        btnOpenCalendar.addEventListener("click", () => {
            if (typeof customDateInput.showPicker === 'function') {
                customDateInput.showPicker();
            } else {
                customDateInput.focus();
                customDateInput.click();
            }
        });

        customDateInput.addEventListener("change", (e) => {
            const pickedDate = e.target.value;
            if (!pickedDate) return;

            const ym = pickedDate.slice(0, 7);
            if (filterMonth !== "ALL" && filterMonth !== ym) {
                filterMonth = ym;
                if (monthSelect) monthSelect.value = ym;
            }

            filterDate = pickedDate;
            populateDateDropdown(filterMonth, filterYear);
            if (dateSelect) {
                let exists = Array.from(dateSelect.options).some(opt => opt.value === pickedDate);
                if (!exists) {
                    const newOpt = new Option(`${formatDateShortThai(pickedDate)} (${pickedDate})`, pickedDate, true, true);
                    dateSelect.add(newOpt);
                }
                dateSelect.value = pickedDate;
            }

            applyAllFilters();
        });
    }

    const statusSelect = document.getElementById("filter-status");
    if (statusSelect) {
        statusSelect.addEventListener("change", (e) => {
            filterStatus = e.target.value;
            applyAllFilters();
        });
    }

    const areaSelect = document.getElementById("filter-area");
    if (areaSelect) {
        areaSelect.addEventListener("change", (e) => {
            filterArea = e.target.value;
            filterSubdistrict = "ALL";
            updateSubdistrictDropdown();
            applyAllFilters();
        });
    }

    const subdistrictSelect = document.getElementById("filter-subdistrict");
    if (subdistrictSelect) {
        subdistrictSelect.addEventListener("change", (e) => {
            filterSubdistrict = e.target.value;
            applyAllFilters();
        });
    }

    const teamSelect = document.getElementById("filter-team");
    if (teamSelect) {
        teamSelect.addEventListener("change", (e) => {
            filterTeam = e.target.value;
            applyAllFilters();
        });
    }

    const eventSelect = document.getElementById("filter-event");
    if (eventSelect) {
        eventSelect.addEventListener("change", (e) => {
            filterEvent = e.target.value;
            applyAllFilters();
        });
    }

    // Reset Filters button
    const btnReset = document.getElementById("btn-reset-filters");
    if (btnReset) {
        btnReset.addEventListener("click", () => {
            filterYear = "ALL";
            filterMonth = "ALL";
            filterDate = "ALL";
            filterStatus = "ALL";
            filterArea = "ALL";
            filterSubdistrict = "ALL";
            filterTeam = "ALL";
            filterEvent = "ALL";
            searchQuery = "";
            trendTeamFilter = "ALL";

            if (yearSelect) yearSelect.value = "ALL";
            if (monthSelect) monthSelect.value = "ALL";
            populateDateDropdown("ALL", "ALL");
            if (dateSelect) dateSelect.value = "ALL";
            if (customDateInput) customDateInput.value = "";
            if (statusSelect) statusSelect.value = "ALL";
            if (areaSelect) areaSelect.value = "ALL";
            updateSubdistrictDropdown();
            if (subdistrictSelect) subdistrictSelect.value = "ALL";
            if (teamSelect) teamSelect.value = "ALL";
            if (eventSelect) eventSelect.value = "ALL";
            const searchInput = document.getElementById("search-input");
            if (searchInput) searchInput.value = "";
            const trendTeamSelect = document.getElementById("trend-team-filter");
            if (trendTeamSelect) trendTeamSelect.value = "ALL";

            applyAllFilters();
            showToast("รีเซ็ตตัวกรองทั้งหมดแล้ว", "info");
        });
    }

    // Search input
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            searchQuery = e.target.value.trim();
            applyAllFilters();
        });
    }

    // Rows per page
    const selectRowsPerPage = document.getElementById("select-rows-per-page");
    if (selectRowsPerPage) {
        selectRowsPerPage.addEventListener("change", (e) => {
            rowsPerPage = parseInt(e.target.value);
            currentPage = 1;
            renderTable();
        });
    }

    // Export CSV
    const btnExport = document.getElementById("btn-export-csv");
    if (btnExport) {
        btnExport.addEventListener("click", () => {
            if (currentMainPage === "repair") {
                exportRepairDataToCSV();
            } else {
                exportFilteredDataToCSV();
            }
        });
    }

    // Settings Modal
    const btnSettings = document.getElementById("btn-settings");
    const modalSettings = document.getElementById("settings-modal");
    const btnCloseModal = document.getElementById("btn-close-modal");
    const btnSaveSettings = document.getElementById("btn-save-settings");

    if (btnSettings && modalSettings) {
        btnSettings.addEventListener("click", () => {
            modalSettings.classList.remove("hidden");
            const urlInput = document.getElementById("input-sheet-url");
            if (urlInput && dashboardData && dashboardData.sheet_url) {
                urlInput.value = dashboardData.sheet_url;
            }
        });
    }

    if (btnCloseModal && modalSettings) {
        btnCloseModal.addEventListener("click", () => {
            modalSettings.classList.add("hidden");
        });
    }

    if (btnSaveSettings) {
        btnSaveSettings.addEventListener("click", async () => {
            const urlInput = document.getElementById("input-sheet-url");
            const newUrl = urlInput ? urlInput.value.trim() : "";
            if (!newUrl) return;

            if (typeof google !== "undefined" && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(() => {
                        showToast("บันทึกการตั้งค่าและซิงค์ข้อมูลใหม่สำเร็จ", "success");
                        modalSettings.classList.add("hidden");
                        loadDashboardData(false);
                        loadRepairDashboardData(false);
                    })
                    .withFailureHandler((err) => {
                        showToast("ไม่สามารถบันทึกได้: " + (err && err.message ? err.message : err), "error");
                    })
                    .setSpreadsheetUrl(newUrl);
                return;
            }

            try {
                const res = await fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sheet_url: newUrl })
                });
                if (res.ok) {
                    showToast("บันทึกการตั้งค่าและซิงค์ข้อมูลใหม่สำเร็จ", "success");
                    modalSettings.classList.add("hidden");
                    loadDashboardData(false);
                    loadRepairDashboardData(false);
                }
            } catch (err) {
                showToast("ไม่สามารถบันทึกได้: " + err.message, "error");
            }
        });
    }

    // Reason Detail Modal listeners
    const reasonModal = document.getElementById("reason-detail-modal");
    const btnCloseReasonModal = document.getElementById("btn-close-reason-modal");
    const reasonModalSearch = document.getElementById("reason-modal-search");

    if (btnCloseReasonModal) {
        btnCloseReasonModal.addEventListener("click", closeReasonDetailModal);
    }
    if (reasonModal) {
        reasonModal.addEventListener("click", (e) => {
            if (e.target === reasonModal) closeReasonDetailModal();
        });
    }
    if (reasonModalSearch) {
        reasonModalSearch.addEventListener("input", (e) => {
            modalSearchText = e.target.value.trim();
            renderReasonDetailModalContent();
        });
    }
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && reasonModal && !reasonModal.classList.contains("hidden")) {
            closeReasonDetailModal();
        }
    });
}

// Auto-Sync Setup
function setupAutoSync(intervalSeconds) {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    if (intervalSeconds <= 0) return;

    autoSyncSecondsLeft = intervalSeconds;

    countdownInterval = setInterval(() => {
        autoSyncSecondsLeft--;
        if (autoSyncSecondsLeft <= 0) {
            autoSyncSecondsLeft = intervalSeconds;
            loadDashboardData(true);
            loadRepairDashboardData(false);
        }
    }, 1000);
}

// Toast Notification
function showToast(message, type = "info") {
    const toast = document.createElement("div");
    let bg = "bg-slate-900 text-white";
    if (type === "success") bg = "bg-emerald-600 text-white";
    if (type === "warning") bg = "bg-amber-600 text-white";
    if (type === "error") bg = "bg-red-600 text-white";

    toast.className = `fixed bottom-5 right-5 z-50 ${bg} px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-2 transition-all duration-300 transform translate-y-4 opacity-0`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.remove("translate-y-4", "opacity-0"), 10);
    setTimeout(() => {
        toast.classList.add("translate-y-4", "opacity-0");
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// Export Filtered Table Data to CSV
function exportFilteredDataToCSV() {
    if (filteredRows.length === 0) {
        showToast("ไม่มีข้อมูลสำหรับส่งออก", "warning");
        return;
    }

    const headers = ["#", "Appoint Date", "Appoint Time", "CCID", "Service Event", "ทีมช่างติดตั้ง", "ชื่อลูกค้า", "เบอร์ติดต่อลูกค้า", "อำเภอ (District)", "ตำบล (Subdistrict)", "พื้นที่เดิม (Raw Area)", "Status", "Reason Code", "Remark"];
    const csvContent = [headers.join(",")];

    filteredRows.forEach((r, idx) => {
        const row = [
            idx + 1,
            `"${(r['Appoint Date'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Appoint Time'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['CCID'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Service Event'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['ทีมช่างติดตั้ง'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['ชื่อลูกค้า'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['เบอร์ติดต่อลูกค้า'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Area'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Subdistrict'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['RawArea'] || r['Area'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['NormalizedStatus'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Reason Code'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Remark'] || '').replace(/\x22/g, '""')}"`
        ];
        csvContent.push(row.join(","));
    });

    const blob = new Blob(["\uFEFF" + csvContent.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `install_performance_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("ส่งออกข้อมูล CSV สำเร็จ", "success");
}

// ============================================================================
// PAGE 2: แดชบอร์ดงานซ่อม (Repair & Maintenance Dashboard)
// Sheet URL: gid=470684857
// ============================================================================

let repairDashboardData = null;
let allRepairRows = [];
let filteredRepairRows = [];
let repairCurrentPage = 1;
let repairRowsPerPage = 15;

// Repair Filter State
let repairFilterYear = "ALL";
let repairFilterMonth = "ALL";
let repairFilterDate = "ALL";
let repairFilterStatus = "ALL";
let repairFilterAction = "ALL";
let repairFilterDistrict = "ALL";
let repairFilterSubdistrict = "ALL";
let repairFilterTeam = "ALL";
let repairSearchQuery = "";
let repairDailyLogFilter = "all"; // "all" | "pass" | "low" | "fail"
let repairRepeatMode = "strict";  // "strict" (เฉพาะหลัง Complete + เข้าซ่อม) | "all" (ดูเบอร์ซ้ำทุกสถานะ)
let currentRepairTab = 1;         // 1 | 2 | 3 | 4 | 5 | 6

// Switch between the 6 sub-pages of Page 2 (งานซ่อม)
function switchRepairTab(tabNum) {
    currentRepairTab = tabNum;
    for (let i = 1; i <= 6; i++) {
        const btn = document.getElementById(`repair-nav-btn-${i}`);
        const sec = document.getElementById(`repair-sec-${i}`);
        if (btn) btn.classList.toggle("active-teal", i === tabNum);
        if (sec) sec.classList.toggle("hidden", i !== tabNum);
    }

    setTimeout(() => {
        if (allRepairRows.length > 0) {
            const m = computeRepairMetrics(filteredRepairRows, allRepairRows);
            if (tabNum === 1) {
                renderRepairSection1DailyStatus(m);
                renderRepairJobsTable();
            } else if (tabNum === 2) {
                renderRepairSection2ReasonCodes(m);
            } else if (tabNum === 3) {
                renderRepairSection3Productivity(m);
            } else if (tabNum === 4) {
                renderRepairSection4RepeatFaults(m);
            } else if (tabNum === 5) {
                renderRepairSection5AreaStats(m);
            } else if (tabNum === 6) {
                renderRepairSection6PendingAlerts(m);
            }
        }
        initLucide();
    }, 50);
}

// Repair Chart Instances
let chartRepairDailyStatus = null;
let chartRepairStatusDonut = null;
let chartRepairActionDonut = null;
let chartRepairReasonDonut = null;
let chartRepairProductivity = null;
let chartRepairAreaDistrict = null;

// Switch between Page 1 (งานติดตั้ง) and Page 2 (งานซ่อม) via Left Sidebar
function switchMainPage(pageName) {
    currentMainPage = pageName;

    const btnInstall = document.getElementById("sidebar-btn-install");
    const btnRepair = document.getElementById("sidebar-btn-repair");
    const subnavInstall = document.getElementById("sidebar-install-subnav");
    const subnavRepair = document.getElementById("sidebar-repair-subnav");

    const wrapperInstall = document.getElementById("page-install-wrapper");
    const wrapperRepair = document.getElementById("page-repair-wrapper");

    const headerTitle = document.getElementById("header-main-title");
    const headerIcon = document.getElementById("header-brand-icon");
    const headerTotalBadge = document.getElementById("header-total-badge");

    if (pageName === "repair") {
        if (btnInstall) btnInstall.classList.remove("active-install");
        if (btnRepair) btnRepair.classList.add("active-repair");
        if (subnavInstall) subnavInstall.classList.add("hidden");
        if (subnavRepair) subnavRepair.classList.remove("hidden");

        if (wrapperInstall) wrapperInstall.classList.add("hidden");
        if (wrapperRepair) wrapperRepair.classList.remove("hidden");

        if (headerTitle) headerTitle.textContent = "แดชบอร์ดงานซ่อม (Repair & Maintenance Dashboard)";
        if (headerIcon) {
            headerIcon.className = "w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-200 shrink-0";
            headerIcon.innerHTML = `<i data-lucide="wrench" class="w-5 h-5"></i>`;
        }
        if (headerTotalBadge) {
            headerTotalBadge.textContent = `(${allRepairRows.length} งานซ่อม)`;
            headerTotalBadge.className = "font-semibold text-teal-600";
        }

        setTimeout(() => {
            if (allRepairRows.length > 0) {
                updateRepairDashboardView();
            } else {
                loadRepairDashboardData(false);
            }
            initLucide();
        }, 50);
    } else {
        if (btnInstall) btnInstall.classList.add("active-install");
        if (btnRepair) btnRepair.classList.remove("active-repair");
        if (subnavInstall) subnavInstall.classList.remove("hidden");
        if (subnavRepair) subnavRepair.classList.add("hidden");

        if (wrapperInstall) wrapperInstall.classList.remove("hidden");
        if (wrapperRepair) wrapperRepair.classList.add("hidden");

        if (headerTitle) headerTitle.textContent = "แดชบอร์ดงานติดตั้ง (Install Dashboard Lower North)";
        if (headerIcon) {
            headerIcon.className = "w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-200 shrink-0";
            headerIcon.innerHTML = `<i data-lucide="bar-chart-2" class="w-5 h-5"></i>`;
        }
        if (headerTotalBadge) {
            headerTotalBadge.textContent = `(${allRows.length} งานติดตั้ง)`;
            headerTotalBadge.className = "font-semibold text-blue-600";
        }

        setTimeout(() => {
            if (dashboardData) {
                updateDashboardView();
            }
            initLucide();
        }, 50);
    }
}

// Normalize a single repair row
function normalizeRepairRow(r, idx) {
    const rawAppoint = String(r["RawAppointDate"] || r["Appoint Date"] || "").trim();
    const partsDt = rawAppoint.split(/\s+/);
    const datePart = partsDt[0] || "";
    const timePart = r["Appoint Time"] || (partsDt.length > 1 ? partsDt.slice(1).join(" ") : "");

    const rawArea = String(r["RawArea"] || r["Area Name"] || r["Area"] || "").trim();
    const parsedArea = parseDistrictAndSub(rawArea);

    const rawSt = String(r["Status"] || "").trim();
    const stLower = rawSt.toLowerCase();
    let normStatus = "Pending";
    if (["complete", "completed", "เสร็จสิ้น", "เรียบร้อย"].includes(stLower)) normStatus = "Complete";
    else if (["retrun", "return", "คืนงาน"].includes(stLower)) normStatus = "Retrun";
    else if (["cencel", "cancel", "cancelled", "ยกเลิก"].includes(stLower)) normStatus = "Cencel";
    else if (rawSt) normStatus = rawSt;

    const rawAction = String(r["Status การซ่อม"] || "").trim();
    let normAction = "รอดำเนินการ";
    if (rawAction === "เข้าซ่อม") normAction = "เข้าซ่อม";
    else if (rawAction === "ไม่เข้าซ่อม") normAction = "ไม่เข้าซ่อม";
    else if (rawAction) normAction = rawAction;

    const team = String(r["ทีมช่าง"] || "").trim() || String(r["Field Service"] || "").trim() || "ไม่ระบุทีมช่าง";
    const fieldService = String(r["Field Service"] || "").trim() || "-";

    return {
        ...r,
        _id: r._id || (idx + 1),
        "No.": r["No."] || String(idx + 1),
        "RawAppointDate": rawAppoint,
        "Appoint Date": datePart,
        "Appoint Time": timePart,
        "CCID": String(r["CCID"] || "").trim(),
        "RawArea": rawArea,
        "District": parsedArea.district,
        "Subdistrict": parsedArea.subdistrict,
        "AreaSwapped": parsedArea.swapped,
        "FormattedArea": parsedArea.subdistrict ? `${parsedArea.district} - ${parsedArea.subdistrict}` : parsedArea.district,
        "Field Service": fieldService,
        "ทีมช่าง": team,
        "Status": rawSt,
        "NormalizedStatus": normStatus,
        "Status การซ่อม": rawAction,
        "NormalizedRepairAction": normAction,
        "Reason Code": String(r["Reason Code"] || "").trim(),
        "Remark": String(r["Remark"] || "").trim()
    };
}

// Fetch Repair Data from Apps Script, Backend API (/api/repair/data), or direct Google Sheet CSV (gid=470684857)
async function loadRepairDashboardData(forceSync = false) {
    const syncIcon = document.getElementById("sync-icon");
    const syncText = document.getElementById("sync-status-text");

    if (currentMainPage === "repair") {
        if (syncIcon) syncIcon.classList.add("spin-anim");
        if (syncText) syncText.textContent = forceSync ? "กำลังซิงค์งานซ่อม..." : "กำลังโหลด...";
    }

    // 1. Google Apps Script Web App environment
    if (typeof google !== "undefined" && google.script && google.script.run) {
        google.script.run
            .withSuccessHandler(async function(raw) {
                const data = parseServerPayload(raw);
                const rowsList = (data && data.rows) || [];
                if (!data || data.status === "error" || rowsList.length === 0) {
                    console.warn("Apps Script getRepairDashboardData returned empty/error, falling back to JSONP...", data);
                    try {
                        const jsonpData = await fetchSheetViaJsonp("470684857");
                        handleRepairDataLoaded(jsonpData, forceSync);
                        return;
                    } catch (jpErr) {
                        console.error("Repair JSONP fallback failed:", jpErr);
                    }
                }
                handleRepairDataLoaded(data, forceSync);
            })
            .withFailureHandler(async function(err) {
                console.warn("Apps Script getRepairDashboardData failed, falling back to JSONP:", err);
                try {
                    const jsonpData = await fetchSheetViaJsonp("470684857");
                    handleRepairDataLoaded(jsonpData, forceSync);
                } catch (jpErr) {
                    if (syncText) syncText.textContent = "ซิงค์ข้อมูล";
                    if (syncIcon) syncIcon.classList.remove("spin-anim");
                    const msg = (err && err.message) ? err.message : String(err);
                    showFatalBanner("เรียก getRepairDashboardData() บน Apps Script ไม่สำเร็จ: " + msg);
                }
            })
            .getRepairDashboardData();
        return;
    }

    // 2. FastAPI Backend or direct CSV / JSONP fallback
    try {
        const url = forceSync ? "/api/repair/sync" : "/api/repair/data";
        const method = forceSync ? "POST" : "GET";
        let data;
        try {
            const response = await fetch(url, { method });
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            data = await response.json();
        } catch (netErr) {
            try {
                data = await fetchDirectRepairSheet();
            } catch (csvErr) {
                data = await fetchSheetViaJsonp("470684857");
            }
        }
        handleRepairDataLoaded(data, forceSync);
    } catch (error) {
        console.error("Failed to load repair dashboard data:", error);
        if (currentMainPage === "repair") {
            if (syncText) syncText.textContent = "ซิงค์ข้อมูล";
            if (syncIcon) syncIcon.classList.remove("spin-anim");
            showToast("ไม่สามารถซิงค์ข้อมูลงานซ่อมได้: " + error.message, "error");
        }
    }
}

async function fetchDirectRepairSheet() {
    const url = "https://docs.google.com/spreadsheets/d/1SqNPkmM4I3GCxfHiKbahwVyPQJhKWxk4d-mzITLtUmg/export?format=csv&gid=470684857";
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length > 0 && values.some(v => v.trim())) {
            const rowObj = { _id: i };
            headers.forEach((h, idx) => { rowObj[h] = values[idx] || ""; });
            rows.push(rowObj);
        }
    }
    return {
        last_updated: new Date().toLocaleString('th-TH'),
        status: "success",
        rows: rows
    };
}

function handleRepairDataLoaded(data, forceSync = false) {
    const syncIcon = document.getElementById("sync-icon");
    const syncText = document.getElementById("sync-status-text");
    data = parseServerPayload(data);
    try {
        if (!data || data.status === "error") {
            throw new Error(data ? data.message : "ไม่สามารถดึงข้อมูลงานซ่อมได้");
        }
        repairDashboardData = data;
        const rawRows = (data.metrics && data.metrics.rows) || data.rows || [];

        allRepairRows = rawRows.map((r, idx) => normalizeRepairRow(r, idx));

        const sideBadgeRepair = document.getElementById("sidebar-badge-repair");
        if (sideBadgeRepair) {
            sideBadgeRepair.textContent = allRepairRows.length;
        }

        if (currentMainPage === "repair") {
            const badgeTotal = document.getElementById("header-total-badge");
            if (badgeTotal) {
                badgeTotal.textContent = `(${allRepairRows.length} งานซ่อม)`;
            }
            const timeEl = document.getElementById("header-last-updated");
            if (timeEl && data.last_updated) {
                timeEl.textContent = data.last_updated.length > 11 ? data.last_updated.slice(11) : data.last_updated;
            }
        }

        populateRepairDropdowns();
        applyRepairFilters();

        if (currentMainPage === "repair") {
            if (syncText) syncText.textContent = "ซิงค์ข้อมูล";
            if (forceSync) showToast("ซิงค์ข้อมูลงานซ่อมสำเร็จ", "success");
        }
    } catch (err) {
        console.error("Error handling repair data:", err);
        showFatalBanner("โหลดข้อมูลงานซ่อมไม่สำเร็จ: " + err.message);
        if (currentMainPage === "repair") {
            showToast("เกิดข้อผิดพลาดในข้อมูลงานซ่อม: " + err.message, "error");
        }
    } finally {
        if (currentMainPage === "repair" && syncIcon) {
            syncIcon.classList.remove("spin-anim");
            if (syncText) syncText.textContent = "ซิงค์ข้อมูล";
        }
        initLucide();
    }
}

// Populate Repair Filter Dropdowns
function populateRepairDropdowns() {
    // 1. Year
    const yearEl = document.getElementById("repair-filter-year");
    if (yearEl) {
        const yMap = {};
        allRepairRows.forEach(r => {
            const y = (r["Appoint Date"] || "").slice(0, 4);
            if (y) yMap[y] = (yMap[y] || 0) + 1;
        });
        const years = Object.entries(yMap).sort((a, b) => b[0].localeCompare(a[0]));
        yearEl.innerHTML = `<option value="ALL">ทุกปี (รวม ${allRepairRows.length} งาน)</option>` +
            years.map(([y, c]) => `<option value="${y}">ปี ${y} (${c} งาน)</option>`).join("");
        if (repairFilterYear && yMap[repairFilterYear]) yearEl.value = repairFilterYear;
        else { repairFilterYear = "ALL"; yearEl.value = "ALL"; }
    }

    // 2. Month
    const monthEl = document.getElementById("repair-filter-month");
    if (monthEl) {
        const mMap = {};
        allRepairRows.forEach(r => {
            const dt = (r["Appoint Date"] || "");
            if (dt.length >= 7) {
                const ym = dt.slice(0, 7);
                mMap[ym] = (mMap[ym] || 0) + 1;
            }
        });
        const months = Object.entries(mMap).sort((a, b) => b[0].localeCompare(a[0]));
        monthEl.innerHTML = `<option value="ALL">-- ทุกเดือน (${allRepairRows.length} งาน) --</option>` +
            months.map(([ym, c]) => `<option value="${ym}">${formatMonthTitle(ym)} (${c} งาน)</option>`).join("");
        if (repairFilterMonth && mMap[repairFilterMonth]) monthEl.value = repairFilterMonth;
        else { repairFilterMonth = "ALL"; monthEl.value = "ALL"; }
    }

    // 3. Date
    populateRepairDateDropdown();

    // 4. District (อำเภอ)
    const distEl = document.getElementById("repair-filter-district");
    if (distEl) {
        const dMap = {};
        allRepairRows.forEach(r => {
            const d = r.District || "ไม่ระบุพื้นที่";
            dMap[d] = (dMap[d] || 0) + 1;
        });
        const districts = Object.entries(dMap).sort((a, b) => b[1] - a[1]);
        distEl.innerHTML = `<option value="ALL">-- ทุกอำเภอ (${districts.length} อำเภอ) --</option>` +
            districts.map(([d, c]) => `<option value="${escapeHtml(d)}">อ. ${escapeHtml(d)} (${c} งาน)</option>`).join("");
        if (repairFilterDistrict && dMap[repairFilterDistrict]) distEl.value = repairFilterDistrict;
        else { repairFilterDistrict = "ALL"; distEl.value = "ALL"; }
    }

    // 5. Subdistrict (ตำบล)
    updateRepairSubdistrictDropdown();

    // 6. Repair Team
    const teamEl = document.getElementById("repair-filter-team");
    if (teamEl) {
        const tMap = {};
        allRepairRows.forEach(r => {
            const t = r["ทีมช่าง"] || "ไม่ระบุทีมช่าง";
            tMap[t] = (tMap[t] || 0) + 1;
        });
        const teams = Object.entries(tMap).sort((a, b) => b[1] - a[1]);
        teamEl.innerHTML = `<option value="ALL">-- ทุกทีมช่าง (${teams.length} ทีม) --</option>` +
            teams.map(([t, c]) => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${c} งาน)</option>`).join("");
        if (repairFilterTeam && tMap[repairFilterTeam]) teamEl.value = repairFilterTeam;
        else { repairFilterTeam = "ALL"; teamEl.value = "ALL"; }
    }
}

function populateRepairDateDropdown() {
    const dateEl = document.getElementById("repair-filter-date");
    if (!dateEl) return;

    let rows = allRepairRows;
    if (repairFilterYear !== "ALL") rows = rows.filter(r => (r["Appoint Date"] || "").startsWith(repairFilterYear));
    if (repairFilterMonth !== "ALL") rows = rows.filter(r => (r["Appoint Date"] || "").startsWith(repairFilterMonth));

    const dtMap = {};
    rows.forEach(r => {
        const dt = r["Appoint Date"] || "";
        if (dt) dtMap[dt] = (dtMap[dt] || 0) + 1;
    });
    const dates = Object.entries(dtMap).sort((a, b) => b[0].localeCompare(a[0]));
    dateEl.innerHTML = `<option value="ALL">-- ทุกวันที่ (${rows.length} งาน) --</option>` +
        dates.map(([dt, c]) => `<option value="${dt}">${formatDateShortThai(dt)} (${dt}) - ${c} งาน</option>`).join("");

    if (repairFilterDate && dtMap[repairFilterDate]) dateEl.value = repairFilterDate;
    else { repairFilterDate = "ALL"; dateEl.value = "ALL"; }
}

function updateRepairSubdistrictDropdown() {
    const subEl = document.getElementById("repair-filter-subdistrict");
    if (!subEl) return;

    const matching = (repairFilterDistrict && repairFilterDistrict !== "ALL")
        ? allRepairRows.filter(r => r.District === repairFilterDistrict)
        : allRepairRows;

    const sMap = {};
    matching.forEach(r => {
        const s = r.Subdistrict || "ไม่ระบุตำบล";
        sMap[s] = (sMap[s] || 0) + 1;
    });
    const subs = Object.entries(sMap).sort((a, b) => b[1] - a[1]);
    const prefix = (repairFilterDistrict && repairFilterDistrict !== "ALL")
        ? `-- ทุกตำบลใน อ. ${repairFilterDistrict} (${subs.length} ตำบล) --`
        : `-- ทุกตำบล (${subs.length} ตำบล) --`;

    subEl.innerHTML = `<option value="ALL">${prefix}</option>` +
        subs.map(([s, c]) => `<option value="${escapeHtml(s)}">ต. ${escapeHtml(s)} (${c} งาน)</option>`).join("");

    if (repairFilterSubdistrict && sMap[repairFilterSubdistrict]) subEl.value = repairFilterSubdistrict;
    else { repairFilterSubdistrict = "ALL"; subEl.value = "ALL"; }
}

// Apply Repair Filters
function applyRepairFilters() {
    filteredRepairRows = allRepairRows.filter(r => {
        const dt = r["Appoint Date"] || "";
        if (repairFilterYear !== "ALL" && !dt.startsWith(repairFilterYear)) return false;
        if (repairFilterMonth !== "ALL" && !dt.startsWith(repairFilterMonth)) return false;
        if (repairFilterDate !== "ALL" && dt !== repairFilterDate) return false;
        if (repairFilterStatus !== "ALL" && r.NormalizedStatus !== repairFilterStatus) return false;
        if (repairFilterAction !== "ALL" && r.NormalizedRepairAction !== repairFilterAction) return false;
        if (repairFilterDistrict !== "ALL" && r.District !== repairFilterDistrict) return false;
        if (repairFilterSubdistrict !== "ALL" && (r.Subdistrict || "ไม่ระบุตำบล") !== repairFilterSubdistrict) return false;
        if (repairFilterTeam !== "ALL" && r["ทีมช่าง"] !== repairFilterTeam) return false;

        if (repairSearchQuery) {
            const q = repairSearchQuery.toLowerCase();
            const haystack = [
                r["Appoint Date"],
                r["Appoint Time"],
                r["CCID"],
                r["RawArea"],
                r["District"],
                r["Subdistrict"],
                r["FormattedArea"],
                r["ทีมช่าง"],
                r["Field Service"],
                r["Status"],
                r["Status การซ่อม"],
                r["Reason Code"],
                r["Remark"]
            ].filter(Boolean).join(" ").toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });

    repairCurrentPage = 1;
    updateRepairDashboardView();
}

// Compute all 5 Sections Metrics for Page 2 (งานซ่อม)
function computeRepairMetrics(rows, allRowsForRepeat) {
    let complete = 0, retrun = 0, cencel = 0, pending = 0;
    let actionIn = 0, actionOut = 0, actionPending = 0;
    let swappedCount = 0;

    const dailyMap = {};
    const reasonMap = {};
    const teamDailyMap = {};
    const teamFieldServiceMap = {};
    const districtMap = {};
    const subdistrictKeyMap = {};

    rows.forEach(r => {
        const st = r.NormalizedStatus;
        const act = r.NormalizedRepairAction;

        if (st === "Complete") complete++;
        else if (st === "Retrun") retrun++;
        else if (st === "Cencel") cencel++;
        else pending++;

        if (act === "เข้าซ่อม") actionIn++;
        else if (act === "ไม่เข้าซ่อม") actionOut++;
        else actionPending++;

        if (r.AreaSwapped) swappedCount++;

        // 1. Daily Closed Jobs by Status & Status การซ่อม
        const dt = r["Appoint Date"] || "ไม่ระบุวันที่";
        if (!dailyMap[dt]) {
            dailyMap[dt] = {
                date: dt,
                total: 0,
                complete: 0,
                retrun: 0,
                cencel: 0,
                pending: 0,
                action_in: 0,
                action_out: 0,
                action_pending: 0
            };
        }
        dailyMap[dt].total++;
        if (st === "Complete") dailyMap[dt].complete++;
        else if (st === "Retrun") dailyMap[dt].retrun++;
        else if (st === "Cencel") dailyMap[dt].cencel++;
        else dailyMap[dt].pending++;

        if (act === "เข้าซ่อม") dailyMap[dt].action_in++;
        else if (act === "ไม่เข้าซ่อม") dailyMap[dt].action_out++;
        else dailyMap[dt].action_pending++;

        // 2. Reason Code Breakdown
        const rs = r["Reason Code"] || "";
        if (rs) {
            if (!reasonMap[rs]) {
                reasonMap[rs] = { reason: rs, count: 0, action_in: 0, action_out: 0, statuses: {}, teams: {} };
            }
            reasonMap[rs].count++;
            if (act === "เข้าซ่อม") reasonMap[rs].action_in++;
            else if (act === "ไม่เข้าซ่อม") reasonMap[rs].action_out++;
            reasonMap[rs].statuses[st] = (reasonMap[rs].statuses[st] || 0) + 1;
            const tm = r["ทีมช่าง"] || "ไม่ระบุทีมช่าง";
            reasonMap[rs].teams[tm] = (reasonMap[rs].teams[tm] || 0) + 1;
        }

        // 3. Productivity of Repair Teams (Target: >= 6 เบอร์/วัน from Status การซ่อม = เข้าซ่อม)
        const team = r["ทีมช่าง"] || "ไม่ระบุทีมช่าง";
        if (r["Field Service"] && r["Field Service"] !== "-") {
            teamFieldServiceMap[team] = r["Field Service"];
        }
        if (!teamDailyMap[team]) teamDailyMap[team] = {};
        if (!teamDailyMap[team][dt]) {
            teamDailyMap[team][dt] = {
                total: 0,
                action_in: 0,
                action_out: 0,
                complete: 0,
                retrun: 0,
                cencel: 0,
                pending: 0,
                districts: new Set()
            };
        }
        const td = teamDailyMap[team][dt];
        td.total++;
        if (act === "เข้าซ่อม") td.action_in++;
        else if (act === "ไม่เข้าซ่อม") td.action_out++;
        if (st === "Complete") td.complete++;
        else if (st === "Retrun") td.retrun++;
        else if (st === "Cencel") td.cencel++;
        else td.pending++;
        if (r.District) td.districts.add(r.District);

        // 5. Area Statistics (District - Subdistrict)
        const dist = r.District || "ไม่ระบุพื้นที่";
        const sub = r.Subdistrict || "ไม่ระบุตำบล";
        if (!districtMap[dist]) {
            districtMap[dist] = {
                district: dist,
                total: 0,
                complete: 0,
                retrun: 0,
                cencel: 0,
                pending: 0,
                action_in: 0,
                action_out: 0,
                subdistricts: new Set()
            };
        }
        districtMap[dist].total++;
        if (st === "Complete") districtMap[dist].complete++;
        else if (st === "Retrun") districtMap[dist].retrun++;
        else if (st === "Cencel") districtMap[dist].cencel++;
        else districtMap[dist].pending++;
        if (act === "เข้าซ่อม") districtMap[dist].action_in++;
        else if (act === "ไม่เข้าซ่อม") districtMap[dist].action_out++;
        districtMap[dist].subdistricts.add(sub);

        const areaKey = `${dist}|||${sub}`;
        if (!subdistrictKeyMap[areaKey]) {
            subdistrictKeyMap[areaKey] = {
                district: dist,
                subdistrict: sub,
                formatted: `${dist} - ${sub}`,
                total: 0,
                complete: 0,
                retrun: 0,
                cencel: 0,
                pending: 0,
                action_in: 0,
                action_out: 0
            };
        }
        const sd = subdistrictKeyMap[areaKey];
        sd.total++;
        if (st === "Complete") sd.complete++;
        else if (st === "Retrun") sd.retrun++;
        else if (st === "Cencel") sd.cencel++;
        else sd.pending++;
        if (act === "เข้าซ่อม") sd.action_in++;
        else if (act === "ไม่เข้าซ่อม") sd.action_out++;
    });

    // Finalize Section 1: Daily Status List
    const dailyList = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Finalize Section 2: Reason Code List
    const totalWithReason = Object.values(reasonMap).reduce((acc, x) => acc + x.count, 0);
    const reasonList = Object.values(reasonMap).map(item => ({
        ...item,
        pct: totalWithReason > 0 ? Math.round((item.count / totalWithReason) * 1000) / 10 : 0,
        teams_list: Object.entries(item.teams).map(([t, c]) => ({ team: t, count: c })).sort((a, b) => b.count - a.count)
    })).sort((a, b) => b.count - a.count);

    // Finalize Section 3: Team Productivity (Target: >= 6 เบอร์/วัน from Status การซ่อม = เข้าซ่อม)
    // User Rule (แบบที่ 2):
    // - เข้าซ่อม >= 6 -> "ผ่านเกณฑ์" (Remark: "ครบเกณฑ์ ≥ 6 เบอร์")
    // - เข้าซ่อม < 6 และ ใบงานที่ได้รับในวันนั้น (total) < 6 -> Remark: "งานน้อย"
    // - เข้าซ่อม < 6 และ ใบงานที่ได้รับในวันนั้น (total) >= 6 -> Remark: "ต่ำกว่าเกณฑ์"
    const teamProdList = [];
    const dailyProdLogs = [];
    let totalWorkingDaysAll = 0;
    let totalActionInAll = 0;
    let totalDaysPass6 = 0;
    let totalDaysLowWork = 0;
    let totalDaysBelowTarget = 0;

    Object.entries(teamDailyMap).forEach(([team, dObj]) => {
        const workingDays = Object.keys(dObj).length;
        let tTotal = 0, tIn = 0, tOut = 0, tComplete = 0, daysPass6 = 0, daysLowWork = 0, daysBelowTarget = 0;

        Object.entries(dObj).forEach(([dt, d]) => {
            tTotal += d.total;
            tIn += d.action_in;
            tOut += d.action_out;
            tComplete += d.complete;
            const pass6 = d.action_in >= 6;
            const isLowWork = !pass6 && d.total < 6;
            const isBelowTarget = !pass6 && d.total >= 6;

            let statusType = "pass";
            let remarkText = "ครบเกณฑ์ ≥ 6 เบอร์";
            if (pass6) {
                daysPass6++;
                totalDaysPass6++;
            } else if (isLowWork) {
                daysLowWork++;
                totalDaysLowWork++;
                statusType = "low_work";
                remarkText = `งานน้อย (รับงาน ${d.total} เบอร์)`;
            } else {
                daysBelowTarget++;
                totalDaysBelowTarget++;
                statusType = "below_target";
                remarkText = `ต่ำกว่าเกณฑ์ (รับงาน ${d.total} เข้าซ่อม ${d.action_in})`;
            }

            dailyProdLogs.push({
                date: dt,
                team_name: team,
                field_service: teamFieldServiceMap[team] || "-",
                total: d.total,
                action_in: d.action_in,
                action_out: d.action_out,
                complete: d.complete,
                pass_target_6: pass6,
                is_low_work: isLowWork,
                is_below_target: isBelowTarget,
                status_type: statusType,
                remark_text: remarkText,
                districts: Array.from(d.districts).join(", ")
            });
        });

        totalWorkingDaysAll += workingDays;
        totalActionInAll += tIn;

        const avgInPerDay = workingDays > 0 ? Math.round((tIn / workingDays) * 100) / 100 : 0;
        const avgTotalPerDay = workingDays > 0 ? Math.round((tTotal / workingDays) * 100) / 100 : 0;
        teamProdList.push({
            team_name: team,
            field_service: teamFieldServiceMap[team] || "-",
            working_days: workingDays,
            total_jobs: tTotal,
            action_in: tIn,
            action_out: tOut,
            complete: tComplete,
            days_pass_6: daysPass6,
            days_low_work: daysLowWork,
            days_below_target: daysBelowTarget,
            avg_in_per_day: avgInPerDay,
            avg_total_per_day: avgTotalPerDay,
            pass_target_6: avgInPerDay >= 6,
            is_low_work_team: avgInPerDay < 6 && avgTotalPerDay < 6
        });
    });

    teamProdList.sort((a, b) => b.avg_in_per_day - a.avg_in_per_day || b.action_in - a.action_in);
    dailyProdLogs.sort((a, b) => b.date.localeCompare(a.date) || b.action_in - a.action_in);

    const overallAvgProd = totalWorkingDaysAll > 0 ? Math.round((totalActionInAll / totalWorkingDaysAll) * 100) / 100 : 0;

    // Finalize Section 4: Repeat Faults within 30 Days
    // User Rule:
    // - ใบงานแรกต้องเป็น Status = Complete + Status การซ่อม = เข้าซ่อม และ Reason Code !== "เลื่อนนัดหมาย"
    // - หากใบงานที่ซ้ำถูกปิดเป็น Status = Cencel หรือ Retrun จะไม่นับเป็นเสียซ้ำ 30 วัน
    const sourceRowsForRepeat = rows;
    const ccidGroups = {};
    sourceRowsForRepeat.forEach(r => {
        const ccid = r["CCID"];
        if (!ccid) return;
        if (!ccidGroups[ccid]) ccidGroups[ccid] = [];
        ccidGroups[ccid].push(r);
    });

    const strictRepeatCases = [];
    const allDuplicateCases = [];
    const pendingRepeatAlerts = [];

    Object.entries(ccidGroups).forEach(([ccid, group]) => {
        if (group.length < 2) return;
        const sorted = [...group].sort((a, b) => (a.RawAppointDate || a["Appoint Date"]).localeCompare(b.RawAppointDate || b["Appoint Date"]));

        // 4A. All duplicate CCIDs within 30 days (for inspection toggle)
        const firstAny = sorted[0];
        const d0Any = new Date(firstAny["Appoint Date"]);
        for (let i = 1; i < sorted.length; i++) {
            const cur = sorted[i];
            const dCur = new Date(cur["Appoint Date"]);
            const diffDays = (!isNaN(d0Any) && !isNaN(dCur)) ? Math.round((dCur - d0Any) / (1000 * 60 * 60 * 24)) : 0;
            if (diffDays >= 0 && diffDays <= 30) {
                allDuplicateCases.push({
                    ccid: ccid,
                    district: cur.District || firstAny.District,
                    subdistrict: cur.Subdistrict || firstAny.Subdistrict,
                    formatted_area: cur.FormattedArea || firstAny.FormattedArea,
                    first_date: firstAny["Appoint Date"],
                    first_time: firstAny["Appoint Time"],
                    first_team: firstAny["ทีมช่าง"],
                    first_status: firstAny.NormalizedStatus,
                    first_action: firstAny.NormalizedRepairAction,
                    first_reason: firstAny["Reason Code"] || "-",
                    repeat_date: cur["Appoint Date"],
                    repeat_time: cur["Appoint Time"],
                    repeat_team: cur["ทีมช่าง"],
                    repeat_status: cur.NormalizedStatus,
                    repeat_action: cur.NormalizedRepairAction,
                    repeat_reason: cur["Reason Code"] || "-",
                    repeat_remark: cur["Remark"] || "",
                    days_diff: diffDays
                });
            }
        }

        // 4B. Strict Complete + เข้าซ่อม (and Reason Code !== "เลื่อนนัดหมาย") first repair, followed by another fault within 30 days
        // Exclude repeat tickets closed as Cencel or Retrun
        const firstCompletedIdx = sorted.findIndex(item =>
            item.NormalizedStatus === "Complete" &&
            item.NormalizedRepairAction === "เข้าซ่อม" &&
            item["Reason Code"] !== "เลื่อนนัดหมาย"
        );

        if (firstCompletedIdx !== -1 && firstCompletedIdx < sorted.length - 1) {
            const baseTicket = sorted[firstCompletedIdx];
            const dBase = new Date(baseTicket["Appoint Date"]);
            for (let j = firstCompletedIdx + 1; j < sorted.length; j++) {
                const nextTicket = sorted[j];
                // If closed as Cencel or Retrun, it does NOT count as KPI repeat fault
                if (nextTicket.NormalizedStatus === "Cencel" || nextTicket.NormalizedStatus === "Retrun") {
                    continue;
                }
                const dNext = new Date(nextTicket["Appoint Date"]);
                const diffDays = (!isNaN(dBase) && !isNaN(dNext)) ? Math.round((dNext - dBase) / (1000 * 60 * 60 * 24)) : 0;
                if (diffDays >= 0 && diffDays <= 30) {
                    strictRepeatCases.push({
                        ccid: ccid,
                        district: nextTicket.District || baseTicket.District,
                        subdistrict: nextTicket.Subdistrict || baseTicket.Subdistrict,
                        formatted_area: nextTicket.FormattedArea || baseTicket.FormattedArea,
                        first_date: baseTicket["Appoint Date"],
                        first_time: baseTicket["Appoint Time"],
                        first_team: baseTicket["ทีมช่าง"],
                        first_status: baseTicket.NormalizedStatus,
                        first_action: baseTicket.NormalizedRepairAction,
                        first_reason: baseTicket["Reason Code"] || "-",
                        repeat_date: nextTicket["Appoint Date"],
                        repeat_time: nextTicket["Appoint Time"],
                        repeat_team: nextTicket["ทีมช่าง"],
                        repeat_status: nextTicket.NormalizedStatus,
                        repeat_action: nextTicket.NormalizedRepairAction,
                        repeat_reason: nextTicket["Reason Code"] || "-",
                        repeat_remark: nextTicket["Remark"] || "",
                        days_diff: diffDays
                    });
                }
            }
        }

        // 6. Pending Repeat Alerts (Section 6):
        // Find any ticket currently in Status = "Pending" (รอดำเนินการ) that has at least 1 prior ticket within 30 days
        // User Rule: หาก Reason Code เป็น "เลื่อนนัดหมาย" ไม่นำมานับ
        for (let k = 1; k < sorted.length; k++) {
            const curTicket = sorted[k];
            if (curTicket.NormalizedStatus !== "Pending") continue;
            if (String(curTicket["Reason Code"] || "").trim() === "เลื่อนนัดหมาย") continue;

            const priorTickets = sorted.slice(0, k).filter(p =>
                String(p["Reason Code"] || "").trim() !== "เลื่อนนัดหมาย"
            );
            if (priorTickets.length === 0) continue;

            const latestPrior = priorTickets[priorTickets.length - 1];
            const dPrior = new Date(latestPrior["Appoint Date"]);
            const dCur = new Date(curTicket["Appoint Date"]);
            const diffDays = (!isNaN(dPrior) && !isNaN(dCur)) ? Math.round((dCur - dPrior) / (1000 * 60 * 60 * 24)) : 0;

            if (diffDays >= 0 && diffDays <= 30) {
                const priorCompletedTicket = priorTickets.find(p =>
                    p.NormalizedStatus === "Complete" &&
                    p.NormalizedRepairAction === "เข้าซ่อม" &&
                    String(p["Reason Code"] || "").trim() !== "เลื่อนนัดหมาย"
                );
                const hasCompletedPrior = Boolean(priorCompletedTicket);
                const refTicket = priorCompletedTicket || latestPrior;

                pendingRepeatAlerts.push({
                    ccid: ccid,
                    formatted_area: curTicket.FormattedArea || refTicket.FormattedArea,
                    prior_date: refTicket["Appoint Date"],
                    prior_time: refTicket["Appoint Time"],
                    prior_team: refTicket["ทีมช่าง"],
                    prior_status: refTicket.NormalizedStatus,
                    prior_action: refTicket.NormalizedRepairAction,
                    prior_reason: refTicket["Reason Code"] || "-",
                    prior_remark: refTicket["Remark"] || "",
                    pending_date: curTicket["Appoint Date"],
                    pending_time: curTicket["Appoint Time"],
                    pending_team: curTicket["ทีมช่าง"],
                    pending_status: "รอดำเนินการ",
                    pending_action: curTicket.NormalizedRepairAction,
                    days_diff: diffDays,
                    has_completed_prior: hasCompletedPrior,
                    risk_level: hasCompletedPrior ? "CRITICAL" : "WATCH"
                });
            }
        }
    });

    // Finalize Section 5: Area Statistics (Districts & Subdistricts + All 11 Phetchabun Districts Ranking)
    const districtList = Object.values(districtMap).map(d => ({
        ...d,
        subdistrict_count: d.subdistricts.size,
        complete_pct: d.total > 0 ? Math.round((d.complete / d.total) * 1000) / 10 : 0,
        action_in_pct: d.total > 0 ? Math.round((d.action_in / d.total) * 1000) / 10 : 0
    })).sort((a, b) => b.total - a.total);

    // Ensure all 11 Phetchabun districts are included in the ranking table
    const maxDistrictJobs = districtList.length > 0 ? Math.max(...districtList.map(d => d.total), 1) : 1;
    const allDistrictsRanking = Array.from(PHETCHABUN_DISTRICTS).map(distName => {
        const existing = districtMap[distName];
        const total = existing ? existing.total : 0;
        const completeCnt = existing ? existing.complete : 0;
        const retrunCnt = existing ? existing.retrun : 0;
        const cencelCnt = existing ? existing.cencel : 0;
        const pendingCnt = existing ? existing.pending : 0;
        const actionInCnt = existing ? existing.action_in : 0;
        const actionOutCnt = existing ? existing.action_out : 0;
        const subCnt = existing ? existing.subdistricts.size : 0;
        const sharePct = rows.length > 0 ? Math.round((total / rows.length) * 1000) / 10 : 0;

        let workloadLevel = "ไม่มีงาน";
        let workloadClass = "bg-slate-100 text-slate-500 border-slate-200";
        if (total >= 10 || (total > 0 && total >= maxDistrictJobs * 0.6)) {
            workloadLevel = "งานเยอะ";
            workloadClass = "bg-rose-100 text-rose-800 border-rose-200";
        } else if (total >= 5) {
            workloadLevel = "ปานกลาง";
            workloadClass = "bg-amber-100 text-amber-800 border-amber-200";
        } else if (total > 0) {
            workloadLevel = "งานน้อย";
            workloadClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
        }

        return {
            district: distName,
            total: total,
            complete: completeCnt,
            retrun: retrunCnt,
            cencel: cencelCnt,
            pending: pendingCnt,
            action_in: actionInCnt,
            action_out: actionOutCnt,
            subdistrict_count: subCnt,
            share_pct: sharePct,
            workload_level: workloadLevel,
            workload_class: workloadClass
        };
    }).sort((a, b) => b.total - a.total || a.district.localeCompare(b.district));

    const subdistrictList = Object.values(subdistrictKeyMap).map(sd => ({
        ...sd,
        complete_pct: sd.total > 0 ? Math.round((sd.complete / sd.total) * 1000) / 10 : 0,
        action_in_pct: sd.total > 0 ? Math.round((sd.action_in / sd.total) * 1000) / 10 : 0
    })).sort((a, b) => b.total - a.total || a.district.localeCompare(b.district));

    return {
        total_jobs: rows.length,
        complete_count: complete,
        complete_pct: rows.length > 0 ? Math.round((complete / rows.length) * 1000) / 10 : 0,
        retrun_count: retrun,
        cencel_count: cencel,
        pending_count: pending,
        action_in_count: actionIn,
        action_out_count: actionOut,
        action_pending_count: actionPending,
        swapped_area_count: swappedCount,
        overall_avg_prod: overallAvgProd,
        total_days_pass_6: totalDaysPass6,
        total_days_low_work: totalDaysLowWork,
        total_days_below_target: totalDaysBelowTarget,
        daily_status: dailyList,
        reason_codes: reasonList,
        total_with_reason: totalWithReason,
        team_productivity: teamProdList,
        daily_prod_logs: dailyProdLogs,
        repeat_strict_cases: strictRepeatCases,
        repeat_all_cases: allDuplicateCases,
        pending_repeat_alerts: pendingRepeatAlerts,
        districts: districtList,
        all_districts_ranking: allDistrictsRanking,
        subdistricts: subdistrictList
    };
}

// Render the entire Page 2 (งานซ่อม) Dashboard
function updateRepairDashboardView() {
    const m = computeRepairMetrics(filteredRepairRows, allRepairRows);

    // Update Filter Count Badge
    const countBadge = document.getElementById("repair-filtered-count-badge");
    if (countBadge) countBadge.textContent = `พบ ${filteredRepairRows.length} รายการ`;

    // Update 5 KPI Cards
    const kpiTotal = document.getElementById("repair-kpi-total");
    const kpiPendingSub = document.getElementById("repair-kpi-pending-sub");
    const kpiComplete = document.getElementById("repair-kpi-complete");
    const kpiActionInSub = document.getElementById("repair-kpi-action-in-sub");
    const kpiCompletePct = document.getElementById("repair-kpi-complete-pct");
    const kpiNotIn = document.getElementById("repair-kpi-not-in");
    const kpiRetrunCancelSub = document.getElementById("repair-kpi-retrun-cancel-sub");
    const kpiAvgProd = document.getElementById("repair-kpi-avg-prod");
    const kpiPassDaysSub = document.getElementById("repair-kpi-pass-days-sub");
    const kpiRepeat30d = document.getElementById("repair-kpi-repeat-30d");

    if (kpiTotal) kpiTotal.textContent = m.total_jobs;
    if (kpiPendingSub) kpiPendingSub.textContent = `รอดำเนินการ ${m.pending_count} งาน`;
    if (kpiComplete) kpiComplete.textContent = m.complete_count;
    if (kpiActionInSub) kpiActionInSub.textContent = `เข้าซ่อมจริง: ${m.action_in_count} เบอร์`;
    if (kpiCompletePct) kpiCompletePct.textContent = `${m.complete_pct}% สำเร็จ`;
    if (kpiNotIn) kpiNotIn.textContent = m.action_out_count;
    if (kpiRetrunCancelSub) kpiRetrunCancelSub.textContent = `Retrun ${m.retrun_count} | Cencel ${m.cencel_count}`;
    if (kpiAvgProd) kpiAvgProd.textContent = m.overall_avg_prod.toFixed(2);
    if (kpiPassDaysSub) kpiPassDaysSub.textContent = `ผ่านเกณฑ์ ≥6: ${m.total_days_pass_6} วัน | งานน้อย: ${m.total_days_low_work} วัน`;
    if (kpiRepeat30d) kpiRepeat30d.textContent = m.repeat_strict_cases.length;

    // Render all 6 core sections + jobs table
    renderRepairSection1DailyStatus(m);
    renderRepairSection2ReasonCodes(m);
    renderRepairSection3Productivity(m);
    renderRepairSection4RepeatFaults(m);
    renderRepairSection5AreaStats(m);
    renderRepairSection6PendingAlerts(m);
    renderRepairJobsTable();
    initLucide();
}

// ============================================================================
// SECTION 1: งานที่ปิดแต่ละวัน แบ่งตาม Status และ Status การซ่อม
// ============================================================================
function renderRepairSection1DailyStatus(m) {
    // 1.1 Stacked Bar Chart by Date
    const ctxBar = document.getElementById("chart-repair-daily-status");
    if (ctxBar) {
        if (chartRepairDailyStatus) chartRepairDailyStatus.destroy();
        const labels = m.daily_status.map(d => formatDateShortThai(d.date));
        chartRepairDailyStatus = new Chart(ctxBar, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Complete",
                        data: m.daily_status.map(d => d.complete),
                        backgroundColor: "#10b981",
                        borderRadius: 4
                    },
                    {
                        label: "Retrun",
                        data: m.daily_status.map(d => d.retrun),
                        backgroundColor: "#f59e0b",
                        borderRadius: 4
                    },
                    {
                        label: "Cencel",
                        data: m.daily_status.map(d => d.cencel),
                        backgroundColor: "#ef4444",
                        borderRadius: 4
                    },
                    {
                        label: "รอดำเนินการ",
                        data: m.daily_status.map(d => d.pending),
                        backgroundColor: "#94a3b8",
                        borderRadius: 4
                    },
                    {
                        label: "เข้าซ่อม (เบอร์)",
                        data: m.daily_status.map(d => d.action_in),
                        type: "line",
                        borderColor: "#0d9488",
                        backgroundColor: "#0d9488",
                        borderWidth: 2.5,
                        pointRadius: 4,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "top", labels: { font: { family: "Prompt", size: 11 }, boxWidth: 12 } }
                },
                scales: {
                    x: { stacked: true, ticks: { font: { family: "Prompt", size: 11 } } },
                    y: { stacked: true, beginAtZero: true, ticks: { stepSize: 5, font: { family: "Prompt", size: 11 } } }
                }
            }
        });
    }

    // 1.2 Status Donut Chart
    const ctxStDonut = document.getElementById("chart-repair-status-donut");
    if (ctxStDonut) {
        if (chartRepairStatusDonut) chartRepairStatusDonut.destroy();
        chartRepairStatusDonut = new Chart(ctxStDonut, {
            type: "doughnut",
            data: {
                labels: ["Complete", "Retrun", "Cencel", "รอดำเนินการ"],
                datasets: [{
                    data: [m.complete_count, m.retrun_count, m.cencel_count, m.pending_count],
                    backgroundColor: ["#10b981", "#f59e0b", "#ef4444", "#cbd5e1"],
                    borderWidth: 2,
                    borderColor: "#ffffff"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "62%",
                plugins: {
                    legend: { position: "bottom", labels: { font: { family: "Prompt", size: 10 }, boxWidth: 10 } }
                }
            }
        });
    }

    // 1.3 Status การซ่อม Donut Chart
    const ctxActDonut = document.getElementById("chart-repair-action-donut");
    if (ctxActDonut) {
        if (chartRepairActionDonut) chartRepairActionDonut.destroy();
        chartRepairActionDonut = new Chart(ctxActDonut, {
            type: "doughnut",
            data: {
                labels: ["เข้าซ่อม", "ไม่เข้าซ่อม", "รอดำเนินการ"],
                datasets: [{
                    data: [m.action_in_count, m.action_out_count, m.action_pending_count],
                    backgroundColor: ["#0d9488", "#f97316", "#cbd5e1"],
                    borderWidth: 2,
                    borderColor: "#ffffff"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "62%",
                plugins: {
                    legend: { position: "bottom", labels: { font: { family: "Prompt", size: 10 }, boxWidth: 10 } }
                }
            }
        });
    }

    // 1.4 Daily Matrix Table
    const tbody = document.getElementById("repair-daily-status-tbody");
    if (tbody) {
        if (m.daily_status.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-400">ไม่พบข้อมูลในตัวกรองที่เลือก</td></tr>`;
        } else {
            const rowsDesc = [...m.daily_status].sort((a, b) => b.date.localeCompare(a.date));
            tbody.innerHTML = rowsDesc.map(d => {
                const completePct = d.total > 0 ? Math.round((d.complete / d.total) * 1000) / 10 : 0;
                return `
                    <tr>
                        <td class="font-bold text-slate-800">${formatDateShortThai(d.date)} <span class="text-xs font-normal text-slate-400">(${escapeHtml(d.date)})</span></td>
                        <td class="text-center font-bold text-slate-900">${d.total}</td>
                        <td class="text-center"><span class="px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700">${d.complete}</span></td>
                        <td class="text-center"><span class="px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-700">${d.retrun}</span></td>
                        <td class="text-center"><span class="px-2 py-0.5 rounded-md font-bold bg-rose-50 text-rose-700">${d.cencel}</span></td>
                        <td class="text-center text-slate-500 font-medium">${d.pending}</td>
                        <td class="text-center bg-teal-50/50 font-black text-teal-700">${d.action_in}</td>
                        <td class="text-center bg-slate-50 font-semibold text-slate-700">${d.action_out}</td>
                        <td class="text-center">
                            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${completePct >= 60 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                                ${completePct}%
                            </span>
                        </td>
                    </tr>
                `;
            }).join("");
        }
    }
}

// ============================================================================
// SECTION 2: แบ่งหัวข้อ Reason Code (ปิดงานด้วย Status อะไรบ้าง)
// ============================================================================
function renderRepairSection2ReasonCodes(m) {
    const badgeEl = document.getElementById("repair-reason-total-badge");
    if (badgeEl) badgeEl.textContent = `ระบุสาเหตุ ${m.total_with_reason} เคส (${m.reason_codes.length} หัวข้อ)`;

    // 2.1 Reason Donut Chart
    const ctxDonut = document.getElementById("chart-repair-reason-donut");
    const legendEl = document.getElementById("repair-reason-legend");
    if (ctxDonut) {
        if (chartRepairReasonDonut) chartRepairReasonDonut.destroy();
        const top7 = m.reason_codes.slice(0, 7);
        const othersCount = m.reason_codes.slice(7).reduce((acc, x) => acc + x.count, 0);
        const labels = top7.map(x => x.reason);
        const dataVals = top7.map(x => x.count);
        if (othersCount > 0) {
            labels.push("อื่นๆ");
            dataVals.push(othersCount);
        }

        chartRepairReasonDonut = new Chart(ctxDonut, {
            type: "doughnut",
            data: {
                labels: labels.length ? labels : ["ไม่มีข้อมูล"],
                datasets: [{
                    data: dataVals.length ? dataVals : [1],
                    backgroundColor: dataVals.length ? REASON_DONUT_COLORS.slice(0, dataVals.length) : ["#e2e8f0"],
                    borderWidth: 2,
                    borderColor: "#ffffff"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "60%",
                plugins: { legend: { display: false } }
            }
        });

        if (legendEl) {
            legendEl.innerHTML = labels.map((lbl, idx) => {
                const cnt = dataVals[idx] || 0;
                const pct = m.total_with_reason > 0 ? Math.round((cnt / m.total_with_reason) * 1000) / 10 : 0;
                const color = REASON_DONUT_COLORS[idx] || "#94a3b8";
                return `
                    <div class="flex items-center justify-between gap-2 py-0.5">
                        <div class="flex items-center space-x-2 min-w-0">
                            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
                            <span class="truncate text-slate-700 font-medium" title="${escapeHtml(lbl)}">${escapeHtml(lbl)}</span>
                        </div>
                        <span class="font-bold text-slate-900 shrink-0">${cnt} เคส (${pct}%)</span>
                    </div>
                `;
            }).join("");
        }
    }

    // 2.2 Ranked Reason Code List (with Status breakdown: Complete / Retrun / Cencel)
    const listContainer = document.getElementById("repair-reason-list-container");
    if (listContainer) {
        if (m.reason_codes.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">ไม่พบข้อมูล Reason Code</div>`;
        } else {
            listContainer.innerHTML = m.reason_codes.map((rc, idx) => {
                const color = REASON_DONUT_COLORS[idx] || "#0d9488";
                const stComplete = rc.statuses["Complete"] || 0;
                const stRetrun = rc.statuses["Retrun"] || 0;
                const stCencel = rc.statuses["Cencel"] || 0;

                const statusBadges = [
                    stComplete > 0 ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Status Complete: ${stComplete}</span>` : "",
                    stRetrun > 0 ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Status Retrun: ${stRetrun}</span>` : "",
                    stCencel > 0 ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">Status Cencel: ${stCencel}</span>` : ""
                ].filter(Boolean).join("");

                const teamsBadges = rc.teams_list.map(t =>
                    `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">${escapeHtml(t.team)}: <strong>${t.count}</strong></span>`
                ).join("");

                return `
                    <div class="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-teal-300 transition shadow-sm">
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex items-start space-x-2.5 min-w-0">
                                <span class="w-6 h-6 rounded-lg text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5" style="background:${color}">
                                    #${idx + 1}
                                </span>
                                <div class="min-w-0">
                                    <div class="font-bold text-slate-900 text-sm break-words">${escapeHtml(rc.reason)}</div>
                                    <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                                        ${statusBadges}
                                        <span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                            เข้าซ่อม: ${rc.action_in} เคส
                                        </span>
                                        <span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                            ไม่เข้าซ่อม: ${rc.action_out} เคส
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                                        ${teamsBadges}
                                    </div>
                                </div>
                            </div>
                            <div class="text-right shrink-0">
                                <div class="text-base font-black text-slate-900">${rc.count} <span class="text-xs font-normal text-slate-500">เคส</span></div>
                                <div class="text-[11px] font-bold text-teal-600">${rc.pct}%</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join("");
        }
    }
}

// ============================================================================
// SECTION 3: วิเคราะห์ Productivity ของทีมซ่อม (เกณฑ์ 6 เบอร์/วัน จาก Status การซ่อม = เข้าซ่อม)
// ============================================================================
function renderRepairSection3Productivity(m) {
    // 3.1 Bar Chart comparing Team Avg เข้าซ่อม/วัน vs Target 6
    const ctxProd = document.getElementById("chart-repair-productivity");
    if (ctxProd) {
        if (chartRepairProductivity) chartRepairProductivity.destroy();
        const labels = m.team_productivity.map(t => t.team_name);
        const avgs = m.team_productivity.map(t => t.avg_in_per_day);
        const colors = m.team_productivity.map(t => {
            if (t.pass_target_6) return "#10b981";
            if (t.is_low_work_team) return "#f59e0b";
            return "#ef4444";
        });

        chartRepairProductivity = new Chart(ctxProd, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "เฉลี่ยเข้าซ่อม (เบอร์/วัน)",
                        data: avgs,
                        backgroundColor: colors,
                        borderRadius: 6,
                        barThickness: 28
                    },
                    {
                        label: "เกณฑ์มาตรฐาน (6 เบอร์/วัน)",
                        data: labels.map(() => 6),
                        type: "line",
                        borderColor: "#ef4444",
                        borderDash: [6, 4],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "top", labels: { font: { family: "Prompt", size: 11 } } }
                },
                scales: {
                    y: { beginAtZero: true, suggestedMax: 10, ticks: { font: { family: "Prompt", size: 11 } } },
                    x: { ticks: { font: { family: "Prompt", size: 11 } } }
                }
            }
        });
    }

    // 3.2 Team Summary Table
    const teamTbody = document.getElementById("repair-prod-team-tbody");
    if (teamTbody) {
        if (m.team_productivity.length === 0) {
            teamTbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-400">ไม่พบข้อมูลทีมซ่อม</td></tr>`;
        } else {
            teamTbody.innerHTML = m.team_productivity.map(t => {
                let badge = "";
                if (t.pass_target_6) {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">ผ่านเกณฑ์ (≥ 6)</span>`;
                } else if (t.is_low_work_team) {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">งานน้อย (รับงานเฉลี่ย ${t.avg_total_per_day}/วัน)</span>`;
                } else {
                    badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">ต่ำกว่าเกณฑ์ (&lt; 6)</span>`;
                }

                return `
                    <tr>
                        <td>
                            <div class="font-bold text-slate-900">${escapeHtml(t.team_name)}</div>
                            <div class="text-[11px] text-slate-400">รหัส: ${escapeHtml(t.field_service)}</div>
                        </td>
                        <td class="text-center font-semibold text-slate-700">${t.total_jobs}</td>
                        <td class="text-center bg-emerald-50/60 font-black text-emerald-700 text-base">${t.action_in}</td>
                        <td class="text-center text-slate-600">${t.action_out}</td>
                        <td class="text-center font-semibold text-emerald-600">${t.complete}</td>
                        <td class="text-center font-semibold text-slate-700">${t.working_days} วัน</td>
                        <td class="text-center font-bold text-teal-700">
                            <div>${t.days_pass_6} / ${t.working_days} วัน</div>
                            ${t.days_low_work > 0 ? `<div class="text-[10px] font-semibold text-amber-600">(งานน้อย ${t.days_low_work} วัน)</div>` : ""}
                        </td>
                        <td class="text-center font-black text-base ${t.pass_target_6 ? 'text-emerald-600' : (t.is_low_work_team ? 'text-amber-600' : 'text-rose-600')}">${t.avg_in_per_day.toFixed(2)}</td>
                        <td class="text-center">${badge}</td>
                    </tr>
                `;
            }).join("");
        }
    }

    // 3.3 Daily Productivity Log Table
    renderRepairDailyLogTable(m.daily_prod_logs);
}

function renderRepairDailyLogTable(logs) {
    const dailyTbody = document.getElementById("repair-prod-daily-tbody");
    if (!dailyTbody) return;

    let filteredLogs = logs || [];
    if (repairDailyLogFilter === "pass") {
        filteredLogs = filteredLogs.filter(l => l.status_type === "pass");
    } else if (repairDailyLogFilter === "low") {
        filteredLogs = filteredLogs.filter(l => l.status_type === "low_work");
    } else if (repairDailyLogFilter === "fail") {
        filteredLogs = filteredLogs.filter(l => l.status_type === "below_target");
    }

    if (filteredLogs.length === 0) {
        dailyTbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-400">ไม่มีรายการตามตัวกรองที่เลือก</td></tr>`;
        return;
    }

    dailyTbody.innerHTML = filteredLogs.map(l => {
        let badge = "";
        let remarkHtml = "";
        if (l.status_type === "pass") {
            badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">ผ่านเกณฑ์ (${l.action_in} เบอร์ ≥ 6)</span>`;
            remarkHtml = `<span class="text-xs font-semibold text-emerald-700">ครบเกณฑ์ ≥ 6 เบอร์</span>`;
        } else if (l.status_type === "low_work") {
            badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">งานน้อย (${l.action_in}/${l.total} เบอร์)</span>`;
            remarkHtml = `<span class="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-50 text-amber-800 border border-amber-300">งานน้อย (รับงาน ${l.total} เบอร์)</span>`;
        } else {
            badge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">ต่ำกว่าเกณฑ์ (${l.action_in} เบอร์ &lt; 6)</span>`;
            remarkHtml = `<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">ต่ำกว่าเกณฑ์ (รับงาน ${l.total} เข้าซ่อม ${l.action_in})</span>`;
        }

        return `
            <tr>
                <td class="font-bold text-slate-800">${formatDateShortThai(l.date)} <span class="text-xs font-normal text-slate-400">(${escapeHtml(l.date)})</span></td>
                <td class="font-bold text-slate-900">${escapeHtml(l.team_name)}</td>
                <td class="text-center font-semibold text-slate-700">${l.total}</td>
                <td class="text-center bg-emerald-50/60 font-black text-emerald-700 text-base">${l.action_in}</td>
                <td class="text-center text-slate-600">${l.action_out}</td>
                <td class="text-center font-semibold text-emerald-600">${l.complete}</td>
                <td class="text-center">${badge}</td>
                <td class="text-center">${remarkHtml}</td>
                <td class="text-xs text-slate-600">${escapeHtml(l.districts || "-")}</td>
            </tr>
        `;
    }).join("");
}

// ============================================================================
// SECTION 4: เบอร์ (CCID) ที่แจ้งเสียซ้ำมาใน 30 วัน นับจากวันที่แจ้งเสียครั้งแรก (Complete + เข้าซ่อม)
// ============================================================================
function renderRepairSection4RepeatFaults(m) {
    const activeCases = repairRepeatMode === "strict" ? m.repeat_strict_cases : m.repeat_all_cases;

    const pillEl = document.getElementById("repair-repeat-count-pill");
    if (pillEl) {
        pillEl.textContent = repairRepeatMode === "strict"
            ? `${activeCases.length} เคส (ซ่อมเสร็จ Complete+เข้าซ่อม แล้วเสียซ้ำ)`
            : `${activeCases.length} เคส (รวมเบอร์ซ้ำทุกสถานะ)`;
    }

    // Technician Summary Cards for Repeat Faults
    const techSumEl = document.getElementById("repair-repeat-tech-summary");
    if (techSumEl) {
        if (activeCases.length === 0) {
            techSumEl.innerHTML = `
                <div class="col-span-full p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <i data-lucide="shield-check" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <div class="text-sm font-bold text-emerald-900">
                                ไม่พบเบอร์ที่แจ้งเสียซ้ำภายใน 30 วัน (ตามเกณฑ์ซ่อมเสร็จ Complete + เข้าซ่อม และไม่ใช่เลื่อนนัดหมาย)
                            </div>
                            <div class="text-xs text-emerald-700 mt-0.5">
                                หมายเหตุ: หากต้องการดูเบอร์ที่มีการเปิดใบงานซ้ำจากกรณีเลื่อนนัดหมาย หรือรอดำเนินการ (${m.repeat_all_cases.length} เคส) สามารถคลิกปุ่ม "ดูเบอร์ซ้ำทุกสถานะ" ด้านขวาบน หรือดูที่หัวข้อที่ 6
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            const byTech = {};
            activeCases.forEach(c => {
                const t = c.first_team || "ไม่ระบุช่าง";
                byTech[t] = (byTech[t] || 0) + 1;
            });
            techSumEl.innerHTML = Object.entries(byTech).sort((a, b) => b[1] - a[1]).map(([tech, cnt]) => `
                <div class="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 flex items-center justify-between">
                    <div>
                        <div class="text-[11px] font-semibold text-rose-700">ช่างผู้ดูแลเคสแรก</div>
                        <div class="text-sm font-bold text-slate-900 mt-0.5">${escapeHtml(tech)}</div>
                    </div>
                    <span class="px-2.5 py-1 rounded-xl font-black text-sm bg-rose-600 text-white">${cnt} เบอร์</span>
                </div>
            `).join("");
        }
    }

    // Detailed Table
    const tbody = document.getElementById("repair-repeat-tbody");
    if (tbody) {
        if (activeCases.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-6 text-slate-500">
                        ไม่มีเบอร์ที่เสียซ้ำหลังจากซ่อมเสร็จ (<strong class="text-emerald-700">Complete + เข้าซ่อม</strong> และไม่ใช่เลื่อนนัดหมาย) ภายใน 30 วันในข้อมูลชุดนี้
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = activeCases.map((c, idx) => `
                <tr>
                    <td class="font-semibold text-slate-500">${idx + 1}</td>
                    <td>
                        <span class="px-2.5 py-1 rounded-lg font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            ${escapeHtml(c.ccid)}
                        </span>
                    </td>
                    <td class="font-semibold text-slate-800">${escapeHtml(c.formatted_area)}</td>
                    <td>
                        <div class="font-bold text-slate-800">${escapeHtml(c.first_date)}</div>
                        <div class="text-[11px] text-slate-400">${escapeHtml(c.first_time || "")}</div>
                    </td>
                    <td class="font-bold text-slate-900">${escapeHtml(c.first_team)}</td>
                    <td>
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">${escapeHtml(c.first_status)} / ${escapeHtml(c.first_action)}</span>
                        <div class="text-xs text-slate-600 mt-0.5">${escapeHtml(c.first_reason)}</div>
                    </td>
                    <td>
                        <div class="font-bold text-rose-700">${escapeHtml(c.repeat_date)}</div>
                        <div class="text-[11px] text-slate-400">${escapeHtml(c.repeat_time || "")}</div>
                    </td>
                    <td class="text-center">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800">
                            ${c.days_diff} วัน
                        </span>
                    </td>
                    <td class="font-bold text-slate-900">${escapeHtml(c.repeat_team)}</td>
                    <td>
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800">${escapeHtml(c.repeat_status)} / ${escapeHtml(c.repeat_action)}</span>
                        <div class="text-xs text-slate-700 mt-0.5">${escapeHtml(c.repeat_reason)}</div>
                        ${c.repeat_remark ? `<div class="text-[11px] text-slate-500 mt-0.5">หมายเหตุ: ${escapeHtml(c.repeat_remark)}</div>` : ""}
                    </td>
                </tr>
            `).join("");
        }
    }
}

// ============================================================================
// SECTION 5: สถิติงานซ่อมแยกตามพื้นที่ (จัดอันดับ 11 อำเภอ เพื่อดูว่าอำเภอไหนงานเยอะหรือน้อย)
// ============================================================================
function renderRepairSection5AreaStats(m) {
    // 5.1 District Stacked Bar Chart
    const ctxArea = document.getElementById("chart-repair-area-district");
    if (ctxArea) {
        if (chartRepairAreaDistrict) chartRepairAreaDistrict.destroy();
        const labels = m.districts.map(d => `อ.${d.district}`);
        chartRepairAreaDistrict = new Chart(ctxArea, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "เข้าซ่อม",
                        data: m.districts.map(d => d.action_in),
                        backgroundColor: "#0d9488",
                        borderRadius: 4
                    },
                    {
                        label: "ไม่เข้าซ่อม",
                        data: m.districts.map(d => d.action_out),
                        backgroundColor: "#f59e0b",
                        borderRadius: 4
                    },
                    {
                        label: "รอดำเนินการ",
                        data: m.districts.map(d => d.total - d.action_in - d.action_out),
                        backgroundColor: "#cbd5e1",
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "top", labels: { font: { family: "Prompt", size: 11 } } }
                },
                scales: {
                    x: { stacked: true, ticks: { font: { family: "Prompt", size: 11 } } },
                    y: { stacked: true, beginAtZero: true, ticks: { font: { family: "Prompt", size: 11 } } }
                }
            }
        });
    }

    // 5.2 District Summary Cards (Clickable to filter by District)
    const distGrid = document.getElementById("repair-district-summary-grid");
    if (distGrid) {
        distGrid.innerHTML = m.districts.map(d => `
            <div onclick="filterRepairByDistrict('${escapeHtml(d.district)}')" class="p-3 rounded-xl bg-white border ${repairFilterDistrict === d.district ? 'border-teal-600 ring-2 ring-teal-500/20' : 'border-slate-200 hover:border-teal-400'} cursor-pointer transition flex items-center justify-between">
                <div>
                    <div class="font-bold text-slate-900 text-xs sm:text-sm">อ. ${escapeHtml(d.district)}</div>
                    <div class="text-[11px] text-slate-500 mt-0.5">${d.subdistrict_count} ตำบล • เข้าซ่อม ${d.action_in}/${d.total} งาน</div>
                </div>
                <div class="text-right">
                    <span class="px-2.5 py-1 rounded-xl font-black text-xs bg-teal-50 text-teal-800 border border-teal-200">${d.total} งาน</span>
                </div>
            </div>
        `).join("");
    }

    // 5.3 All 11 Phetchabun Districts Workload Ranking Table
    const distRankTbody = document.getElementById("repair-district-ranking-tbody");
    if (distRankTbody && m.all_districts_ranking) {
        distRankTbody.innerHTML = m.all_districts_ranking.map((d, idx) => `
            <tr onclick="filterRepairByDistrict('${escapeHtml(d.district)}')" class="cursor-pointer hover:bg-teal-50/40 transition ${d.total === 0 ? 'opacity-60' : ''}">
                <td class="font-bold text-slate-500">#${idx + 1}</td>
                <td class="font-bold text-slate-900">อ. ${escapeHtml(d.district)}</td>
                <td class="text-center font-semibold text-slate-600">${d.subdistrict_count} ตำบล</td>
                <td class="text-center font-black text-slate-900 text-base">${d.total}</td>
                <td class="text-center font-semibold text-teal-700">${d.share_pct}%</td>
                <td class="text-center font-semibold text-emerald-700">${d.complete}</td>
                <td class="text-center font-semibold text-amber-700">${d.retrun}</td>
                <td class="text-center font-semibold text-rose-700">${d.cencel}</td>
                <td class="text-center text-slate-500">${d.pending}</td>
                <td class="text-center bg-teal-50/50 font-black text-teal-700">${d.action_in}</td>
                <td class="text-center text-slate-600">${d.action_out}</td>
                <td class="text-center">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${d.workload_class}">
                        ${d.workload_level}
                    </span>
                </td>
            </tr>
        `).join("");
    }

    // 5.4 Detailed District - Subdistrict Table
    const areaTbody = document.getElementById("repair-area-table-tbody");
    if (areaTbody) {
        if (m.subdistricts.length === 0) {
            areaTbody.innerHTML = `<tr><td colspan="12" class="text-center py-6 text-slate-400">ไม่พบข้อมูลพื้นที่</td></tr>`;
        } else {
            areaTbody.innerHTML = m.subdistricts.map((sd, idx) => `
                <tr>
                    <td class="text-slate-400 font-semibold">${idx + 1}</td>
                    <td class="font-bold text-slate-900">อ. ${escapeHtml(sd.district)}</td>
                    <td class="font-semibold text-teal-700">ต. ${escapeHtml(sd.subdistrict)}</td>
                    <td>
                        <span class="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800">
                            ${escapeHtml(sd.formatted)}
                        </span>
                    </td>
                    <td class="text-center font-bold text-slate-900">${sd.total}</td>
                    <td class="text-center font-semibold text-emerald-700">${sd.complete}</td>
                    <td class="text-center font-semibold text-amber-700">${sd.retrun}</td>
                    <td class="text-center font-semibold text-rose-700">${sd.cencel}</td>
                    <td class="text-center text-slate-500">${sd.pending}</td>
                    <td class="text-center bg-teal-50/50 font-black text-teal-700">${sd.action_in}</td>
                    <td class="text-center text-slate-600">${sd.action_out}</td>
                    <td class="text-center">
                        <span class="px-2 py-0.5 rounded-full text-xs font-bold ${sd.complete_pct >= 60 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                            ${sd.complete_pct}%
                        </span>
                    </td>
                </tr>
            `).join("");
        }
    }
}

// ============================================================================
// SECTION 6: แจ้งเตือนเบอร์ "รอดำเนินการ" ที่แจ้งเสียซ้ำ + คำแนะนำวิธีปิดงานเพื่อไม่ให้ตก KPI
// ============================================================================
function renderRepairSection6PendingAlerts(m) {
    const alerts = m.pending_repeat_alerts || [];

    // Update Sidebar Badge & Section 6 Header Pill
    const sidebarBadge = document.getElementById("sidebar-pending-repeat-badge");
    if (sidebarBadge) {
        sidebarBadge.textContent = alerts.length;
        if (alerts.length > 0) {
            sidebarBadge.classList.remove("hidden");
        } else {
            sidebarBadge.classList.add("hidden");
        }
    }

    const sec6Pill = document.getElementById("repair-sec6-alert-pill");
    if (sec6Pill) {
        sec6Pill.textContent = `${alerts.length} เบอร์เฝ้าระวัง`;
    }

    const tbody = document.getElementById("repair-pending-repeat-tbody");
    if (!tbody) return;

    if (alerts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-8 text-slate-500">
                    <div class="flex flex-col items-center justify-center space-y-1">
                        <span class="font-bold text-emerald-700">ไม่พบเบอร์ในสถานะ "รอดำเนินการ" ที่แจ้งเสียซ้ำภายใน 30 วัน (ไม่นับ Reason Code = เลื่อนนัดหมาย)</span>
                        <span class="text-xs text-slate-400">ขณะนี้ไม่มีใบงานค้างที่มีความเสี่ยงตก KPI แจ้งเสียซ้ำ 30 วัน</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = alerts.map((a, idx) => {
        const isCritical = a.has_completed_prior;
        const riskBadge = isCritical
            ? `<span class="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">เสี่ยงตก KPI สูง</span>`
            : `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">เฝ้าระวัง</span>`;

        const adviceBadge = isCritical
            ? `
                <div class="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900">
                    <div class="font-black text-xs text-rose-700 flex items-center gap-1">
                        <span>⚠️ ใบงานแรกเป็น Complete + เข้าซ่อม ไปแล้ว</span>
                    </div>
                    <div class="text-xs font-bold mt-1 text-rose-900">
                        ให้ปิดใบงานที่ซ้ำนี้เป็น <span class="px-1.5 py-0.5 rounded bg-rose-600 text-white">Status = Cencel</span> หรือ <span class="px-1.5 py-0.5 rounded bg-amber-600 text-white">Retrun</span> เท่านั้น!
                    </div>
                    <div class="text-[11px] text-rose-700 mt-0.5">(ห้ามปิด Complete + เข้าซ่อม เพื่อไม่ให้ตก KPI เสียซ้ำ 30 วัน)</div>
                </div>
            `
            : `
                <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                    <div class="font-bold text-xs text-amber-800">
                        ℹ️ ใบงานก่อนหน้าเป็น ${escapeHtml(a.prior_status)} / ${escapeHtml(a.prior_reason)} (ยังไม่นับเป็น Complete+เข้าซ่อม)
                    </div>
                    <div class="text-xs text-slate-700 mt-1">
                        • หากเข้าซ่อมครั้งนี้เป็นครั้งแรกจริง: สามารถปิด <strong class="text-emerald-700">Complete + เข้าซ่อม</strong> ได้ตามปกติ<br>
                        • <strong class="text-rose-700">แต่หากเบอร์นี้เคยปิด Complete + เข้าซ่อม มาก่อนแล้ว:</strong> ให้ปิดเป็น <strong>Status = Cencel / Retrun เท่านั้น</strong>
                    </div>
                </div>
            `;

        return `
            <tr class="${isCritical ? 'bg-rose-50/30' : ''}">
                <td class="font-bold text-slate-500">${idx + 1}</td>
                <td>
                    <span class="px-2.5 py-1 rounded-lg font-mono font-bold ${isCritical ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-amber-50 text-amber-800 border border-amber-200'}">
                        ${escapeHtml(a.ccid)}
                    </span>
                </td>
                <td class="font-semibold text-slate-800">${escapeHtml(a.formatted_area)}</td>
                <td>
                    <div class="font-bold text-rose-700">${escapeHtml(a.pending_date)}</div>
                    <div class="text-[11px] text-slate-400">${escapeHtml(a.pending_time || "")}</div>
                    <span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">รอดำเนินการ</span>
                </td>
                <td class="font-bold text-slate-900">${escapeHtml(a.pending_team)}</td>
                <td>
                    <div class="font-bold text-slate-800">${escapeHtml(a.prior_date)} <span class="text-[11px] font-normal text-slate-500">(${escapeHtml(a.prior_team)})</span></div>
                    <span class="inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold ${isCritical ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${escapeHtml(a.prior_status)} / ${escapeHtml(a.prior_action)}
                    </span>
                    <div class="text-xs font-semibold text-slate-700 mt-0.5">Reason: ${escapeHtml(a.prior_reason)}</div>
                    ${a.prior_remark ? `<div class="text-[11px] text-slate-500 mt-0.5">หมายเหตุ: ${escapeHtml(a.prior_remark)}</div>` : ""}
                </td>
                <td class="text-center">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                        ${a.days_diff} วัน
                    </span>
                </td>
                <td class="text-center">${riskBadge}</td>
                <td class="min-w-[300px] whitespace-normal">${adviceBadge}</td>
            </tr>
        `;
    }).join("");
}

function filterRepairByDistrict(distName) {
    if (repairFilterDistrict === distName) {
        repairFilterDistrict = "ALL";
    } else {
        repairFilterDistrict = distName;
    }
    const distEl = document.getElementById("repair-filter-district");
    if (distEl) distEl.value = repairFilterDistrict;
    repairFilterSubdistrict = "ALL";
    updateRepairSubdistrictDropdown();
    applyRepairFilters();
}

// ============================================================================
// DETAILED REPAIR JOBS TABLE & PAGINATION
// ============================================================================
function renderRepairJobsTable() {
    const tbody = document.getElementById("repair-jobs-table-body");
    const countLabel = document.getElementById("repair-table-filtered-count");
    if (!tbody) return;

    if (countLabel) {
        countLabel.textContent = `แสดง ${filteredRepairRows.length} รายการ (จากทั้งหมด ${allRepairRows.length} งานซ่อม)`;
    }

    if (filteredRepairRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">ไม่พบรายการงานซ่อมที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
        renderRepairPagination(0);
        return;
    }

    const startIdx = (repairCurrentPage - 1) * repairRowsPerPage;
    const pageItems = filteredRepairRows.slice(startIdx, startIdx + repairRowsPerPage);

    tbody.innerHTML = pageItems.map((r, i) => {
        let statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold badge-other">รอดำเนินการ</span>`;
        if (r.NormalizedStatus === "Complete") {
            statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold badge-complete">Complete</span>`;
        } else if (r.NormalizedStatus === "Retrun") {
            statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold badge-retrun">Retrun</span>`;
        } else if (r.NormalizedStatus === "Cencel") {
            statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold badge-reject">Cencel</span>`;
        }

        let actionBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold badge-other">รอดำเนินการ</span>`;
        if (r.NormalizedRepairAction === "เข้าซ่อม") {
            actionBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold badge-repair-in">เข้าซ่อม</span>`;
        } else if (r.NormalizedRepairAction === "ไม่เข้าซ่อม") {
            actionBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold badge-repair-out">ไม่เข้าซ่อม</span>`;
        }

        const swapTag = r.AreaSwapped
            ? `<span class="ml-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800" title="ต้นฉบับ: ${escapeHtml(r.RawArea)}">สลับ อ.-ต.</span>`
            : "";

        return `
            <tr>
                <td class="text-slate-400 font-semibold">${escapeHtml(r["No."] || (startIdx + i + 1))}</td>
                <td>
                    <div class="font-bold text-slate-800">${escapeHtml(r["Appoint Date"] || "-")}</div>
                    ${r["Appoint Time"] ? `<div class="text-[11px] text-slate-400">${escapeHtml(r["Appoint Time"])}</div>` : ""}
                </td>
                <td>
                    <span class="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">${escapeHtml(r["CCID"] || "-")}</span>
                </td>
                <td>
                    <div class="font-bold text-slate-900 flex items-center flex-wrap">
                        <span>อ. ${escapeHtml(r.District)}</span>
                        ${r.Subdistrict ? `<span class="mx-1 text-slate-400">-</span><span class="text-teal-700">ต. ${escapeHtml(r.Subdistrict)}</span>` : ""}
                        ${swapTag}
                    </div>
                    <div class="text-[10px] text-slate-400">ต้นฉบับ: ${escapeHtml(r.RawArea || "-")}</div>
                </td>
                <td>
                    <div class="font-bold text-slate-900">${escapeHtml(r["ทีมช่าง"] || "-")}</div>
                    <div class="text-[11px] text-slate-400">Field Service: ${escapeHtml(r["Field Service"] || "-")}</div>
                </td>
                <td>${statusBadge}</td>
                <td>${actionBadge}</td>
                <td class="min-w-[260px] whitespace-normal break-words">
                    <div class="font-semibold text-slate-800">${escapeHtml(r["Reason Code"] || "-")}</div>
                    ${r["Remark"] ? `<div class="text-[11px] text-slate-600 bg-slate-100 rounded px-2 py-1 mt-1"><strong>หมายเหตุ:</strong> ${escapeHtml(r["Remark"])}</div>` : ""}
                </td>
            </tr>
        `;
    }).join("");

    renderRepairPagination(filteredRepairRows.length);
}

function renderRepairPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / repairRowsPerPage) || 1;
    const container = document.getElementById("repair-pagination-container");
    if (!container) return;

    container.innerHTML = `
        <div class="flex items-center space-x-1 text-xs">
            <button onclick="changeRepairPage(1)" ${repairCurrentPage === 1 ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">หน้าแรก</button>
            <button onclick="changeRepairPage(${repairCurrentPage - 1})" ${repairCurrentPage === 1 ? 'disabled' : ''} class="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">ก่อนหน้า</button>
            <span class="px-3 py-1 font-semibold text-slate-700">หน้า ${repairCurrentPage} จาก ${totalPages}</span>
            <button onclick="changeRepairPage(${repairCurrentPage + 1})" ${repairCurrentPage >= totalPages ? 'disabled' : ''} class="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">ถัดไป</button>
            <button onclick="changeRepairPage(${totalPages})" ${repairCurrentPage >= totalPages ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">หน้าสุดท้าย</button>
        </div>
    `;
}

function changeRepairPage(page) {
    const totalPages = Math.ceil(filteredRepairRows.length / repairRowsPerPage) || 1;
    if (page >= 1 && page <= totalPages) {
        repairCurrentPage = page;
        renderRepairJobsTable();
    }
}

// Setup Event Listeners for Page 2 (งานซ่อม)
function setupRepairEventListeners() {
    const yearEl = document.getElementById("repair-filter-year");
    const monthEl = document.getElementById("repair-filter-month");
    const dateEl = document.getElementById("repair-filter-date");
    const statusEl = document.getElementById("repair-filter-status");
    const actionEl = document.getElementById("repair-filter-action");
    const distEl = document.getElementById("repair-filter-district");
    const subEl = document.getElementById("repair-filter-subdistrict");
    const teamEl = document.getElementById("repair-filter-team");
    const resetBtn = document.getElementById("repair-btn-reset-filters");
    const searchEl = document.getElementById("repair-search-input");
    const rowsPerPageEl = document.getElementById("repair-select-rows-per-page");

    if (yearEl) {
        yearEl.addEventListener("change", (e) => {
            repairFilterYear = e.target.value;
            populateRepairDateDropdown();
            applyRepairFilters();
        });
    }
    if (monthEl) {
        monthEl.addEventListener("change", (e) => {
            repairFilterMonth = e.target.value;
            repairFilterDate = "ALL";
            populateRepairDateDropdown();
            applyRepairFilters();
        });
    }
    if (dateEl) {
        dateEl.addEventListener("change", (e) => {
            repairFilterDate = e.target.value;
            applyRepairFilters();
        });
    }
    if (statusEl) {
        statusEl.addEventListener("change", (e) => {
            repairFilterStatus = e.target.value;
            applyRepairFilters();
        });
    }
    if (actionEl) {
        actionEl.addEventListener("change", (e) => {
            repairFilterAction = e.target.value;
            applyRepairFilters();
        });
    }
    if (distEl) {
        distEl.addEventListener("change", (e) => {
            repairFilterDistrict = e.target.value;
            repairFilterSubdistrict = "ALL";
            updateRepairSubdistrictDropdown();
            applyRepairFilters();
        });
    }
    if (subEl) {
        subEl.addEventListener("change", (e) => {
            repairFilterSubdistrict = e.target.value;
            applyRepairFilters();
        });
    }
    if (teamEl) {
        teamEl.addEventListener("change", (e) => {
            repairFilterTeam = e.target.value;
            applyRepairFilters();
        });
    }
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            repairFilterYear = "ALL";
            repairFilterMonth = "ALL";
            repairFilterDate = "ALL";
            repairFilterStatus = "ALL";
            repairFilterAction = "ALL";
            repairFilterDistrict = "ALL";
            repairFilterSubdistrict = "ALL";
            repairFilterTeam = "ALL";
            repairSearchQuery = "";

            if (yearEl) yearEl.value = "ALL";
            if (monthEl) monthEl.value = "ALL";
            populateRepairDateDropdown();
            if (statusEl) statusEl.value = "ALL";
            if (actionEl) actionEl.value = "ALL";
            if (distEl) distEl.value = "ALL";
            updateRepairSubdistrictDropdown();
            if (teamEl) teamEl.value = "ALL";
            if (searchEl) searchEl.value = "";

            applyRepairFilters();
            showToast("รีเซ็ตตัวกรองงานซ่อมทั้งหมดแล้ว", "info");
        });
    }
    if (searchEl) {
        searchEl.addEventListener("input", (e) => {
            repairSearchQuery = e.target.value.trim();
            applyRepairFilters();
        });
    }
    if (rowsPerPageEl) {
        rowsPerPageEl.addEventListener("change", (e) => {
            repairRowsPerPage = parseInt(e.target.value) || 15;
            repairCurrentPage = 1;
            renderRepairJobsTable();
        });
    }

    // Section 3 Daily Log Filter Buttons
    const btnDailyAll = document.getElementById("repair-btn-daily-all");
    const btnDailyPass = document.getElementById("repair-btn-daily-pass");
    const btnDailyLow = document.getElementById("repair-btn-daily-low");
    const btnDailyFail = document.getElementById("repair-btn-daily-fail");

    function updateRepairDailyButtons() {
        if (btnDailyAll) {
            btnDailyAll.className = repairDailyLogFilter === "all"
                ? "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-teal-700 shadow-sm"
                : "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
        }
        if (btnDailyPass) {
            btnDailyPass.className = repairDailyLogFilter === "pass"
                ? "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-emerald-700 shadow-sm"
                : "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
        }
        if (btnDailyLow) {
            btnDailyLow.className = repairDailyLogFilter === "low"
                ? "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-amber-700 shadow-sm"
                : "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
        }
        if (btnDailyFail) {
            btnDailyFail.className = repairDailyLogFilter === "fail"
                ? "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-rose-700 shadow-sm"
                : "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
        }
    }

    if (btnDailyAll && btnDailyPass && btnDailyFail) {
        btnDailyAll.addEventListener("click", () => {
            repairDailyLogFilter = "all";
            updateRepairDailyButtons();
            const m = computeRepairMetrics(filteredRepairRows, allRepairRows);
            renderRepairDailyLogTable(m.daily_prod_logs);
        });
        btnDailyPass.addEventListener("click", () => {
            repairDailyLogFilter = "pass";
            updateRepairDailyButtons();
            const m = computeRepairMetrics(filteredRepairRows, allRepairRows);
            renderRepairDailyLogTable(m.daily_prod_logs);
        });
        if (btnDailyLow) {
            btnDailyLow.addEventListener("click", () => {
                repairDailyLogFilter = "low";
                updateRepairDailyButtons();
                const m = computeRepairMetrics(filteredRepairRows, allRepairRows);
                renderRepairDailyLogTable(m.daily_prod_logs);
            });
        }
        btnDailyFail.addEventListener("click", () => {
            repairDailyLogFilter = "fail";
            updateRepairDailyButtons();
            const m = computeRepairMetrics(filteredRepairRows, allRepairRows);
            renderRepairDailyLogTable(m.daily_prod_logs);
        });
    }

    // Section 4 Repeat Mode Toggle Buttons
    const btnRepeatStrict = document.getElementById("repair-btn-repeat-strict");
    const btnRepeatAll = document.getElementById("repair-btn-repeat-all");

    if (btnRepeatStrict && btnRepeatAll) {
        btnRepeatStrict.addEventListener("click", () => {
            repairRepeatMode = "strict";
            btnRepeatStrict.className = "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-rose-600 shadow-sm";
            btnRepeatAll.className = "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
            const m = computeRepairMetrics(filteredRepairRows, allRepairRows);
            renderRepairSection4RepeatFaults(m);
            initLucide();
        });
        btnRepeatAll.addEventListener("click", () => {
            repairRepeatMode = "all";
            btnRepeatAll.className = "px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-amber-700 shadow-sm";
            btnRepeatStrict.className = "px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900";
            const m = computeRepairMetrics(filteredRepairRows, allRepairRows);
            renderRepairSection4RepeatFaults(m);
            initLucide();
        });
    }
}

// Export Repair Filtered Data to CSV
function exportRepairDataToCSV() {
    if (filteredRepairRows.length === 0) {
        showToast("ไม่มีข้อมูลงานซ่อมสำหรับส่งออก", "warning");
        return;
    }

    const headers = ["No.", "Appoint Date", "Appoint Time", "CCID", "อำเภอ (หน้า -)", "ตำบล (หลัง -)", "รูปแบบมาตรฐาน (อำเภอ - ตำบล)", "พื้นที่ต้นฉบับ (Area Name)", "Field Service", "ทีมช่าง", "Status", "Status การซ่อม", "Reason Code", "Remark"];
    const csvContent = [headers.join(",")];

    filteredRepairRows.forEach((r, idx) => {
        const row = [
            `"${(r['No.'] || String(idx + 1)).replace(/\x22/g, '""')}"`,
            `"${(r['Appoint Date'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Appoint Time'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['CCID'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['District'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Subdistrict'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['FormattedArea'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['RawArea'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Field Service'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['ทีมช่าง'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['NormalizedStatus'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['NormalizedRepairAction'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Reason Code'] || '').replace(/\x22/g, '""')}"`,
            `"${(r['Remark'] || '').replace(/\x22/g, '""')}"`
        ];
        csvContent.push(row.join(","));
    });

    const blob = new Blob(["\uFEFF" + csvContent.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repair_dashboard_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("ส่งออกข้อมูลงานซ่อม CSV สำเร็จ", "success");
}

// Expose navigation and modal handlers on window for inline onclick compatibility in Google Apps Script HtmlService
window.switchMainPage = switchMainPage;
window.switchInstallTab = switchInstallTab;
window.switchRepairTab = switchRepairTab;
window.closeReasonDetailModal = closeReasonDetailModal;
window.openReasonDetailModal = openReasonDetailModal;
window.filterRepairByDistrict = filterRepairByDistrict;
window.changeRepairPage = changeRepairPage;
window.changePage = changePage;
