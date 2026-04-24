const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
 name: { type: String, required: true, trim: true },
 MID: { type: String, required: true, unique: true, match: [/^\d{8}$/, "Moodle ID must be exactly 8 digits"] },
 email: { type: String, required: true, unique: true, trim: true, lowercase: true },
 password: { type: String, required: true },
 isApproved: { type: Boolean, default: false },
 role: { type: String, enum: ["student", "admin"], default: "student" }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);