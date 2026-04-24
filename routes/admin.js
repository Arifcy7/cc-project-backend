const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = authMiddleware.requireAdmin;
const User = require("../models/User");


//GET all users (protected)
router.get("/users", authMiddleware, requireAdmin, async (req, res) => {
 const users = await User.find().select("-password").sort({ createdAt: -1 });
 res.json(users);
});


// APPROVE user
router.put("/approve/:id", authMiddleware, requireAdmin, async (req, res) => {
 const user = await User.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true }).select("-password");

 if (!user) {
  return res.status(404).json({ message: "User not found" });
 }

 res.json({ message: "User approved", user });
});


// DELETE user
router.delete("/remove/:id", authMiddleware, requireAdmin, async (req, res) => {
 const user = await User.findByIdAndDelete(req.params.id);

 if (!user) {
  return res.status(404).json({ message: "User not found" });
 }

 res.json({message: "User removed"});
});


module.exports = router;