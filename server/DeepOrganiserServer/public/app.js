const platformIds = {
  macOS: "macOSAssets",
  Windows: "WindowsAssets",
  Linux: "LinuxAssets",
};

const platformIconSrc = {
  macOS: "icons/generated/origin-platform-macos.png?v=20260629-icons",
  Windows: "icons/generated/origin-platform-windows.png?v=20260629-icons",
  Linux: "icons/generated/origin-platform-linux.png?v=20260629-icons",
};

const iconSrc = {
  primaryDownload: "icons/generated/origin-primary-download.png?v=20260629-icons",
  channelFeed: "icons/generated/origin-channel-feed.png?v=20260629-icons",
  openOriginal: "icons/generated/origin-original-link.png?v=20260629-icons",
};

const researchHubs = [
  {
    id: "westlake",
    label: "西湖大学",
    lat: 30.25,
    lon: 120.16,
    region: "杭州 · 研究协调中心",
    status: "运行中",
  },
  {
    id: "beijing",
    label: "清华大学实验室",
    lat: 39.9,
    lon: 116.4,
    region: "北京 · 交叉学科实验室",
    status: "评审中",
  },
  {
    id: "shanghai",
    label: "上海科研数据中心",
    lat: 31.23,
    lon: 121.47,
    region: "上海 · 数据与文献中心",
    status: "已同步",
  },
  {
    id: "singapore",
    label: "新加坡国立大学",
    lat: 1.35,
    lon: 103.82,
    region: "新加坡 · 亚洲研究中心",
    status: "协作中",
  },
  {
    id: "boston",
    label: "MIT 研究实验室",
    lat: 42.36,
    lon: -71.06,
    region: "波士顿 · 计算科学实验室",
    status: "运行中",
  },
  {
    id: "london",
    label: "伦敦大学学院",
    lat: 51.5,
    lon: -0.12,
    region: "伦敦 · 学术评议中心",
    status: "待确认",
  },
  {
    id: "geneva",
    label: "日内瓦开放科学中心",
    lat: 46.2,
    lon: 6.14,
    region: "日内瓦 · 科研治理中心",
    status: "同步中",
  },
  {
    id: "tokyo",
    label: "东京大学研究中心",
    lat: 35.68,
    lon: 139.65,
    region: "东京 · 模型科学中心",
    status: "运行中",
  },
];

const researchConnections = [
  ["westlake", "shanghai"],
  ["westlake", "beijing"],
  ["westlake", "singapore"],
  ["singapore", "tokyo"],
  ["tokyo", "shanghai"],
  ["beijing", "geneva"],
  ["geneva", "london"],
  ["london", "boston"],
  ["boston", "westlake"],
];

