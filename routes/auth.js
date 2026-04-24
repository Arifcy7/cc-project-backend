const express = require("express");
const router = express.Router();

const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


//Register
router.post("/register", async (req, res) => {
 try {
  const { name, MID, password } = req.body;

  if (!name || !MID || !password) {
   return res.status(400).json({ message: "Name, Moodle ID and password are required" });
  }

  if (!/^\d{8}$/.test(MID)) {
   return res.status(400).json({ message: "Invalid Moodle ID" });
  }

  if (password.length < 6) {
   return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const email = `${MID}@apsit.edu.in`;
  const existingUser = await User.findOne({ $or: [{ MID }, { email }] });

  if (existingUser) {
   return res.status(409).json({ message: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({
   name: name.trim(),
   MID,
   email,
   password: hashedPassword
  });

  await user.save();

  res.status(201).json({ message: "User registered. Wait for admin to approve." });
 } catch (error) {
  res.status(500).json({ message: "Registration failed", error: error.message });
 }
});


//Login
router.post("/login", async (req, res) => {
 try {
  const { email, password } = req.body;

  if (!email || !password) {
   return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await User.findOne({email});

  if(!user) {
   return res.status(400).json({message: "User not found"});
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if(!isMatch) {
   return res.status(400).json({message: "Incorrect password"});
  }

  if(!user.isApproved) {
   return res.status(403).json({message: "User not approved by admin yet"});
  }

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

  res.json({
   token,
   user: {
    id: user._id,
    name: user.name,
    MID: user.MID,
    role: user.role
   }
  });
 } catch (error) {
  res.status(500).json({ message: "Login failed", error: error.message });
 }
});


module.exports = router;