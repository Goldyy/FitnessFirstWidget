// =======================================
// AI Fitness Widget
// =======================================

const VERSION = "1.0.0";

const fm = FileManager.local();
const CACHE_DIR = fm.joinPath(fm.documentsDirectory(), "ai-fitness-widget-cache");
if (!fm.fileExists(CACHE_DIR)) fm.createDirectory(CACHE_DIR);

const STUDIOS = await fetchWithCache({
    url: "https://raw.githubusercontent.com/goldyy/FitnessFirstWidget/refs/heads/feature/add-ai-fitness-widget/assets/ai-fitness.json",
    key: "studios",
    type: "json"
});
const STUDIO_ID = args.widgetParameter || "1239136210";
const SELECTED_STUDIO = STUDIOS.find(s => s.studio_id === STUDIO_ID);

const URL_UTILIZATION = `https://www.ai-fitness.de/connect/v1/studio/${STUDIO_ID}/utilization`;

// ---------- Constants ----------
const WIDTH = 220;
const HEIGHT = 80;
const GAP = 4;
const COLORS = {
    current: new Color("#e30613"),
    future: Color.lightGray(),
    past: Color.darkGray(),
    grayText: Color.gray(),
    low: Color.gray(),
    normal: Color.yellow(),
    high: new Color("#e30613"),
};

// ---------- Fetch ----------
async function fetchJSON(url) {
    const req = new Request(url);
    req.headers = { "Accept": "application/json" };
    return await req.loadJSON();
}

// ---------- Helpers ----------
const barColor = (item) =>
    item.isCurrent ? COLORS.current : item.isFuture ? COLORS.future : COLORS.past;

const levelLabel = (level) => {
    switch (level.toLowerCase()) {
        case "low":
            return "Niedrig";
        case "normal":
            return "Normal";
        case "high":
            return "Hoch";
        default:
            return "Unbekannt";
    }
};

const levelColor = (level) => {
    switch (level.toLowerCase()) {
        case "low":
            return COLORS.low;
        case "normal":
            return COLORS.normal;
        case "high":
            return COLORS.high;
        default:
            return Color.grayText();
    }
};

const formatTime = (t) => t?.split(":").slice(0, 2).join(":") ?? "--:--";

// ---------- Cache Helpers ----------
function cachePaths(key) {
    return {
        data: fm.joinPath(CACHE_DIR, `${key}.data`),
        meta: fm.joinPath(CACHE_DIR, `${key}.meta.json`)
    };
}

async function fetchWithCache({ url, key, type = "json" }) {
    const { data, meta } = cachePaths(key);

    let headers = {};
    if (fm.fileExists(meta)) {
        const metaData = JSON.parse(fm.readString(meta));
        if (metaData.etag) headers["If-None-Match"] = metaData.etag;
        if (metaData.lastModified) headers["If-Modified-Since"] = metaData.lastModified;
    }

    try {
        const req = new Request(url);
        req.headers = headers;
        req.method = "GET";

        if (type === "json") {
            const res = await req.load();
            if (req.response.statusCode === 304 && fm.fileExists(data)) {
                return JSON.parse(fm.readString(data));
            }

            fm.writeString(data, res.toRawString());
            fm.writeString(meta, JSON.stringify({
                etag: req.response.headers["ETag"],
                lastModified: req.response.headers["Last-Modified"],
                cachedAt: Date.now()
            }));
            return JSON.parse(res.toRawString());
        }

        if (type === "image") {
            const img = await req.loadImage();
            fm.writeImage(data, img);
            fm.writeString(meta, JSON.stringify({
                etag: req.response.headers["ETag"],
                lastModified: req.response.headers["Last-Modified"],
                cachedAt: Date.now()
            }));
            return img;
        }
    } catch (err) {
        if (fm.fileExists(data)) {
            if (type === "json") return JSON.parse(fm.readString(data));
            if (type === "image") return fm.readImage(data);
        }
        throw err;
    }
}

