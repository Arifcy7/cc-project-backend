const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const postRoutes = require("./routes/posts");
const commentRoutes = require("./routes/comments");
const User = require("./models/User");

dotenv.config();

const app = express();
const frontendPath = path.join(__dirname, "..", "frontend");
const corsOrigins = (process.env.CORS_ORIGIN || "")
 .split(",")
 .map(origin => origin.trim())
 .filter(Boolean);

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
 cors({
  origin: corsOrigins.length ? corsOrigins : true
 })
);

app.use(express.static(frontendPath));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/comments", commentRoutes);

app.get("/api/health", (req, res) => {
 res.json({ status: "ok", service: "cloud-forum-api" });
});

app.use((req, res, next) => {
 if (req.originalUrl.startsWith("/api/")) {
  return next();
 }

 if (req.method !== "GET" && req.method !== "HEAD") {
  return next();
 }

 res.sendFile(path.join(frontendPath, "index.html"));
});

const startServer = async () => {
 try {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");

  const hashedPassword = await bcrypt.hash("admin123", 10);

  await User.findOneAndUpdate(
   { MID: "12345678" },
   {
    name: "Admin User",
    email: "12345678@apsit.edu.in",
    password: hashedPassword,
    isApproved: true,
    role: "admin"
   },
   { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log("Default admin ready: MID 12345678, password admin123");

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`);
  });
 } catch (error) {
  console.error("Failed to start server:", error);
  process.exit(1);
 }
};

startServer();