function formatDate(value) {
  if (!value) return "等待发布";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function assetLabel(asset) {
  return `${asset.kind} · ${asset.arch}`;
}

function renderAssets(downloads) {
  let primary = null;
  for (const [platform, id] of Object.entries(platformIds)) {
    const target = document.getElementById(id);
    const assets = downloads?.[platform] || [];
    target.innerHTML = "";
    if (!assets.length) {
      target.innerHTML = '<span class="empty">等待发布包上传</span>';
      continue;
    }
    for (const asset of assets.slice(0, 3)) {
      const link = document.createElement("a");
      link.className = "asset-button";
      link.href = asset.url;
      link.innerHTML = `<img class="asset-icon" src="${platformIconSrc[platform] || iconSrc.primaryDownload}" alt="" /><strong>${assetLabel(asset)}</strong><span>${asset.sizeLabel}</span>`;
      target.appendChild(link);
      if (!primary && (asset.kind === "DMG" || asset.kind === "Installer" || asset.kind === "DEB")) {
        primary = asset.url;
      }
    }
  }
  if (primary) {
    document.getElementById("primaryDownload").href = primary;
  }
}

function renderChannels(channels) {
  const target = document.getElementById("channelList");
  target.innerHTML = "";
  for (const name of Object.keys(channels || {}).sort()) {
    const channel = channels[name];
    const item = document.createElement("a");
    item.className = `channel-item ${channel.present ? "present" : ""}`;
    item.href = channel.url;
    item.innerHTML = `<img class="channel-icon" src="${iconSrc.channelFeed}" alt="" /><strong>${name}</strong><img class="channel-open-icon" src="${iconSrc.openOriginal}" alt="" />`;
    target.appendChild(item);
  }
}

function normalizeLon(lon) {
  let next = lon;
  while (next < -180) next += 360;
  while (next > 180) next -= 360;
  return next;
}

function isLand(lat, lon) {
  const l = normalizeLon(lon);

  if (lat >= 12 && lat <= 78 && l >= -168 && l <= -50) {
    if (lat > 52 && lat < 64 && l > -94 && l < -76) return false;
    if (lat > 15 && lat < 30 && l > -98 && l < -82) return false;
    if (lat > 25) return l > -126 && l < -60;
    return l > -116 && l < -86;
  }

  if (lat >= -56 && lat < 12 && l >= -82 && l <= -34) {
    if (lat < -20) {
      const width = ((lat + 56) / 36) * 26;
      return l >= -67 - width && l <= -67 + width;
    }
    return lat < 5 ? l >= -81 && l <= -35 : l >= -77 && l <= -48;
  }

  if (lat >= -35 && lat <= 37 && l >= -18 && l <= 51) {
    if (lat > 12 && lat < 30 && l > 32 && l < 43) return false;
    if (l > 43) return false;
    if (lat > 5) return l >= -17 && l <= 34;
    const progress = (lat + 35) / 40;
    return l >= -10 - progress * 5 && l <= 22 + progress * 16;
  }

  if (lat > 35 && lat <= 72 && l >= -10 && l <= 40) {
    if (lat > 50 && lat < 61 && l > -11 && l < 2) return true;
    if (lat > 55 && l > 4 && l < 32) return true;
    if (lat > 40 && lat < 47 && l > 27 && l < 42) return false;
    return l > -5 && l < 40;
  }

  if (lat >= 5 && lat <= 76 && l > 35 && l <= 180) {
    if (lat > 50) return l > 35 && l < 172;
    if (lat > 12 && lat <= 30 && l > 34 && l < 60) return l < 60 - (lat - 12) * 0.45;
    if (lat > 8 && lat < 25 && l > 68 && l < 88) return lat > 8 + Math.abs(l - 78) * 1.1;
    if (lat > 8 && lat < 23 && l > 95 && l < 110) return true;
    if (lat > 33 && lat < 41 && l > 124 && l < 131) return true;
    return l > 55 && l < 142;
  }

  if (lat > 30 && lat < 46 && l > 129 && l < 146) return true;
  if (lat >= -39 && lat <= -10 && l >= 113 && l <= 154) return true;
  if (lat >= 60 && lat <= 83 && l >= -73 && l <= -10) return true;
  if (lat >= -26 && lat < -12 && l > 43 && l < 51) return true;
  if (lat > -9 && lat < 8 && l > 95 && l < 150) return true;

  return false;
}

function latLonToCartesian(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return {
    x: -radius * Math.sin(phi) * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.cos(theta),
  };
}

function buildGlobePoints() {
  const points = [];

  for (let lat = -75; lat <= 75; lat += 2.35) {
    const cosLat = Math.cos(lat * (Math.PI / 180));
    const lonStep = cosLat > 0.08 ? 2.35 / cosLat : 28;

    for (let lon = -180; lon < 180; lon += lonStep) {
      if (!isLand(lat, lon)) continue;
      const point = latLonToCartesian(lat, lon, 1);
      const opacity = 0.34 + ((Math.sin(lat * 12.9898 + lon * 78.233) + 1) / 2) * 0.38;
      points.push({ ...point, opacity });
    }
  }

  for (let index = 0; index < 110; index += 1) {
    const phi = Math.acos(-1 + (2 * index) / 110);
    const theta = Math.sqrt(110 * Math.PI) * phi;
    points.push({
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.cos(phi),
      z: Math.sin(phi) * Math.sin(theta),
      opacity: 0.06 + (index % 9) * 0.012,
    });
  }

  return points;
}

function initDownloadGlobe() {
  const canvas = document.getElementById("downloadGlobeCanvas");
  const container = document.getElementById("downloadGlobe");
  if (!canvas || !container) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const points = buildGlobePoints();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let animationFrameId = 0;
  let width = 0;
  let height = 0;
  let rotationX = 0.25;
  let rotationY = 1.18;
  let velocityX = 0.00115;
  let velocityY = 0.00008;
  let projectedHubs = [];
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };

  const updateSize = () => {
    width = container.clientWidth;
    height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const projectFactory = (cx, cy, radius) => {
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);

    return (x3d, y3d, z3d) => {
      const x1 = x3d * cosY - z3d * sinY;
      const z1 = x3d * sinY + z3d * cosY;
      const y2 = y3d * cosX - z1 * sinX;
      const z2 = y3d * sinX + z1 * cosX;

      return {
        scale: 1 - (z2 / radius) * 0.2,
        x: cx + x1,
        y: cy - y2,
        z: z2,
      };
    };
  };

  const drawArc = (project, radius, fromHub, toHub) => {
    const peak = radius * 0.16;
    let previous = project(fromHub.rawX, fromHub.rawY, fromHub.rawZ);

    for (let step = 1; step <= 20; step += 1) {
      const t = step / 20;
      const mt = 1 - t;
      const midX = (fromHub.rawX + toHub.rawX) / 2;
      const midY = (fromHub.rawY + toHub.rawY) / 2;
      const midZ = (fromHub.rawZ + toHub.rawZ) / 2;
      const midLength = Math.max(1, Math.sqrt(midX * midX + midY * midY + midZ * midZ));
      const control = {
        x: (midX / midLength) * (radius + peak),
        y: (midY / midLength) * (radius + peak),
        z: (midZ / midLength) * (radius + peak),
      };
      const currentPoint = {
        x: mt * mt * fromHub.rawX + 2 * mt * t * control.x + t * t * toHub.rawX,
        y: mt * mt * fromHub.rawY + 2 * mt * t * control.y + t * t * toHub.rawY,
        z: mt * mt * fromHub.rawZ + 2 * mt * t * control.z + t * t * toHub.rawZ,
      };
      const current = project(currentPoint.x, currentPoint.y, currentPoint.z);
      const alpha = current.z > radius * 0.22 ? 0.02 : 0.09 + Math.max(0, -current.z / radius) * 0.12;

      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.strokeStyle = `rgba(32, 36, 44, ${alpha})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      previous = current;
    }
  };

  const render = () => {
    if (!width || !height) {
      animationFrameId = requestAnimationFrame(render);
      return;
    }

    const radius = Math.min(width, height) * 0.32;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);

    if (!isDragging && !reduceMotion) {
      rotationY += velocityX;
      rotationX += velocityY;
      velocityX = velocityX * 0.96 + 0.0011 * 0.04;
      velocityY = velocityY * 0.96 + 0.00008 * 0.04;
    }
    rotationX = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, rotationX));

    const project = projectFactory(cx, cy, radius);
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.65);
    glow.addColorStop(0, "rgba(185, 154, 69, 0.13)");
    glow.addColorStop(0.5, "rgba(32, 36, 44, 0.04)");
    glow.addColorStop(1, "rgba(32, 36, 44, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const sphere = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.28, radius * 0.1, cx, cy, radius);
    sphere.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    sphere.addColorStop(0.44, "rgba(244, 242, 235, 0.72)");
    sphere.addColorStop(0.78, "rgba(214, 219, 221, 0.36)");
    sphere.addColorStop(1, "rgba(32, 36, 44, 0.08)");

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = sphere;
    ctx.shadowColor = "rgba(32, 36, 44, 0.1)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 16;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#faf8f5";
    ctx.fill();

    for (const point of points) {
      const projected = project(point.x * radius, point.y * radius, point.z * radius);
      const edgeFade = Math.min(1, Math.abs(projected.z / radius) / 0.22);
      const isFront = projected.z <= 0;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, (isFront ? 1.05 : 0.72) * projected.scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(32, 36, 44, ${point.opacity * (isFront ? 0.55 : 0.1) * edgeFade})`;
      ctx.fill();
    }

    projectedHubs = researchHubs.map((hub) => {
      const raw = latLonToCartesian(hub.lat, hub.lon, radius * 1.04);
      const projected = project(raw.x, raw.y, raw.z);
      return {
        ...hub,
        projX: projected.x,
        projY: projected.y,
        rawX: raw.x,
        rawY: raw.y,
        rawZ: raw.z,
        z: projected.z,
      };
    });

    for (const [fromId, toId] of researchConnections) {
      const fromHub = projectedHubs.find((hub) => hub.id === fromId);
      const toHub = projectedHubs.find((hub) => hub.id === toId);
      if (fromHub && toHub) drawArc(project, radius, fromHub, toHub);
    }

    const pulseT = (Date.now() % 1200) / 1200;
    for (const hub of projectedHubs) {
      const isFront = hub.z <= radius * 0.2;
      const isWestlake = hub.id === "westlake";
      const opacity = isFront ? 1 : 0.25;

      ctx.beginPath();
      ctx.arc(hub.projX, hub.projY, isWestlake ? 4.2 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isWestlake ? "rgba(185, 154, 69, 0.98)" : `rgba(32, 36, 44, ${0.64 * opacity})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(hub.projX, hub.projY, isWestlake ? 9 + pulseT * 7 : 6, 0, Math.PI * 2);
      ctx.strokeStyle = isWestlake
        ? `rgba(185, 154, 69, ${0.58 * (1 - pulseT)})`
        : `rgba(32, 36, 44, ${0.22 * opacity})`;
      ctx.lineWidth = isWestlake ? 1.1 : 0.8;
      ctx.stroke();

      if (!isFront) continue;

      ctx.font = "700 10px Inter, ui-sans-serif, sans-serif";
      const textX = hub.projX + 10;
      const textY = hub.projY + 4;
      const metrics = ctx.measureText(hub.label);
      ctx.fillStyle = "rgba(250, 248, 245, 0.72)";
      ctx.fillRect(textX - 3, textY - 11, metrics.width + 6, 15);
      ctx.fillStyle = isWestlake ? "#20242c" : "rgba(32, 36, 44, 0.64)";
      ctx.fillText(hub.label, textX, textY);
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(32, 36, 44, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx - radius * 0.12, cy - radius * 0.12, radius * 0.92, -Math.PI * 0.76, -Math.PI * 0.08);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    animationFrameId = requestAnimationFrame(render);
  };

  const handleMouseDown = (event) => {
    isDragging = true;
    canvas.style.cursor = "grabbing";
    const rect = canvas.getBoundingClientRect();
    previousMousePosition = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleMouseMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (isDragging) {
      const deltaX = mouseX - previousMousePosition.x;
      const deltaY = mouseY - previousMousePosition.y;
      velocityX = deltaX * 0.0032;
      velocityY = deltaY * 0.0032;
      rotationY += velocityX;
      rotationX += velocityY;
      previousMousePosition = { x: mouseX, y: mouseY };
      return;
    }

    const hovered = projectedHubs.some((hub) => {
      const distance = Math.sqrt((mouseX - hub.projX) ** 2 + (mouseY - hub.projY) ** 2);
      return hub.z <= 32 && distance < 14;
    });
    canvas.style.cursor = hovered ? "pointer" : "grab";
  };

  const handleMouseUp = () => {
    isDragging = false;
    canvas.style.cursor = "grab";
  };

  updateSize();
  const resizeObserver = new ResizeObserver(updateSize);
  resizeObserver.observe(container);
  render();

  canvas.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
}

async function loadStatus() {
  try {
    const response = await fetch("api/status", { cache: "no-store" });
    const data = await response.json();
    document.getElementById("latestVersion").textContent = data.latestVersion
      ? `最新版本 v${data.latestVersion}`
      : "暂无正式发布版本";
    document.getElementById("updatedAt").textContent = `更新于 ${formatDate(data.updatedAt)}`;
    document.getElementById("baseUrl").textContent = data.baseUrl;
    renderAssets(data.downloads);
    renderChannels(data.channels);
  } catch (error) {
    document.getElementById("latestVersion").textContent = "更新源暂不可用";
    document.getElementById("updatedAt").textContent = error instanceof Error ? error.message : "读取失败";
  }
}

initDownloadGlobe();
void loadStatus();