// ---------- Bar Chart ----------
function drawBarChart(items, opening, closing) {
    const ctx = new DrawContext();
    ctx.size = new Size(WIDTH, HEIGHT + 16);
    ctx.opaque = false;
    ctx.respectScreenScale = true;

    const barWidth = (WIDTH - GAP * items.length) / items.length;

    items.forEach((item, i) => {
        const h = Math.min(Math.max(item.percentage, 0), 100) / 100 * HEIGHT;
        const x = i * (barWidth + GAP);
        const y = HEIGHT - h;
        ctx.setFillColor(barColor(item));
        ctx.fillRect(new Rect(x, y, barWidth, h));
    });

    ctx.setFont(Font.systemFont(8));
    ctx.setTextColor(COLORS.grayText);

    ctx.setTextAlignedLeft();
    ctx.drawText(formatTime(opening), new Point(2, HEIGHT + 2));

    ctx.setTextAlignedRight();
    ctx.drawText(formatTime(closing), new Point(WIDTH - 25, HEIGHT + 2));

    return ctx.getImage();
}

// ---------- Widget ----------
async function createWidget() {
    const widget = new ListWidget();
    widget.setPadding(12, 12, 12, 12);

    // ---------- Fetch data ----------
    let utilizationData;
    try {
        utilizationData = await fetchWithCache({
            url: URL_UTILIZATION,
            key: `utilization_${STUDIO_ID}`,
            type: "json"
        });
    } catch (e) {
        const errorText = widget.addText("⚠️ Load error");
        errorText.textColor = Color.red();
        const errorDetail = widget.addText(e.toString());
        errorDetail.font = Font.systemFont(10);
        errorDetail.textColor = COLORS.grayText;
        return widget;
    }

    const items = utilizationData?.items ?? [];
    const open = utilizationData?.startTime;
    const close = utilizationData?.endTime;
    
    // Find current item and mark future items
    const currentIndex = items.findIndex((i) => i.isCurrent);
    const current = currentIndex >= 0 ? items[currentIndex] : null;
    
    // Mark items as past, current, or future
    const forecastItems = items.map((item, idx) => ({
        ...item,
        isFuture: idx > currentIndex,
        isPast: idx < currentIndex
    }));

    // ---------- Header ----------
    const header = widget.addStack();
    header.layoutHorizontally();
    header.centerAlignContent();

    // Header Left
    const headerLeft = header.addStack();
    headerLeft.layoutVertically();
    headerLeft.spacing = 2;
    headerLeft.addSpacer(10);

    const studioText = headerLeft.addText(SELECTED_STUDIO?.name || "Unbekanntes Studio");
    studioText.font = Font.boldSystemFont(14);
    studioText.textColor = Color.white();

    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    const formattedTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const openingHoursText = headerLeft.addText(`Öffnungszeiten: ${formatTime(open)} - ${formatTime(close)}`);
    openingHoursText.font = Font.mediumSystemFont(12);
    openingHoursText.textColor = COLORS.grayText;

    const updated = headerLeft.addText(`Aktualisiert: ${formattedTime}`);
    updated.font = Font.mediumSystemFont(12);
    updated.textColor = COLORS.grayText;

    widget.addSpacer(8);

    // ---------- Body ----------
    const body = widget.addStack();
    body.layoutHorizontally();
    body.spacing = 12;

    // LEFT: CURRENT
    const left = body.addStack();
    left.layoutVertically();
    left.centerAlignContent();

    left.addSpacer(4);

    if (current) {
        const percent = left.addText(`${current.percentage}%`);
        percent.font = Font.boldSystemFont(36);
        percent.textColor = Color.white();

        const level = left.addText(levelLabel(current.level));
        level.font = Font.systemFont(12);
        level.textColor = levelColor(current.level);
    } else {
        left.addText("--");
        const closedText = left.addText("Aktuell geschlossen");
        closedText.font = Font.mediumSystemFont(12);
        closedText.textColor = COLORS.grayText;
    }

    // RIGHT: FORECAST
    const right = body.addStack();
    right.layoutVertically();
    right.centerAlignContent();

    right.addSpacer(2);

    if (forecastItems.length > 0) {
        const chartImage = drawBarChart(forecastItems, open, close);
        const chart = right.addImage(chartImage);
        chart.imageSize = new Size(WIDTH, HEIGHT);
    }

    // ---------- Background ----------
    const gradient = new LinearGradient();
    gradient.colors = [new Color("#1c1c1e"), new Color("#2c2c2e")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;

    return widget;
}

// ---------- Run ----------
const widget = await createWidget();

if (config.runsInWidget) {
    Script.setWidget(widget);
} else {
    widget.presentMedium();
}

Script.complete();
