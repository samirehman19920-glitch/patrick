import platform
import subprocess
import time
import urllib.request
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
# Vercel serves `public/**` from the CDN; keep the same paths for local uvicorn.
PUBLIC_DIR = BASE_DIR / "public"
PUBLIC_STATIC = PUBLIC_DIR / "static"

app = FastAPI(title="System Spec API", version="1.0.0")

# Allow all origins (useful if calling from a browser/JotForm page)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

if PUBLIC_STATIC.is_dir():
    app.mount("/static", StaticFiles(directory=str(PUBLIC_STATIC)), name="static")


# ──────────────────────────────────────────
#  RESPONSE MODEL
# ──────────────────────────────────────────

class SystemSpecs(BaseModel):
    cpu: str
    ram: str
    os: str
    internet_speed: str


# ──────────────────────────────────────────
#  DETECTION FUNCTIONS
# ──────────────────────────────────────────

def get_cpu() -> str:
    system = platform.system()
    try:
        if system == "Windows":
            result = subprocess.check_output(
                "wmic cpu get Name", shell=True
            ).decode(errors="ignore").strip().splitlines()
            for line in result:
                line = line.strip()
                if line and line.lower() != "name":
                    return line
        elif system == "Darwin":
            return subprocess.check_output(
                ["sysctl", "-n", "machdep.cpu.brand_string"]
            ).decode(errors="ignore").strip()
        elif system == "Linux":
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if "model name" in line:
                        return line.split(":")[1].strip()
    except Exception:
        pass
    return platform.processor() or "Unknown"


def get_ram() -> str:
    system = platform.system()
    try:
        if system == "Windows":
            result = subprocess.check_output(
                "wmic ComputerSystem get TotalPhysicalMemory", shell=True
            ).decode(errors="ignore").strip().splitlines()
            for line in result:
                line = line.strip()
                if line.isdigit():
                    gb = round(int(line) / (1024 ** 3), 1)
                    return f"{gb} GB"
        elif system == "Darwin":
            result = subprocess.check_output(
                ["sysctl", "-n", "hw.memsize"]
            ).decode(errors="ignore").strip()
            if result.isdigit():
                gb = round(int(result) / (1024 ** 3), 1)
                return f"{gb} GB"
        elif system == "Linux":
            with open("/proc/meminfo") as f:
                for line in f:
                    if "MemTotal" in line:
                        kb = int(line.split()[1])
                        gb = round(kb / (1024 ** 2), 1)
                        return f"{gb} GB"
    except Exception:
        pass
    return "Unknown"


def get_os() -> str:
    try:
        return f"{platform.system()} {platform.release()} ({platform.version()})"
    except Exception:
        return "Unknown"


def get_internet_speed() -> str:
    try:
        # Changed URL to a more reliable file host for speed testing
        url   = "http://speedtest.tele2.net/1MB.zip"
        start = time.time()
        # Adding a custom user agent helps avoid being blocked by servers
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = response.read()
        elapsed = time.time() - start
        
        if elapsed > 0:
            mbps = round((len(data) * 8) / elapsed / 1_000_000, 2)
            return f"{mbps} Mbps"
        return "Unknown"
    except Exception as e:
        return f"Unavailable ({str(e)})"


# ──────────────────────────────────────────
#  ENDPOINTS
# ──────────────────────────────────────────


@app.get("/")
def root(request: Request, format: str | None = None):
    """HTML for browsers; JSON when Accept prefers application/json or ?format=json."""
    accept = request.headers.get("accept") or ""
    wants_json = "application/json" in accept or format == "json"
    index = PUBLIC_DIR / "index.html"
    if not wants_json and index.is_file():
        return FileResponse(index)
    return SystemSpecs(
        cpu=get_cpu(),
        ram=get_ram(),
        os=get_os(),
        internet_speed=get_internet_speed(),
    )


@app.get("/api/specs", response_model=SystemSpecs)
def get_all_specs():
    """Returns all system specs as JSON."""
    return SystemSpecs(
        cpu=get_cpu(),
        ram=get_ram(),
        os=get_os(),
        internet_speed=get_internet_speed(),
    )