(function () {
  const loading = document.getElementById("loading");
  const grid = document.getElementById("grid");
  const err = document.getElementById("err");
  const card = document.getElementById("card");
  const openJsonBtn = document.getElementById("openJson");

  /** @type {{ cpu: string, ram: string, os: string, internet_speed: string } | null} */
  let lastSpecs = null;

  function setVisible(showGrid, message) {
    loading.classList.toggle("hidden", showGrid);
    grid.classList.toggle("hidden", !showGrid);
    err.classList.toggle("hidden", !message);
    if (message) err.textContent = message;
  }

  function getWebglRenderer() {
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) return null;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (!ext) return null;
      return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    } catch (_) {
      return null;
    }
  }

  function getCpuString() {
    const cores = navigator.hardwareConcurrency;
    const gpu = getWebglRenderer();
    const parts = [];
    if (cores) parts.push(`${cores} logical cores`);
    if (gpu) parts.push(gpu);
    return parts.length ? parts.join(" · ") : "Limited (browser does not expose CPU model)";
  }

  function getRamString() {
    const dm = navigator.deviceMemory;
    if (typeof dm === "number" && dm > 0) {
      return `~${dm} GB (browser estimate; Chrome/Edge)`;
    }
    return "Not exposed by this browser (often available in Chrome)";
  }

  function guessOsFromUa(ua) {
    if (/Windows NT 10\.0/.test(ua)) return "Windows 10/11";
    if (/Windows NT 6\.3/.test(ua)) return "Windows 8.1";
    if (/Windows NT 6\.2/.test(ua)) return "Windows 8";
    if (/Windows NT 6\.1/.test(ua)) return "Windows 7";
    if (/Windows NT/.test(ua)) return "Windows";
    const mac = ua.match(/Mac OS X ([\d_]+)/);
    if (mac) return "macOS " + mac[1].replace(/_/g, ".");
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS / iPadOS";
    if (/Linux/.test(ua)) return "Linux";
    return ua.length > 160 ? ua.slice(0, 157) + "…" : ua;
  }

  async function getOsString() {
    try {
      const uad = navigator.userAgentData;
      if (uad && typeof uad.getHighEntropyValues === "function") {
        const hi = await uad.getHighEntropyValues([
          "platform",
          "platformVersion",
          "architecture",
        ]);
        const plat = hi.platform || uad.platform || "";
        const ver = hi.platformVersion || "";
        const arch = hi.architecture || "";
        const bits = [plat, ver, arch].filter(Boolean).join(" · ");
        if (bits) return bits;
      }
    } catch (_) {}
    return guessOsFromUa(navigator.userAgent || "");
  }

  async function measureDownloadMbps() {
    const url = "/speedtest-512k.bin";
    const t0 = performance.now();
    const res = await fetch(url, { cache: "no-store", method: "GET" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = await res.arrayBuffer();
    const sec = (performance.now() - t0) / 1000;
    if (sec <= 0) throw new Error("bad timing");
    const mbps = ((buf.byteLength * 8) / sec / 1e6).toFixed(2);
    return `${mbps} Mbps (to your device)`;
  }

  async function loadSpecs() {
    setVisible(false, "");
    card.setAttribute("aria-busy", "true");
    loading.classList.remove("hidden");
    grid.classList.add("hidden");
    openJsonBtn.disabled = true;
    lastSpecs = null;

    try {
      const osPromise = getOsString();
      const speedPromise = measureDownloadMbps().catch(
        (e) => `Unavailable (${e.message || e})`
      );
      const [os, internet_speed] = await Promise.all([osPromise, speedPromise]);
      const cpu = getCpuString();
      const ram = getRamString();

      lastSpecs = { cpu, ram, os, internet_speed };

      document.getElementById("cpu").textContent = cpu;
      document.getElementById("ram").textContent = ram;
      document.getElementById("os").textContent = os;
      document.getElementById("internet_speed").textContent = internet_speed;
      setVisible(true, "");
    } catch (e) {
      setVisible(false, e.message || "Could not read device info.");
    } finally {
      card.setAttribute("aria-busy", "false");
      openJsonBtn.disabled = !lastSpecs;
    }
  }

  openJsonBtn.addEventListener("click", () => {
    if (!lastSpecs) return;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    const pre = w.document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    pre.style.padding = "16px";
    pre.textContent = JSON.stringify(lastSpecs, null, 2);
    w.document.body.appendChild(pre);
    w.document.title = "Your system specs (JSON)";
  });

  document.getElementById("refresh").addEventListener("click", loadSpecs);
  loadSpecs();
})();
