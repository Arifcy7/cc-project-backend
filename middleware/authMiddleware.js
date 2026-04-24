const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
 try {
  const header = req.header("Authorization");

  if (!header) {
   return res.status(401).json({ message: "No token, access denied" });
  }

  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  req.user = decoded;
  next();
 } catch (error) {
  res.status(401).json({ message: "Invalid token" });
 }
}

function requireAdmin(req, res, next) {
 if (!req.user) {
  return res.status(401).json({ message: "No token, access denied" });
 }

 if (req.user.role !== "admin") {
  return res.status(403).json({ message: "Admin access required" });
 }

 next();
}

authMiddleware.requireAdmin = requireAdmin;

module.exports = authMiddleware;