const path = require("path");
const express = require("express");
const session = require("express-session");

const api = require("./routes");
const zaloApi = require("./zaloRoutes");
const fbApi = require("./fbRoutes");
const { requireLogin } = require("./auth");

function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === "production";

  // Render/Fly dung reverse proxy -> can tin header de cookie secure hoat dong
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "256kb" }));

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.use(
    session({
      name: "sid",
      secret: process.env.APP_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        maxAge: 7 * 24 * 3600 * 1000,
      },
    })
  );

  // Endpoint cho dich vu ping giu server khong ngu (UptimeRobot, cron-job.org)
  app.get("/healthz", (req, res) => {
    res.json({ ok: true, uptime: Math.floor(process.uptime()) });
  });

  app.use("/api/fb", fbApi);
  app.use("/api/zalo", zaloApi);
  app.use("/api", api);

  // Trang dashboard phai dang nhap moi xem duoc
  const PUBLIC = path.join(__dirname, "..", "public");
  app.get("/", (req, res) => {
    res.redirect(req.session?.userId ? "/dashboard.html" : "/login.html");
  });
  app.get("/dashboard.html", requireLogin, (req, res) => {
    res.sendFile(path.join(PUBLIC, "dashboard.html"));
  });

  app.use(express.static(PUBLIC, { index: false }));

  app.use((req, res) => res.status(404).send("Khong tim thay trang"));

  app.use((err, req, res, next) => {
    console.error("[web] loi:", err);
    res.status(500).json({ error: "Loi server" });
  });

  return app;
}

module.exports = { createApp };
